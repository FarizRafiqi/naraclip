import fs from 'node:fs'
import path from 'node:path'

const [slug, ...titleParts] = process.argv.slice(2)
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: node renderer/tools/new-content.mjs <lowercase-slug> [content title]')
  process.exit(1)
}

const renderer = path.resolve(import.meta.dirname, '..')
const project = path.join(renderer, 'content', slug)
if (fs.existsSync(project)) {
  console.error('Content folder already exists: ' + path.relative(renderer, project))
  process.exit(1)
}

const title = titleParts.join(' ').trim() || slug.replaceAll('-', ' ')
const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const folders = [
  'assets/audio/source/voice',
  'assets/audio/source/music',
  'assets/audio/source/sfx',
  'assets/audio/processed/voice',
  'assets/audio/processed/music',
  'assets/audio/processed/sfx',
  'assets/audio/archive',
  'assets/visuals/source/background',
  'assets/visuals/source/characters',
  'assets/visuals/source/props',
  'assets/visuals/generated/background',
  'data',
  'scripts',
  'previews',
  'exports',
]

fs.mkdirSync(project, { recursive: false })
for (const folder of folders) {
  const destination = path.join(project, folder)
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, '.gitkeep'), '')
}

const readme = [
  '# ' + title,
  '',
  '- Slug: ' + slug,
  '- Status: persiapan',
  '- Format awal: 1080 × 1920, 30 fps; sesuaikan dengan brief.',
  '- Brief/spec: tambahkan tautan dokumen di sini.',
  '- Sumber audio dan visual: letakkan di assets/*/source/; simpan hasil edit/generasi di processed/ atau generated/.',
  '- Lisensi dan kredit publikasi: catat tautan serta perubahan di sini atau di dekat aset sumber.',
  '',
  'Catat urutan audio aktual, timing akhir, keputusan revisi, versi export, dan hasil QC sebelum menetapkan exports/final.mp4. Ikuti docs/video-production-playbook.md di root repo.',
  '',
].join('\n')
fs.writeFileSync(path.join(project, 'README.md'), readme)

const composition = [
  '<!doctype html>',
  '<html lang="id">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <meta name="viewport" content="width=1080,height=1920" />',
  '    <title>' + escapeHtml(title) + '</title>',
  '    <style>',
  '      * { box-sizing: border-box; margin: 0; }',
  '      html, body, #root { width: 1080px; height: 1920px; overflow: hidden; }',
  '      #root { position: relative; background: #171310; }',
  '    </style>',
  '  </head>',
  '  <body>',
  '    <main id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="1080" data-height="1920" data-fps="30"></main>',
  '  </body>',
  '</html>',
  '',
].join('\n')
fs.writeFileSync(path.join(project, 'composition.html'), composition)

console.log('Created renderer/content/' + slug + '/')
console.log(
  'Add the script, assets, and timing data there; activate its composition only when ready to render.'
)
