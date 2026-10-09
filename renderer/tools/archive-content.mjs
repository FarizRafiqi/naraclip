// Archive a finished video workspace so only the final result stays open.
//   node renderer/tools/archive-content.mjs <slug> [--shorts-dir <dir>] [--prune]
// 1. copies final master (+ .srt, README, description) to <shorts-dir>/05_export
// 2. packs everything non-rebuildable into <shorts-dir>/archive/<slug>-src.tar.xz (symlinks stay links)
// 3. verifies the archive (list + sha256) and writes a restore note
// 4. with --prune (only after step 3 passed): deletes rebuildable folders from the workspace
// Restore: node renderer/tools/restore-content.mjs <slug> [--shorts-dir <dir>]
// xz is used because zstd is not installed (sudo needed); swap to `tar --zstd` once available.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
if (!slug) throw new Error('usage: archive-content.mjs <slug> [--shorts-dir dir] [--prune]')
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const prune = args.includes('--prune')
const root = path.resolve(import.meta.dirname, '../..')
const content = path.join(root, 'renderer/content', slug)
if (!fs.existsSync(content)) throw new Error(`no workspace: ${content}`)

const SHORTS = '/mnt/d/Projects/Shorts'
const shortsDir =
  flag('--shorts-dir') ??
  path.join(SHORTS, fs.readdirSync(SHORTS).find((d) => new RegExp(`^\\d+_${slug}$`).test(d)) ?? (() => { throw new Error('shorts dir not found; pass --shorts-dir') })())
const exportDir = path.join(shortsDir, '05_export')
const archiveDir = path.join(shortsDir, 'archive')
fs.mkdirSync(exportDir, { recursive: true })
fs.mkdirSync(archiveDir, { recursive: true })

const sh = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28 })
const rel = (p) => path.relative(content, p)

// 1. final deliverables
const finalLink = path.join(content, 'exports/final.mp4')
if (!fs.existsSync(finalLink)) throw new Error('exports/final.mp4 missing — nothing to keep')
const finalReal = fs.realpathSync(finalLink)
sh('/home/farizrafiqi/.local/bin/ffmpeg', ['-v', 'error', '-i', finalReal, '-f', 'null', '-']) // throws if not decodable
const keep = [finalReal, ...fs.readdirSync(path.join(content, 'exports')).filter((f) => f.endsWith('.srt')).map((f) => path.join(content, 'exports', f))]
for (const f of keep) fs.copyFileSync(f, path.join(exportDir, path.basename(f)))
fs.copyFileSync(path.join(content, 'README.md'), path.join(exportDir, 'README.md'))
console.log('final ->', exportDir, keep.map((f) => path.basename(f)).join(', '))

// 2. archive (everything except rebuildable + final/exports + the archive's own output)
const EXCLUDE = ['previews', 'exports', 'assets/visuals/processed', 'assets/audio/processed', 'assets/visuals/generated/background', 'node_modules']
const tarPath = path.join(archiveDir, `${slug}-src.tar.xz`)
sh('tar', ['-C', path.join(root, 'renderer/content'), '-cJf', tarPath, ...EXCLUDE.map((e) => `--exclude=${slug}/${e}`), '--exclude-vcs', slug])
const list = sh('tar', ['-tJf', tarPath]).trim().split('\n')
const sha = createHash('sha256').update(fs.readFileSync(tarPath)).digest('hex')
fs.writeFileSync(`${tarPath}.sha256`, `${sha}  ${path.basename(tarPath)}\n`)
const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1)
console.log(`archive ${tarPath} ${mb(tarPath)} MB, ${list.length} entries, sha256 ${sha.slice(0, 12)}…`)
fs.writeFileSync(
  path.join(archiveDir, 'RESTORE.md'),
  `# Restore ${slug}\n\n\`node renderer/tools/restore-content.mjs ${slug}\`\n\nThen rebuild derived files:\n1. \`uv run --python 3.13 --with numpy,scipy,pillow python renderer/content/${slug}/scripts/prep_visuals.py\`\n2. \`node renderer/content/${slug}/scripts/build-pedas.mjs\` (the build script for this slug)\n3. render + master as in the video README.\n\nSymlinks inside the archive point at ${shortsDir}; keep that folder in place.\n`
)

// 3. prune
const freed = []
if (prune) {
  if (!list.some((l) => l.endsWith('composition.html')) || !list.some((l) => l.includes('/scripts/'))) throw new Error('archive looks incomplete; refusing to prune')
  const del = [
    'previews',
    'assets/visuals/processed',
    'assets/audio/processed',
    'assets/visuals/generated/background',
    ...fs.readdirSync(path.join(content, 'exports')).filter((f) => f !== path.basename(finalReal) && f !== 'final.mp4' && !f.endsWith('.srt')).map((f) => `exports/${f}`),
  ]
  for (const d of del) {
    const p = path.join(content, d)
    if (!fs.existsSync(p)) continue
    const size = Number(sh('du', ['-sk', p]).split('\t')[0]) / 1024
    fs.rmSync(p, { recursive: true, force: true })
    freed.push(`${d} ${size.toFixed(0)} MB`)
  }
  console.log('pruned:', freed.join('; '))
} else {
  console.log('dry: pass --prune to delete rebuildable folders (previews, processed, old exports)')
}
console.log('workspace now', sh('du', ['-shL', '--exclude=assets/visuals/source', content]).split('\t')[0])
