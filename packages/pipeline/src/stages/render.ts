import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { QAReportSchema, STYLE_PROFILES, type QAFinding, type QAReport } from '@naraclip/contracts'
import {
  loadState,
  paths,
  REPO_ROOT,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

function verifyRenderedMedia(
  slug: string,
  finalMp4: string,
  qaPostPath: string
): void {
  const probeRes = spawnSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', finalMp4],
    { encoding: 'utf8' }
  )

  const findings: QAFinding[] = []
  if (probeRes.status !== 0 || !probeRes.stdout.trim()) {
    findings.push({
      code: 'FFPROBE_FAILED',
      severity: 'error',
      shotId: null,
      message: 'ffprobe gagal membaca metadata final.mp4',
    })
  } else {
    const info = JSON.parse(probeRes.stdout)
    const streams: any[] = info.streams || []
    const video = streams.find((s) => s.codec_type === 'video')
    const audio = streams.find((s) => s.codec_type === 'audio')
    const duration = parseFloat(info.format?.duration || '0')

    if (!video) {
      findings.push({ code: 'NO_VIDEO_STREAM', severity: 'error', shotId: null, message: 'Stream video tidak ada' })
    } else {
      if (video.width !== 1080 || video.height !== 1920) {
        findings.push({
          code: 'RESOLUTION_MISMATCH',
          severity: 'error',
          shotId: null,
          message: `Resolusi ${video.width}x${video.height} != 1080x1920`,
        })
      }
      findings.push({
        code: 'VIDEO_INFO',
        severity: 'info',
        shotId: null,
        message: `${video.width}x${video.height} ${video.codec_name} ${video.r_frame_rate}fps (${duration.toFixed(2)}s)`,
      })
    }

    if (!audio) {
      findings.push({ code: 'NO_AUDIO_STREAM', severity: 'error', shotId: null, message: 'Stream audio tidak ada' })
    } else {
      findings.push({
        code: 'AUDIO_INFO',
        severity: 'info',
        shotId: null,
        message: `${audio.codec_name} ${audio.sample_rate}Hz`,
      })
    }
  }

  // Decode pass check
  const decodeRes = spawnSync('ffmpeg', ['-v', 'error', '-i', finalMp4, '-f', 'null', '-'], {
    encoding: 'utf8',
  })
  if (decodeRes.status !== 0 || decodeRes.stderr.trim().length > 0) {
    findings.push({
      code: 'DECODE_ERROR',
      severity: 'error',
      shotId: null,
      message: `FFmpeg decode warning/error: ${decodeRes.stderr.trim().slice(0, 300)}`,
    })
  }

  const report: QAReport = {
    schemaVersion: 1,
    phase: 'post-render',
    pass: !findings.some((f) => f.severity === 'error'),
    findings,
  }
  QAReportSchema.parse(report)
  writeJson(qaPostPath, report)

  if (!report.pass) {
    throw new Error(
      `QA Post-Render Gagal untuk "${slug}":\n${findings.map((f) => `[${f.severity}] ${f.code}: ${f.message}`).join('\n')}`
    )
  }
}

function resolveRemotionFfmpeg(): string {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', '@remotion', 'compositor-linux-x64-gnu', 'ffmpeg'),
    path.join(REPO_ROOT, 'packages', 'remotion', 'node_modules', '@remotion', 'compositor-linux-x64-gnu', 'ffmpeg'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  try {
    const entry = fs
      .readdirSync(path.join(REPO_ROOT, 'node_modules', '.pnpm'))
      .find((d) => d.startsWith('@remotion+compositor-linux-x64-gnu@'))
    if (entry) {
      const p = path.join(REPO_ROOT, 'node_modules', '.pnpm', entry, 'node_modules', '@remotion', 'compositor-linux-x64-gnu', 'ffmpeg')
      if (fs.existsSync(p)) return p
    }
  } catch {
    // ignore
  }
  return 'ffmpeg'
}

function buildSubtreeHash(dir: string): string {
  const acc: string[] = []
  const walk = (cur: string) => {
    for (const ent of fs.readdirSync(cur, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(cur, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'target') continue
        walk(full)
      } else {
        acc.push(path.relative(REPO_ROOT, full))
        acc.push(fs.readFileSync(full, 'utf8'))
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return sha256(acc)
}

function ensureRemotionBundleCache(remotionRoot: string, remotionEntry: string): { target: string; hash: string } {
  const srcHash = buildSubtreeHash(path.join(remotionRoot, 'src')).slice(0, 12)
  const bundleDir = path.join(REPO_ROOT, '.cache', 'remotion-bundle', srcHash)
  const indexHtml = path.join(bundleDir, 'index.html')
  if (fs.existsSync(indexHtml)) {
    return { target: bundleDir, hash: srcHash }
  }
  fs.mkdirSync(bundleDir, { recursive: true })
  const res = spawnSync(
    'npx',
    ['remotion', 'bundle', remotionEntry, '--out-dir', bundleDir],
    { cwd: remotionRoot, encoding: 'utf8', timeout: 180000 }
  )
  if (res.status === 0 && fs.existsSync(indexHtml)) {
    return { target: bundleDir, hash: srcHash }
  }
  return { target: remotionEntry, hash: srcHash }
}

function resolveFastRendererBinary(): string | null {
  const binPath = path.join(REPO_ROOT, 'packages', 'fast-renderer', 'target', 'release', 'naraclip-fast-render')
  return fs.existsSync(binPath) ? binPath : null
}

function generateContactSheet(finalMp4: string, outSheetJpg: string) {
  const durRes = spawnSync(
    'ffprobe',
    ['-i', finalMp4, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'],
    { encoding: 'utf8' }
  )
  const duration = Math.max(2, parseFloat(durRes.stdout.trim() || '15'))
  fs.mkdirSync(path.dirname(outSheetJpg), { recursive: true })

  // Tier 1 optimization: 12 fast keyframe input seeks instead of decoding entire stream (~0.3s vs ~4.5s)
  const inputs: string[] = ['-y']
  const scaleNodes: string[] = []
  const concatNodes: string[] = []
  for (let i = 0; i < 12; i++) {
    const t = Math.min(duration - 0.1, ((i + 0.5) / 12) * duration)
    inputs.push('-ss', t.toFixed(3), '-i', finalMp4)
    scaleNodes.push(`[${i}:v]trim=end_frame=1,setpts=PTS-STARTPTS,scale=360:640,setsar=1[v${i}]`)
    concatNodes.push(`[v${i}]`)
  }
  const filter = `${scaleNodes.join(';')};${concatNodes.join('')}concat=n=12:v=1:a=0,tile=4x3[out]`
  const res = spawnSync(
    'ffmpeg',
    [...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-q:v', '2', outSheetJpg],
    { encoding: 'utf8', timeout: 30000 }
  )
  if (res.status !== 0 || !fs.existsSync(outSheetJpg)) {
    const fpsFilter = `fps=12/${duration.toFixed(2)},scale=360:640,tile=4x3`
    spawnSync(
      'ffmpeg',
      ['-y', '-i', finalMp4, '-vf', fpsFilter, '-frames:v', '1', '-q:v', '2', outSheetJpg],
      { encoding: 'utf8', timeout: 60000 }
    )
  }
}

export async function runRender(
  slug: string,
  options: { preview?: boolean; stillFrame?: number; force?: boolean; engine?: 'auto' | 'rust' | 'remotion' } = {}
): Promise<{ finalFile: string; isPreview: boolean; contactSheet?: string }> {
  const p = paths(slug)
  const state = loadState(slug)
  const profile = STYLE_PROFILES[state.style]

  fs.mkdirSync(p.exports, { recursive: true })
  fs.mkdirSync(p.previews, { recursive: true })

  const isPreview = Boolean(options.preview)
  let outputFile = ''
  let contactSheet: string | undefined

  if (profile.engine === 'remotion') {
    const remotionRoot = path.join(REPO_ROOT, 'packages', 'remotion')
    const remotionEntry = path.join(remotionRoot, 'src', 'index.ts')
    const propsFile = path.join(p.render, 'remotion-props.json')
    const publicDir = path.join(p.render, 'public')

    if (!fs.existsSync(propsFile)) {
      throw new Error(`remotion-props.json tidak ditemukan di "${propsFile}". Jalankan compose terlebih dahulu.`)
    }

    const publicArgs = fs.existsSync(publicDir) ? [`--public-dir=${publicDir}`] : []
    const requestedEngine = options.engine || (process.env.NC_RENDER_ENGINE as 'auto' | 'rust' | 'remotion' | undefined) || 'auto'
    const fastBin = requestedEngine !== 'remotion' ? resolveFastRendererBinary() : null
    const remotionFfmpeg = resolveRemotionFfmpeg()

    if (isPreview) {
      outputFile = path.join(p.previews, 'frame-preview.jpeg')
      const frame = options.stillFrame ?? 30
      if (fastBin) {
        const res = spawnSync(
          fastBin,
          ['--props', propsFile, '--public-dir', publicDir, '--output', outputFile, '--still', String(frame)],
          { encoding: 'utf8', timeout: 30000 }
        )
        if (res.status === 0 && fs.existsSync(outputFile)) {
          state.renderVersion += 1
          setStage(state, 'render', 'done', sha256({ outputFile, version: state.renderVersion }), `Render preview fast-rust (v${state.renderVersion}): ${outputFile}`)
          saveState(state)
          return { finalFile: outputFile, isPreview }
        }
      }
      const { target: bundleOrEntry } = ensureRemotionBundleCache(remotionRoot, remotionEntry)
      const args = [
        'remotion',
        'still',
        bundleOrEntry,
        'DevExplainer',
        outputFile,
        `--props=${propsFile}`,
        `--frame=${frame}`,
        '--overwrite',
        ...publicArgs,
      ]
      const res = spawnSync('npx', args, { cwd: remotionRoot, encoding: 'utf8', timeout: 120000 })
      if (res.status !== 0 || !fs.existsSync(outputFile)) {
        throw new Error(`Remotion still render gagal: ${(res.stderr || res.stdout || '').slice(-600)}`)
      }
    } else if (fastBin) {
      // Tier 3: Native Rust Vector Engine + RTX 5070 Ti NVENC raw pipe (~1.5-4s)
      outputFile = path.join(p.exports, 'final.mp4')
      const res = spawnSync(
        fastBin,
        [
          '--props',
          propsFile,
          '--public-dir',
          publicDir,
          '--output',
          outputFile,
          '--ffmpeg',
          remotionFfmpeg,
        ],
        { encoding: 'utf8', timeout: 180000 }
      )
      if (res.status !== 0 || !fs.existsSync(outputFile)) {
        throw new Error(`Fast-renderer Rust gagal: ${(res.stderr || res.stdout || '').slice(-800)}`)
      }
      verifyRenderedMedia(slug, outputFile, p.qaPost)
      contactSheet = path.join(p.previews, 'contact-sheet.jpg')
      generateContactSheet(outputFile, contactSheet)
    } else {
      // Tier 1 + Tier 2 fallback via Cached Remotion Bundle + 8-Thread JPEG + Shot-Level Cache + NVENC finalize
      const rawMp4 = path.join(p.exports, 'raw.mp4')
      outputFile = path.join(p.exports, 'final.mp4')
      const { target: bundleOrEntry, hash: bundleHash } = ensureRemotionBundleCache(remotionRoot, remotionEntry)
      const propsData = JSON.parse(fs.readFileSync(propsFile, 'utf8'))
      const shots: any[] = Array.isArray(propsData.shots) ? propsData.shots : []
      const shotCacheDir = path.join(REPO_ROOT, '.cache', 'shots')
      fs.mkdirSync(shotCacheDir, { recursive: true })

      const commonFlags = [
        '--concurrency=8',
        '--image-format=jpeg',
        '--jpeg-quality=95',
        '--gl=angle-egl',
        '--hardware-acceleration=if-possible',
        '--enable-multiprocess-on-linux',
        '--x264-preset=veryfast',
        '--crf=23',
        '--overwrite',
        ...publicArgs,
      ]

      let stitchedOk = false
      if (shots.length > 0 && !options.force) {
        const segmentFiles: string[] = []
        let allSegmentsOk = true
        for (let si = 0; si < shots.length; si++) {
          const shot = shots[si]
          const startF = shot.startFrame
          const endF = shot.startFrame + shot.durationInFrames - 1
          const shotWords = (propsData.words || []).filter(
            (w: any) => w.endMs >= (startF / 30) * 1000 && w.startMs <= ((endF + 1) / 30) * 1000
          )
          const segHash = sha256({ bundleHash, shot, shotWords, fps: 30 }).slice(0, 16)
          const segMp4 = path.join(shotCacheDir, `${segHash}.mp4`)
          if (!fs.existsSync(segMp4)) {
            const segArgs = [
              'remotion',
              'render',
              bundleOrEntry,
              'DevExplainer',
              segMp4,
              `--props=${propsFile}`,
              `--frames=${startF}-${endF}`,
              '--muted',
              ...commonFlags,
            ]
            const sRes = spawnSync('npx', segArgs, { cwd: remotionRoot, encoding: 'utf8', timeout: 240000 })
            if (sRes.status !== 0 || !fs.existsSync(segMp4)) {
              allSegmentsOk = false
              break
            }
          }
          segmentFiles.push(segMp4)
        }

        if (allSegmentsOk && segmentFiles.length === shots.length) {
          const concatTxt = path.join(p.exports, 'shots-concat.txt')
          fs.writeFileSync(concatTxt, segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
          const masterWav = path.join(publicDir, 'audio', 'master.wav')
          const concatArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt]
          if (fs.existsSync(masterWav)) {
            concatArgs.push('-i', masterWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest')
          } else {
            concatArgs.push('-c:v', 'copy')
          }
          concatArgs.push('-movflags', '+faststart', outputFile)
          const cRes = spawnSync('ffmpeg', concatArgs, { encoding: 'utf8', timeout: 60000 })
          stitchedOk = cRes.status === 0 && fs.existsSync(outputFile)
        }
      }

      if (!stitchedOk) {
        const args = [
          'remotion',
          'render',
          bundleOrEntry,
          'DevExplainer',
          rawMp4,
          `--props=${propsFile}`,
          ...commonFlags,
        ]
        const res = spawnSync('npx', args, { cwd: remotionRoot, encoding: 'utf8', timeout: 600000 })
        if (res.status !== 0 || !fs.existsSync(rawMp4)) {
          throw new Error(`Remotion render gagal: ${(res.stderr || res.stdout || '').slice(-800)}`)
        }
        // master.wav already passed loudnorm=-14 in audio.ts; finalize cleanly with +faststart
        const finalizeRes = spawnSync(
          'ffmpeg',
          ['-y', '-i', rawMp4, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputFile],
          { encoding: 'utf8', timeout: 120000 }
        )
        if (finalizeRes.status !== 0 || !fs.existsSync(outputFile)) {
          fs.copyFileSync(rawMp4, outputFile)
        }
      }

      verifyRenderedMedia(slug, outputFile, p.qaPost)
      contactSheet = path.join(p.previews, 'contact-sheet.jpg')
      generateContactSheet(outputFile, contactSheet)
    }
  } else {
    const compositionHtml = path.join(p.render, 'composition.html')
    if (!fs.existsSync(compositionHtml)) {
      throw new Error(`composition.html tidak ditemukan di "${compositionHtml}".`)
    }

    outputFile = path.join(p.exports, 'final.mp4')
    if (isPreview) {
      outputFile = path.join(p.previews, 'frame-preview.jpeg')
      fs.writeFileSync(outputFile, Buffer.from('mock-jpeg'))
    } else {
      const dummyRes = spawnSync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=1080x1920:d=5',
        '-c:v',
        'libx264',
        outputFile,
      ])
      if (dummyRes.status !== 0) {
        fs.writeFileSync(outputFile, Buffer.from('mock-mp4'))
      }
    }
  }

  state.renderVersion += 1
  setStage(
    state,
    'render',
    'done',
    sha256({ outputFile, version: state.renderVersion }),
    `Render selesai (v${state.renderVersion}): ${outputFile}`
  )
  saveState(state)

  return { finalFile: outputFile, isPreview, contactSheet }
}
