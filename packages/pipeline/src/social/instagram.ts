import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getSocialTokenStorePath, readSocialTokens } from './youtube.js'

export type StoredInstagramToken = {
  platform: 'instagram'
  pageId: string
  pageName: string
  pageAccessToken: string
  instagramBusinessAccountId: string
  accountHandle: string
  accountName: string
  accessToken: string
  userAccessToken?: string
  expiresAt?: number
  scopes: string[]
  updatedAt: string
}

export function getStoredInstagramToken(): StoredInstagramToken | null {
  const store = readSocialTokens()
  const ig = store.accounts?.instagram as StoredInstagramToken | undefined
  if (!ig || !ig.accessToken || !ig.instagramBusinessAccountId) {
    return null
  }
  return ig
}

export type InstagramReelUploadInput = {
  videoPath: string
  caption: string
  coverUrl?: string
}

export type InstagramReelUploadResult = {
  mediaId: string
  permalink: string
  caption: string
  raw: Record<string, unknown>
}

export async function uploadInstagramReel(
  input: InstagramReelUploadInput
): Promise<InstagramReelUploadResult> {
  const token = getStoredInstagramToken()
  if (!token) {
    throw new Error(
      'Kredensial Instagram belum ditemukan di secrets/social-tokens.json. Harap hubungkan akun Instagram terlebih dahulu.'
    )
  }

  if (!fs.existsSync(input.videoPath)) {
    throw new Error(`File video tidak ditemukan di: ${input.videoPath}`)
  }

  const tmpNormalized = path.join(
    os.tmpdir(),
    `ig_norm_${Date.now()}_${path.basename(input.videoPath)}`
  )
  let effectiveVideoPath = input.videoPath
  try {
    const res = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        input.videoPath,
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-level',
        '4.0',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-g',
        '60',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        tmpNormalized,
      ],
      { stdio: 'ignore' }
    )
    if (res.status === 0 && fs.existsSync(tmpNormalized) && fs.statSync(tmpNormalized).size > 1000) {
      effectiveVideoPath = tmpNormalized
    }
  } catch {
    // fallback ke file original jika ffmpeg normalization gagal
  }

  let videoBytes: Buffer
  try {
    videoBytes = fs.readFileSync(effectiveVideoPath)
  } finally {
    if (effectiveVideoPath === tmpNormalized) {
      fs.rmSync(tmpNormalized, { force: true })
    }
  }

  const igUserId = token.instagramBusinessAccountId
  const accessToken = token.pageAccessToken || token.accessToken

  console.log(`\n▶ [Instagram] Menginisialisasi Reels container untuk @${token.accountHandle}...`)

  // Langkah 1: Inisialisasi container resumable upload
  const initParams = new URLSearchParams({
    media_type: 'REELS',
    upload_type: 'resumable',
    caption: input.caption,
    share_to_feed: 'true',
    access_token: accessToken,
  })

  const initRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: initParams.toString(),
  })

  const initData: any = await initRes.json()
  if (!initRes.ok || !initData?.id || !initData?.uri) {
    throw new Error(
      `Inisialisasi Reels container gagal (${initRes.status}): ${JSON.stringify(initData)}`
    )
  }

  const containerId = String(initData.id)
  const uploadUri = String(initData.uri)
  console.log(`  ✓ Container dibuat (ID: ${containerId}). Mengunggah video binary (${(videoBytes.length / (1024 * 1024)).toFixed(2)} MB)...`)

  // Langkah 2: Upload video binary ke rupload.facebook.com
  const uploadRes = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_size: String(videoBytes.length),
      offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: videoBytes as unknown as BodyInit,
  })

  const uploadResult: any = await uploadRes.json()
  if (!uploadRes.ok || uploadResult?.success === false) {
    throw new Error(`Upload video binary gagal: ${JSON.stringify(uploadResult)}`)
  }

  console.log(`  ✓ Binary terunggah. Memproses video di server Meta...`)

  // Langkah 3: Polling status pemrosesan video hingga FINISHED
  let attempts = 0
  const maxAttempts = 40 // maks ~120 detik
  let isReady = false

  while (attempts < maxAttempts) {
    attempts++
    await new Promise((r) => setTimeout(r, 3000))

    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    )
    const statusData: any = await statusRes.json()
    const code = statusData?.status_code

    if (code === 'FINISHED') {
      isReady = true
      console.log(`  ✓ Video selesai diproses oleh Meta (status: FINISHED).`)
      break
    } else if (code === 'ERROR') {
      throw new Error(`Meta gagal memproses video container: ${JSON.stringify(statusData)}`)
    } else {
      process.stdout.write(`  ⏳ Memproses... (${attempts * 3}s)\r`)
    }
  }

  if (!isReady) {
    throw new Error('Timeout: Video belum selesai diproses oleh Meta setelah 120 detik.')
  }

  // Langkah 4: Publikasi container ke feed Reels
  console.log(`▶ [Instagram] Mempublikasikan Reels...`)
  const publishParams = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  })

  const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishParams.toString(),
  })

  const pubData: any = await pubRes.json()
  if (!pubRes.ok || !pubData?.id) {
    throw new Error(`Publikasi Reels gagal (${pubRes.status}): ${JSON.stringify(pubData)}`)
  }

  const mediaId = String(pubData.id)

  // Langkah 5: Ambil permalink Reels
  let permalink = `https://www.instagram.com/reel/`
  try {
    const infoRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=id,permalink&access_token=${accessToken}`
    )
    if (infoRes.ok) {
      const infoData: any = await infoRes.json()
      if (infoData?.permalink) {
        permalink = infoData.permalink
      }
    }
  } catch {
    // Abaikan jika info belum segera tersedia
  }

  return {
    mediaId,
    permalink,
    caption: input.caption,
    raw: { initData, pubData },
  }
}
