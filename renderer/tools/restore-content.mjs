// Restore an archived workspace: node renderer/tools/restore-content.mjs <slug> [--shorts-dir dir] [--into dir]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
if (!slug) throw new Error('usage: restore-content.mjs <slug> [--shorts-dir dir] [--into dir]')
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const root = path.resolve(import.meta.dirname, '../..')
const SHORTS = '/mnt/d/Projects/Shorts'
const shortsDir = flag('--shorts-dir') ?? path.join(SHORTS, fs.readdirSync(SHORTS).find((d) => new RegExp(`^\\d+_${slug}$`).test(d)))
const tarPath = path.join(shortsDir, 'archive', `${slug}-src.tar.xz`)
const expected = fs.readFileSync(`${tarPath}.sha256`, 'utf8').split(/\s+/)[0]
const actual = createHash('sha256').update(fs.readFileSync(tarPath)).digest('hex')
if (expected !== actual) throw new Error('archive checksum mismatch')
const into = flag('--into') ?? path.join(root, 'renderer/content')
if (!flag('--into') && fs.existsSync(path.join(into, slug, 'composition.html'))) throw new Error(`${slug} already exists in workspace; use --into <dir> to extract elsewhere`)
fs.mkdirSync(into, { recursive: true })
execFileSync('tar', ['-C', into, '-xJf', tarPath])
console.log(`restored ${slug} -> ${path.join(into, slug)}\nnext: see ${path.join(shortsDir, 'archive/RESTORE.md')}`)
