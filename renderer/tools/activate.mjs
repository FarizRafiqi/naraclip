import fs from 'node:fs'
import path from 'node:path'

const rendererDir = path.resolve(import.meta.dirname, '..')
const targetSlug = process.argv[2]

const defaultHtmlContent = `<!doctype html>
<html lang="en" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #000;
      }
      body {
        font-family: 'Inter', sans-serif;
      }
      code,
      pre,
      .monospace {
        font-family: 'JetBrains Mono', monospace;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="10"
      data-width="1080"
      data-height="1920"
    >
      <!--
        Add your clips here. Example:
        <div id="title" class="clip" data-start="0" data-duration="5" data-track-index="1"
             style="font-size: 64px; color: #fff; padding: 40px">
          Hello World
        </div>
      -->
    </div>

    <script>
      window.__timelines = window.__timelines || {}
      const tl = gsap.timeline({ paused: true })
      // Example: tl.from("#title", { opacity: 0, y: -50, duration: 1 }, 0);
      window.__timelines['main'] = tl
    </script>
  </body>
</html>
`

const indexHtmlPath = path.join(rendererDir, 'index.html')

if (!targetSlug || targetSlug === '--help') {
  console.log('Usage:')
  console.log('  node renderer/tools/activate.mjs <slug>    Aktifkan konten untuk Studio preview')
  console.log('  node renderer/tools/activate.mjs --reset   Kembalikan ke template kosong')
  console.log('\nKonten yang tersedia:')
  const contentDir = path.join(rendererDir, 'content')
  if (fs.existsSync(contentDir)) {
    const items = fs.readdirSync(contentDir, { withFileTypes: true })
    for (const item of items) {
      if (item.isDirectory()) {
        console.log(`  - ${item.name}`)
      }
    }
  }
  process.exit(0)
}

if (targetSlug === '--reset') {
  try {
    fs.unlinkSync(indexHtmlPath)
  } catch {}
  fs.writeFileSync(indexHtmlPath, defaultHtmlContent, 'utf-8')
  console.log('✅ renderer/index.html telah direset ke template default.')
  process.exit(0)
}

const compositionPath = path.join(rendererDir, 'content', targetSlug, 'composition.html')
if (!fs.existsSync(compositionPath)) {
  console.error(`❌ Komposisi tidak ditemukan: content/${targetSlug}/composition.html`)
  process.exit(1)
}

try {
  fs.unlinkSync(indexHtmlPath)
} catch {}

const relativeTarget = path.join('content', targetSlug, 'composition.html')
fs.symlinkSync(relativeTarget, indexHtmlPath)

console.log(`\n🎬 Konten aktif untuk HyperFrames Studio: [${targetSlug}]`)
console.log(`👉 Buka dashboard: http://localhost:3002/#project/renderer`)
console.log(`💡 Untuk mereset: node renderer/tools/activate.mjs --reset\n`)
