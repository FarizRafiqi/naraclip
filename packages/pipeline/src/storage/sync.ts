import fs from 'node:fs'
import path from 'node:path'
import { PipelineStorageClient } from './client.js'
import {
  detectMimeType,
  optimizeAudioToFlac,
  optimizeImageToWebp,
  sha256File,
  type OptimizedAsset,
} from './optimizer.js'
import { REPO_ROOT } from '../workspace.js'

export type WorkspaceInfo = {
  slug: string
  channel: 'channel-1' | 'channel-2'
  workspaceDir: string
}

export function resolveWorkspace(slug: string, explicitChannel?: string): WorkspaceInfo {
  const c1Dir = path.join(REPO_ROOT, 'packages', 'hyperframes', 'content', slug)
  const c2Dir = path.join(REPO_ROOT, 'content', slug)

  if (explicitChannel === 'channel-1' || explicitChannel === '1') {
    if (!fs.existsSync(c1Dir)) throw new Error(`Channel 1 workspace tidak ditemukan: ${c1Dir}`)
    return { slug, channel: 'channel-1', workspaceDir: c1Dir }
  }
  if (explicitChannel === 'channel-2' || explicitChannel === '2') {
    if (!fs.existsSync(c2Dir)) throw new Error(`Channel 2 workspace tidak ditemukan: ${c2Dir}`)
    return { slug, channel: 'channel-2', workspaceDir: c2Dir }
  }

  if (fs.existsSync(c1Dir)) {
    return { slug, channel: 'channel-1', workspaceDir: c1Dir }
  }
  if (fs.existsSync(c2Dir)) {
    return { slug, channel: 'channel-2', workspaceDir: c2Dir }
  }

  throw new Error(`Workspace "${slug}" tidak ditemukan di Channel 1 (${c1Dir}) maupun Channel 2 (${c2Dir}).`)
}

export function listAllWorkspaces(): WorkspaceInfo[] {
  const list: WorkspaceInfo[] = []

  const c1Base = path.join(REPO_ROOT, 'packages', 'hyperframes', 'content')
  if (fs.existsSync(c1Base)) {
    for (const e of fs.readdirSync(c1Base, { withFileTypes: true })) {
      if (e.isDirectory()) {
        list.push({ slug: e.name, channel: 'channel-1', workspaceDir: path.join(c1Base, e.name) })
      }
    }
  }

  const c2Base = path.join(REPO_ROOT, 'content')
  if (fs.existsSync(c2Base)) {
    for (const e of fs.readdirSync(c2Base, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        list.push({ slug: e.name, channel: 'channel-2', workspaceDir: path.join(c2Base, e.name) })
      }
    }
  }

  return list
}

export type StorageManifest = {
  slug: string
  channel: string
  syncedAt: string
  totalOriginalBytes: number
  totalCompressedBytes: number
  compressionPercent: number
  driver: string
  endpoint: string
  bucket: string
  assets: Array<{
    sourcePath: string
    storageKey: string
    originalMime: string
    compressedMime: string
    originalBytes: number
    compressedBytes: number
    checksumSha256: string
    url: string
  }>
}

export async function pushWorkspaceAssets(
  slug: string,
  options: { channel?: string; pruneDrafts?: boolean } = {}
): Promise<StorageManifest> {
  const ws = resolveWorkspace(slug, options.channel)
  const client = new PipelineStorageClient()
  await client.ensureBucket()

  const tempOptimizedDir = path.join(ws.workspaceDir, '.cache', 'storage-opt')
  fs.mkdirSync(tempOptimizedDir, { recursive: true })

  // 1. Scan all workspace files
  const filesToProcess: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(full)
          if (stat.isDirectory()) continue
        } catch {
          continue
        }
      }
      if (entry.isDirectory()) {
        walk(full)
      } else {
        filesToProcess.push(full)
      }
    }
  }
  walk(ws.workspaceDir)

  // 2. Identify and optionally prune redundant draft exports (v1..v6.mp4 if final.mp4 exists)
  const exportFiles = filesToProcess.filter((f) => f.includes('/exports/'))
  const hasFinalMp4 = exportFiles.some((f) => path.basename(f) === 'final.mp4' || path.basename(f) === `${slug}.mp4`)
  const prunedFiles = new Set<string>()

  if (hasFinalMp4 && options.pruneDrafts !== false) {
    for (const f of exportFiles) {
      const base = path.basename(f)
      if (base.match(/^v\d+\.mp4$/i) || base === 'raw.mp4') {
        prunedFiles.add(f)
      }
    }
  }

  const activeFiles = filesToProcess.filter((f) => !prunedFiles.has(f))
  const assets: OptimizedAsset[] = []

  let totalOriginal = 0
  let totalCompressed = 0

  for (const srcFile of activeFiles) {
    const rel = path.relative(ws.workspaceDir, srcFile)
    const ext = path.extname(srcFile).toLowerCase()
    const origSize = fs.statSync(srcFile).size
    totalOriginal += origSize

    let optPath = srcFile
    let targetRel = rel
    let compMime = detectMimeType(srcFile)
    let isOpt = false

    // Compress WAV -> FLAC
    if (ext === '.wav' && origSize > 4096) {
      const flacRel = rel.replace(/\.wav$/i, '.flac')
      const targetFlac = path.join(tempOptimizedDir, flacRel)
      if (optimizeAudioToFlac(srcFile, targetFlac)) {
        optPath = targetFlac
        targetRel = flacRel
        compMime = 'audio/flac'
        isOpt = true
      }
    }

    // Compress PNG -> WebP (lossless alpha for cutouts/props)
    if (ext === '.png' && origSize > 4096) {
      const webpRel = rel.replace(/\.png$/i, '.webp')
      const targetWebp = path.join(tempOptimizedDir, webpRel)
      if (optimizeImageToWebp(srcFile, targetWebp, true)) {
        optPath = targetWebp
        targetRel = webpRel
        compMime = 'image/webp'
        isOpt = true
      }
    }

    const compSize = fs.statSync(optPath).size
    totalCompressed += compSize
    const sha = sha256File(optPath)

    assets.push({
      sourceRelPath: rel,
      targetRelPath: targetRel,
      sourceAbsolutePath: srcFile,
      optimizedAbsolutePath: optPath,
      originalMime: detectMimeType(srcFile),
      compressedMime: compMime,
      originalBytes: origSize,
      compressedBytes: compSize,
      checksumSha256: sha,
      isOptimized: isOpt,
    })
  }

  // 3. Upload to SeaweedFS S3
  const manifestAssets: StorageManifest['assets'] = []
  for (const a of assets) {
    const storageKey = `${ws.channel}/${ws.slug}/${a.targetRelPath}`
    const buf = fs.readFileSync(a.optimizedAbsolutePath)
    await client.put(storageKey, buf, a.compressedMime, {
      'checksum-sha256': a.checksumSha256,
      'original-path': a.sourceRelPath,
      'workspace-slug': ws.slug,
      channel: ws.channel,
    })

    manifestAssets.push({
      sourcePath: a.sourceRelPath,
      storageKey,
      originalMime: a.originalMime,
      compressedMime: a.compressedMime,
      originalBytes: a.originalBytes,
      compressedBytes: a.compressedBytes,
      checksumSha256: a.checksumSha256,
      url: client.getDirectUrl(storageKey),
    })
  }

  // 4. Build manifest and save locally and in S3
  const savingPct = totalOriginal > 0 ? ((totalOriginal - totalCompressed) / totalOriginal) * 100 : 0
  const manifest: StorageManifest = {
    slug: ws.slug,
    channel: ws.channel,
    syncedAt: new Date().toISOString(),
    totalOriginalBytes: totalOriginal,
    totalCompressedBytes: totalCompressed,
    compressionPercent: Number(savingPct.toFixed(1)),
    driver: client.driver,
    endpoint: client.getDirectUrl('').replace(new RegExp(`/${client.bucket}/$`), ''),
    bucket: client.bucket,
    assets: manifestAssets,
  }

  const manifestJson = JSON.stringify(manifest, null, 2)
  const localManifestFile = path.join(ws.workspaceDir, 'storage-manifest.json')
  fs.writeFileSync(localManifestFile, manifestJson)

  // Upload manifest to S3
  const manifestKey = `${ws.channel}/${ws.slug}/storage-manifest.json`
  await client.put(manifestKey, Buffer.from(manifestJson), 'application/json', {
    'workspace-slug': ws.slug,
    channel: ws.channel,
  })

  // 5. Clean up pruned files if requested
  if (prunedFiles.size > 0) {
    for (const pf of prunedFiles) {
      if (fs.existsSync(pf)) fs.unlinkSync(pf)
    }
  }

  // Clean up temporary optimization folder
  try {
    fs.rmSync(tempOptimizedDir, { recursive: true, force: true })
  } catch {}

  return manifest
}

export async function pullWorkspaceAssets(slug: string, explicitChannel?: string): Promise<number> {
  const ws = resolveWorkspace(slug, explicitChannel)
  const client = new PipelineStorageClient()

  const prefix = `${ws.channel}/${ws.slug}/`
  const keys = await client.list(prefix)
  if (keys.length === 0) {
    throw new Error(`Tidak ada aset di storage untuk "${prefix}"`)
  }

  let pulled = 0
  for (const key of keys) {
    const rel = key.slice(prefix.length)
    if (!rel) continue
    const targetFile = path.join(ws.workspaceDir, rel)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    const { body } = await client.get(key)
    fs.writeFileSync(targetFile, body)
    pulled++
  }

  return pulled
}
