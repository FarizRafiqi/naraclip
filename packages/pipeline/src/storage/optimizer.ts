import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type OptimizedAsset = {
  sourceRelPath: string
  targetRelPath: string
  sourceAbsolutePath: string
  optimizedAbsolutePath: string
  originalMime: string
  compressedMime: string
  originalBytes: number
  compressedBytes: number
  checksumSha256: string
  isOptimized: boolean
}

export function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function optimizeAudioToFlac(inputWav: string, outputFlac: string): boolean {
  fs.mkdirSync(path.dirname(outputFlac), { recursive: true })
  const res = spawnSync(
    'ffmpeg',
    ['-y', '-i', inputWav, '-c:a', 'flac', '-compression_level', '8', outputFlac],
    { encoding: 'utf8', timeout: 60000 }
  )
  return res.status === 0 && fs.existsSync(outputFlac) && fs.statSync(outputFlac).size > 100
}

export function optimizeImageToWebp(inputImg: string, outputWebp: string, lossless = true): boolean {
  fs.mkdirSync(path.dirname(outputWebp), { recursive: true })
  const args = lossless
    ? ['-y', '-i', inputImg, '-c:v', 'libwebp', '-lossless', '1', outputWebp]
    : ['-y', '-i', inputImg, '-c:v', 'libwebp', '-q:v', '90', outputWebp]

  const res = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 60000 })
  return res.status === 0 && fs.existsSync(outputWebp) && fs.statSync(outputWebp).size > 100
}

export function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.flac':
      return 'audio/flac'
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    case '.webp':
      return 'image/webp'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.mp4':
      return 'video/mp4'
    case '.json':
      return 'application/json'
    case '.html':
      return 'text/html'
    case '.md':
      return 'text/markdown'
    case '.js':
    case '.mjs':
      return 'application/javascript'
    default:
      return 'application/octet-stream'
  }
}
