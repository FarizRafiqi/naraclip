import { spawn, execSync } from 'node:child_process'
import path from 'node:path'

const rootDir = process.cwd()
const rendererDir = path.join(rootDir, 'renderer')

async function checkMinio() {
  try {
    const res = await fetch('http://127.0.0.1:9000/minio/health/live', {
      signal: AbortSignal.timeout(800),
    })
    return res.ok
  } catch {
    return false
  }
}

async function ensureMinio() {
  if (await checkMinio()) return true
  try {
    execSync('docker compose up -d minio', { stdio: 'ignore' })
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (await checkMinio()) return true
    }
  } catch {}
  return false
}

const minioActive = await ensureMinio()

console.log('\n' + '='.repeat(64))
console.log(' 🎬 NaraClip Dev Environment — App & HyperFrames Studio')
console.log('='.repeat(64))
console.log(' 🌐 Web App (AdonisJS + Inertia) : http://localhost:3333')
console.log(' 🎨 Studio UI (HyperFrames)      : http://localhost:3002/#project/renderer')
if (minioActive) {
  console.log(' 📦 MinIO S3 Storage (API)       : http://localhost:9000')
  console.log(' 🎛️  MinIO Web Console (GUI)      : http://localhost:9001')
} else {
  console.log(' ⚠️  MinIO Storage               : Offline (jalankan "docker compose up -d minio")')
}
console.log('='.repeat(64) + '\n')

// 1. Jalankan AdonisJS app (node ace serve --hmr)
const appProcess = spawn(process.execPath, ['ace', 'serve', '--hmr'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
})

// 2. Jalankan HyperFrames Studio di renderer/
const studioProcess = spawn('npx', ['--no-install', 'hyperframes', 'preview', '--no-open'], {
  cwd: rendererDir,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
})

const cleanup = (code = 0) => {
  console.log('\n🛑 Menghentikan server NaraClip & HyperFrames Studio...')
  try {
    appProcess.kill('SIGINT')
  } catch {}
  try {
    studioProcess.kill('SIGINT')
  } catch {}
  process.exit(code)
}

process.on('SIGINT', () => cleanup(0))
process.on('SIGTERM', () => cleanup(0))

appProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`App process exited with code ${code}`)
  }
  cleanup(code || 0)
})

studioProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Studio process exited with code ${code}`)
  }
})
