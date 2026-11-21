import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  GATE_IDS,
  PipelineStateSchema,
  STAGE_IDS,
  STYLE_PROFILES,
  type GateId,
  type PipelineState,
  type PipelineStyle,
  type StageId,
} from '@naraclip/contracts'

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
export const CONTENT_ROOT = process.env.NC_CONTENT_ROOT ?? path.join(REPO_ROOT, 'content')

export function paths(slug: string) {
  const dir = path.join(CONTENT_ROOT, slug)
  return {
    dir,
    idea: path.join(dir, 'idea.md'),
    state: path.join(dir, 'pipeline.json'),
    brief: path.join(dir, 'brief.json'),
    script: path.join(dir, 'script.json'),
    storyboard: path.join(dir, 'storyboard.json'),
    assetPlan: path.join(dir, 'assets.plan.json'),
    assetManifest: path.join(dir, 'assets.manifest.json'),
    assetsGenerated: path.join(dir, 'assets', 'generated'),
    assetsEvidence: path.join(dir, 'assets', 'evidence'),
    assetPrompts: path.join(dir, 'assets', 'PROMPTS.md'),
    voiceDir: path.join(dir, 'voice'),
    voiceSourceDir: path.join(dir, 'voice', 'source'),
    voiceWav: path.join(dir, 'voice', 'voice.wav'),
    recordingScript: path.join(dir, 'voice', 'recording-script.md'),
    timing: path.join(dir, 'timing.json'),
    qaPre: path.join(dir, 'qa.pre-render.json'),
    qaPost: path.join(dir, 'qa.post-render.json'),
    render: path.join(dir, 'render'),
    exports: path.join(dir, 'exports'),
    previews: path.join(dir, 'previews'),
    release: path.join(dir, 'release.json'),
    publish: path.join(dir, 'publish.md'),
    publishJson: path.join(dir, 'publish.json'),
  }
}
export type Paths = ReturnType<typeof paths>

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

export function exists(file: string) {
  return fs.existsSync(file)
}

export function sha256(input: string | Buffer | unknown): string {
  const data = typeof input === 'string' || Buffer.isBuffer(input) ? input : JSON.stringify(input)
  return createHash('sha256').update(data).digest('hex')
}

export function fileHash(file: string): string | null {
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null
}

export function initState(slug: string, style: PipelineStyle): PipelineState {
  const profile = STYLE_PROFILES[style]
  const stages = {} as PipelineState['stages']
  for (const id of STAGE_IDS) {
    stages[id] = {
      status: profile.skipStages.includes(id) ? 'skipped' : 'pending',
      inputHash: null,
      updatedAt: null,
      note: null,
    }
  }
  const gates = {} as PipelineState['gates']
  for (const g of GATE_IDS) gates[g] = { approvedAt: null }
  return { schemaVersion: 1, slug, style, stages, gates, renderVersion: 0 }
}

export function loadState(slug: string): PipelineState {
  const file = paths(slug).state
  if (!fs.existsSync(file)) throw new Error(`Workspace tidak ditemukan: ${file}. Jalankan: nc new "<ide>" --style <style>`)
  return PipelineStateSchema.parse(readJson(file))
}

export function saveState(state: PipelineState) {
  writeJson(paths(state.slug).state, state)
}

export function setStage(
  state: PipelineState,
  stage: StageId,
  status: PipelineState['stages'][StageId]['status'],
  inputHash: string | null,
  note: string | null = null
) {
  state.stages[stage] = { status, inputHash, updatedAt: new Date().toISOString(), note }
}

export function resetGate(state: PipelineState, gate: GateId) {
  state.gates[gate] = { approvedAt: null }
}

/** Slug: huruf kecil, angka, strip. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function log(message: string) {
  console.log(message)
}
