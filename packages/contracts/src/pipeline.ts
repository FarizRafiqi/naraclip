import { z } from 'zod'

/**
 * Pipeline contracts: idea -> brief -> script -> storyboard -> assets -> voice -> compose -> qa -> render.
 *
 * Skema "Llm*" dipakai sebagai output terstruktur LLM (semua field wajib; opsional = nullable agar kompatibel dengan
 * strict JSON schema). Skema artefak menambahkan field yang diisi kode (slug, style, versi), bukan LLM.
 */

const T = z.string().trim().min(1)

export const PIPELINE_STYLES = ['vinconium', 'dev-explainer'] as const
export const StyleSchema = z.enum(PIPELINE_STYLES)
export type PipelineStyle = z.infer<typeof StyleSchema>

export const VoiceSourceSchema = z.enum(['recording', 'tts'])
export type VoiceSource = z.infer<typeof VoiceSourceSchema>

export const STAGE_IDS = [
  'brief',
  'script',
  'storyboard',
  'assets',
  'voice',
  'compose',
  'qa',
  'render',
  'publish',
] as const
export const StageIdSchema = z.enum(STAGE_IDS)
export type StageId = z.infer<typeof StageIdSchema>

export const GATE_IDS = ['script', 'storyboard', 'assets'] as const
export type GateId = (typeof GATE_IDS)[number]

export type StyleProfile = {
  engine: 'hyperframes' | 'remotion'
  voiceSource: VoiceSource
  gates: readonly GateId[]
  /** stage yang dilewati untuk style ini */
  skipStages: readonly StageId[]
}

/** Channel 1 (vinconium): suara rekaman sendiri + gambar AI. Channel 2 (dev-explainer): TTS + 100% kode/SVG. */
export const STYLE_PROFILES: Record<PipelineStyle, StyleProfile> = {
  vinconium: {
    engine: 'hyperframes',
    voiceSource: 'recording',
    gates: ['script', 'storyboard', 'assets'],
    skipStages: [],
  },
  'dev-explainer': {
    engine: 'remotion',
    voiceSource: 'tts',
    gates: ['script', 'storyboard'],
    skipStages: ['assets'],
  },
}

export const RECIPES = {
  'dev-explainer': ['kinetic-title', 'code', 'terminal', 'custom-svg', 'stat-callout'],
  vinconium: [
    'bg-plate',
    'char-pose',
    'prop-popin',
    'label-callout',
    'evidence-card',
    'kinetic-title',
    'stat-callout',
  ],
} as const satisfies Record<PipelineStyle, readonly string[]>

export const RecipeSchema = z.enum([
  'kinetic-title',
  'code',
  'terminal',
  'custom-svg',
  'stat-callout',
  'bg-plate',
  'char-pose',
  'prop-popin',
  'label-callout',
  'evidence-card',
])
export type Recipe = z.infer<typeof RecipeSchema>

/** Recipe yang wajib punya assetId (gambar dari asset plan). */
export const ASSET_RECIPES: readonly Recipe[] = [
  'bg-plate',
  'char-pose',
  'prop-popin',
  'evidence-card',
]

export const MotionSchema = z.enum([
  'pop',
  'slide-up',
  'slide-left',
  'push-in',
  'pull-out',
  'fade',
  'none',
])
export const SfxSchema = z.enum([
  'none',
  // Claude Web Audio SFX: Transisi
  'whoosh',
  'whooshUp',
  'whooshDown',
  'swipe',
  'slideIn',
  'riser',
  'reverseSwell',
  'sweepHigh',
  // Claude Web Audio SFX: UI
  'pop',
  'click',
  'tick',
  'tap',
  'toggleOn',
  'toggleOff',
  'bubble',
  'hover',
  'select',
  'swish',
  // Claude Web Audio SFX: Impact
  'hit',
  'softHit',
  'boom',
  'slam',
  'punch',
  'stamp',
  'cymbal',
  // Claude Web Audio SFX: Notifikasi
  'ding',
  'bell',
  'chime',
  'success',
  'error',
  'warning',
  'notify',
  'coin',
  'levelUp',
  'okay',
  // Claude Web Audio SFX: Teks & Data
  'typewriter',
  'keyClick',
  'counter',
  'blip',
  'dataStream',
  'barGrow',
  // Claude Web Audio SFX: Sci-fi & Glitch
  'glitch',
  'laser',
  'zap',
  'powerUp',
  'powerDown',
  'scan',
  'beep',
  'sonar',
  'alarm',
  // Claude Web Audio SFX: Lain-lain
  'shutter',
  'sparkle',
  'drip',
  'heartbeat',
  'shimmer',
  'wind',
  // Legacy kebab-case aliases mapped to Claude Web Audio presets
  'key-click',
  'enter-thock',
  'thud-heavy',
  'clank-lock',
  'crate-wood',
  'whoosh-fast',
  'whoosh-slow',
  'pop-rise',
  'tick-rise',
  'ratchet-decel',
  'chime-ok',
  'buzz-error',
  'glass-crack',
  'water-bed',
  'ship-horn',
  'power-down',
  'crumple',
  'relay-click',
  'power-on-riser',
])
export type SfxName = z.infer<typeof SfxSchema>

/* ------------------------------ brief ------------------------------ */

export const ClaimSchema = z
  .object({
    id: T.max(20),
    text: T.max(300),
    sourceUrl: z.string().max(300).nullable(),
  })
  .strict()

export const BriefLlmSchema = z
  .object({
    title: T.max(120),
    audience: T.max(160),
    tone: z.enum(['curious', 'serious', 'playful', 'deadpan', 'urgent']),
    targetDurationSec: z.number().int().min(15).max(90),
    hook: T.max(300),
    takeaway: T.max(400),
    claims: z.array(ClaimSchema).min(1).max(8),
  })
  .strict()

export const BriefSchema = z
  .object({
    ...BriefLlmSchema.shape,
    schemaVersion: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    idea: T.max(500),
    style: StyleSchema,
    voiceSource: VoiceSourceSchema,
    language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  })
  .strict()

/* ------------------------------ script ----------------------------- */

export const BeatSchema = z
  .object({
    id: T.max(20),
    narration: T.max(420),
    claimIds: z.array(T.max(20)).max(4),
    onScreenText: z.string().max(80).nullable(),
  })
  .strict()

export const ScriptLlmSchema = z
  .object({ beats: z.array(BeatSchema).min(3).max(12) })
  .strict()

export const ScriptSchema = z
  .object({ schemaVersion: z.literal(1), beats: ScriptLlmSchema.shape.beats })
  .strict()

/* ---------------------------- storyboard --------------------------- */

export const TerminalLineSchema = z
  .object({ cmd: T.max(120), output: z.string().max(160).nullable() })
  .strict()

export const HighlightStepSchema = z
  .object({
    line: z.number().int().min(1),
    atMs: z.number().int().min(0),
  })
  .strict()

export const ShotCueSchema = z
  .object({
    id: T.max(40),
    atMs: z.number().int().min(0),
    sfx: SfxSchema.optional(),
    label: z.string().max(80).optional(),
  })
  .strict()

export const CameraKeyframeSchema = z
  .object({
    atMs: z.number().int().min(0),
    x: z.number().min(-600).max(600).default(0),
    y: z.number().min(-600).max(600).default(0),
    scale: z.number().min(0.6).max(2.2).default(1),
  })
  .strict()

export const TransitionInSchema = z.enum(['ink-wipe', 'slide-push', 'stamp-cut', 'none'])

export const CodeAnnotationSchema = z
  .object({
    line: z.number().int().min(1),
    text: z.string().max(60),
    atMs: z.number().int().min(0),
  })
  .strict()

export const ShotSchema = z
  .object({
    id: T.max(20),
    beatId: T.max(20),
    recipe: RecipeSchema,
    headline: z.string().max(90).nullable(),
    body: z.string().max(220).nullable(),
    code: z.string().max(700).nullable(),
    terminal: z.array(TerminalLineSchema).max(4).nullable(),
    /** markup SVG inline untuk recipe custom-svg atau pendamping code/terminal */
    svg: z.string().max(16000).nullable(),
    assetId: z.string().max(40).nullable(),
    motion: MotionSchema,
    sfx: SfxSchema,
    emphasis: z.array(z.string().max(30)).max(4),
    /** opsional: jadwal sorot baris kode (1-indexed) dalam ms dari awal shot */
    highlightSteps: z.array(HighlightStepSchema).max(12).optional(),
    /** opsional: titik aksi (animasi + SFX) terikat timestamp ms relatif awal shot */
    cues: z.array(ShotCueSchema).max(24).optional(),
    /** opsional: keyframe kamera (pan/zoom) relatif awal shot */
    camera: z.array(CameraKeyframeSchema).max(12).optional(),
    /** opsional: gaya transisi masuk antar shot */
    transitionIn: TransitionInSchema.optional(),
    /** opsional: anotasi pinggir per baris untuk shot bertipe code */
    annotations: z.array(CodeAnnotationSchema).max(12).optional(),
    /** bobot porsi durasi dalam beat-nya (durasi sebenarnya dihitung dari timing suara) */
    weight: z.number().int().min(1).max(10),
  })
  .strict()

export const StoryboardLlmSchema = z
  .object({ shots: z.array(ShotSchema).min(3).max(30) })
  .strict()

export const StoryboardSchema = z
  .object({ schemaVersion: z.literal(1), shots: StoryboardLlmSchema.shape.shots })
  .strict()

/* ------------------------------ assets ----------------------------- */

export const AssetKindSchema = z.enum(['image-ai', 'svg', 'evidence', 'video-loop'])

export const PlannedAssetSchema = z
  .object({
    id: T.max(40),
    kind: AssetKindSchema,
    prompt: z.string().max(1500).nullable(),
    background: z.enum(['white', 'gray', 'transparent', 'scene']),
    refs: z.array(T.max(40)).max(4),
    note: z.string().max(200).nullable(),
  })
  .strict()

export const AssetPlanLlmSchema = z
  .object({ assets: z.array(PlannedAssetSchema).max(40) })
  .strict()

export const AssetPlanSchema = z
  .object({ schemaVersion: z.literal(1), assets: AssetPlanLlmSchema.shape.assets })
  .strict()

export const AssetStatusSchema = z.enum(['planned', 'generated', 'approved', 'failed'])
export const AssetManifestEntrySchema = z
  .object({
    id: T,
    status: AssetStatusSchema,
    file: z.string().nullable(),
    backend: z.string().nullable(),
    license: z.string().nullable(),
    sha256: z.string().nullable(),
  })
  .strict()
export const AssetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(AssetManifestEntrySchema),
  })
  .strict()

/* ------------------------------ timing ----------------------------- */

export const WordTimingSchema = z
  .object({ word: z.string(), startMs: z.number().int().min(0), endMs: z.number().int().min(0) })
  .strict()

export const TimingSchema = z
  .object({
    schemaVersion: z.literal(1),
    voiceFile: T,
    durationMs: z.number().int().positive(),
    source: z.enum(['recording', 'tts', 'mock']),
    words: z.array(WordTimingSchema),
    beats: z.array(
      z.object({ beatId: T, startMs: z.number().int().min(0), endMs: z.number().int().positive() })
    ),
    shots: z.array(
      z.object({ shotId: T, startMs: z.number().int().min(0), endMs: z.number().int().positive() })
    ),
  })
  .strict()

/* -------------------------------- qa ------------------------------- */

export const QAFindingSchema = z
  .object({
    code: T,
    severity: z.enum(['error', 'warn', 'info']),
    shotId: z.string().nullable(),
    message: T,
  })
  .strict()

export const QAReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: z.enum(['pre-render', 'post-render']),
    pass: z.boolean(),
    findings: z.array(QAFindingSchema),
  })
  .strict()

/* ------------------------------ state ------------------------------ */

export const StageStatusSchema = z.enum(['pending', 'done', 'waiting', 'failed', 'skipped'])
export const StageStateSchema = z
  .object({
    status: StageStatusSchema,
    inputHash: z.string().nullable(),
    updatedAt: z.string().nullable(),
    note: z.string().nullable(),
  })
  .strict()

export const PipelineStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    slug: T,
    style: StyleSchema,
    stages: z.record(StageIdSchema, StageStateSchema),
    gates: z.record(z.enum(GATE_IDS), z.object({ approvedAt: z.string().nullable() }).strict()),
    renderVersion: z.number().int().min(0),
  })
  .strict()

export type Brief = z.infer<typeof BriefSchema>
export type BriefLlm = z.infer<typeof BriefLlmSchema>
export type Script = z.infer<typeof ScriptSchema>
export type ScriptLlm = z.infer<typeof ScriptLlmSchema>
export type Beat = z.infer<typeof BeatSchema>
export type Shot = z.infer<typeof ShotSchema>
export type ShotCue = z.infer<typeof ShotCueSchema>
export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>
export type TransitionIn = z.infer<typeof TransitionInSchema>
export type CodeAnnotation = z.infer<typeof CodeAnnotationSchema>
export type HighlightStep = z.infer<typeof HighlightStepSchema>
export type Storyboard = z.infer<typeof StoryboardSchema>
export type StoryboardLlm = z.infer<typeof StoryboardLlmSchema>
export type PlannedAsset = z.infer<typeof PlannedAssetSchema>
export type AssetPlan = z.infer<typeof AssetPlanSchema>
export type AssetPlanLlm = z.infer<typeof AssetPlanLlmSchema>
export type AssetManifest = z.infer<typeof AssetManifestSchema>
export type Timing = z.infer<typeof TimingSchema>
export type WordTiming = z.infer<typeof WordTimingSchema>
export type QAFinding = z.infer<typeof QAFindingSchema>
export type QAReport = z.infer<typeof QAReportSchema>
export type PipelineState = z.infer<typeof PipelineStateSchema>
export type StageState = z.infer<typeof StageStateSchema>

/* ---------------------------- validators --------------------------- */

/** Kecepatan baca narasi Indonesia untuk estimasi durasi (sama dengan estimator TTS deterministik). */
export const WORDS_PER_SECOND = 2.5

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function estimateSpeechSec(text: string): number {
  return countWords(text) / WORDS_PER_SECOND
}

export function containsHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value)
}

/** SVG buatan model: tanpa script, event handler, foreignObject, atau referensi eksternal. */
export function isSafeSvg(svg: string): boolean {
  if (!/^\s*<svg[\s>]/i.test(svg)) return false
  if (/<\s*(script|foreignObject|iframe|object|embed|image)\b/i.test(svg)) return false
  if (/\son[a-z]+\s*=/i.test(svg)) return false
  if (/(href|src)\s*=\s*["']\s*(?!#)/i.test(svg)) return false
  if (/javascript:/i.test(svg)) return false
  return true
}

export function validateScript(brief: Brief, script: Script): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  const claimIds = new Set(brief.claims.map((c) => c.id))
  const covered = new Set<string>()
  let totalWords = 0

  for (const beat of script.beats) {
    if (ids.has(beat.id)) issues.push(`beat id duplikat: ${beat.id}`)
    ids.add(beat.id)
    if (containsHtml(beat.narration)) issues.push(`beat ${beat.id}: narasi mengandung HTML`)
    for (const id of beat.claimIds) {
      if (!claimIds.has(id)) issues.push(`beat ${beat.id}: claim tidak dikenal ${id}`)
      covered.add(id)
    }
    totalWords += countWords(beat.narration)
  }
  for (const id of claimIds) {
    if (!covered.has(id)) issues.push(`claim ${id} tidak dipakai di naskah mana pun`)
  }

  const sec = totalWords / WORDS_PER_SECOND
  const min = brief.targetDurationSec * 0.7
  const max = brief.targetDurationSec * 1.3
  if (sec < min || sec > max) {
    issues.push(
      `estimasi durasi ${sec.toFixed(1)} dtk di luar rentang ${min.toFixed(0)}-${max.toFixed(0)} dtk (target ${brief.targetDurationSec})`
    )
  }
  return issues
}

export function validateStoryboard(
  brief: Brief,
  script: Script,
  storyboard: Storyboard,
  plannedAssetIds?: ReadonlySet<string>
): string[] {
  const issues: string[] = []
  const allowed = new Set<string>(RECIPES[brief.style])
  const beatIds = new Set(script.beats.map((b) => b.id))
  const shotIds = new Set<string>()
  const beatsWithShots = new Set<string>()

  for (const shot of storyboard.shots) {
    if (shotIds.has(shot.id)) issues.push(`shot id duplikat: ${shot.id}`)
    shotIds.add(shot.id)
    if (!beatIds.has(shot.beatId)) issues.push(`shot ${shot.id}: beat tidak dikenal ${shot.beatId}`)
    beatsWithShots.add(shot.beatId)
    if (!allowed.has(shot.recipe)) {
      issues.push(`shot ${shot.id}: recipe ${shot.recipe} tidak ada di katalog style ${brief.style}`)
    }
    if (shot.recipe === 'code' && !shot.code) issues.push(`shot ${shot.id}: recipe code butuh field code`)
    if (shot.recipe === 'terminal' && !shot.terminal?.length) {
      issues.push(`shot ${shot.id}: recipe terminal butuh field terminal`)
    }
    if (shot.recipe === 'custom-svg') {
      if (!shot.svg) issues.push(`shot ${shot.id}: recipe custom-svg butuh field svg`)
      else if (!isSafeSvg(shot.svg)) issues.push(`shot ${shot.id}: svg tidak aman / bukan <svg>`)
    } else if (shot.svg && !isSafeSvg(shot.svg)) {
      issues.push(`shot ${shot.id}: svg pendamping tidak aman / bukan <svg>`)
    }
    if ((shot.recipe === 'kinetic-title' || shot.recipe === 'stat-callout') && !shot.headline) {
      issues.push(`shot ${shot.id}: recipe ${shot.recipe} butuh headline`)
    }
    if (ASSET_RECIPES.includes(shot.recipe)) {
      if (!shot.assetId) issues.push(`shot ${shot.id}: recipe ${shot.recipe} butuh assetId`)
      else if (plannedAssetIds && !plannedAssetIds.has(shot.assetId)) {
        issues.push(`shot ${shot.id}: assetId ${shot.assetId} tidak ada di asset plan`)
      }
    }
  }
  for (const id of beatIds) {
    if (!beatsWithShots.has(id)) issues.push(`beat ${id} belum punya shot`)
  }
  return issues
}

/** Timing valid: shot berurutan tanpa celah/tumpang tindih dan menutup seluruh durasi. */
export function validateTiming(timing: Timing, storyboard: Storyboard): string[] {
  const issues: string[] = []
  let cursor = 0
  for (const shot of timing.shots) {
    if (shot.startMs !== cursor) issues.push(`shot ${shot.shotId}: mulai ${shot.startMs}, seharusnya ${cursor}`)
    if (shot.endMs <= shot.startMs) issues.push(`shot ${shot.shotId}: durasi tidak positif`)
    cursor = shot.endMs
  }
  if (timing.shots.length !== storyboard.shots.length) issues.push('jumlah shot timing != storyboard')
  if (cursor !== timing.durationMs) issues.push(`shot berakhir ${cursor}, durasi suara ${timing.durationMs}`)
  return issues
}

export function parseBrief(input: unknown): Brief {
  return BriefSchema.parse(input)
}
export function parseScript(input: unknown): Script {
  return ScriptSchema.parse(input)
}
export function parseStoryboard(input: unknown): Storyboard {
  return StoryboardSchema.parse(input)
}
export function parseTiming(input: unknown): Timing {
  return TimingSchema.parse(input)
}
export function parsePipelineState(input: unknown): PipelineState {
  return PipelineStateSchema.parse(input)
}
