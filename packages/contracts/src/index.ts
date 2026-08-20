import { z } from 'zod'

const NonEmptyText = z.string().trim().min(1)

export const SceneArchetypeSchema = z.enum([
  'CHARACTER_HUMAN_ANIMAL',
  'GEOGRAPHY_GIS_SATELLITE',
  'CYBER_UI_FLOWCHART',
  'CHEMICAL_MATERIAL_FOOD',
  'ASTRONOMY_MICROSCOPIC',
  'MACHINE_TEARDOWN_PHYSICS',
])

export const VisualAssetKindSchema = z.enum(['image', 'icon', 'map', 'chart', 'shape', 'ui'])
export const AssetSourceSchema = z.enum(['generated', 'uploaded', 'stock', 'inline'])
export const CaptionEmphasisSchema = z.enum(['normal', 'keyword', 'warning', 'number'])
export const MotionPrimitiveSchema = z.enum([
  'fade',
  'slide',
  'scale',
  'pan',
  'orbit',
  'parallax',
  'count-up',
  'highlight',
])
export const AudioTrackKindSchema = z.enum(['voice', 'sfx', 'music'])
export const ProviderCapabilitySchema = z.enum(['story', 'image', 'tts', 'fact-check', 'render'])

export const AssetRefSchema = z
  .object({
    id: NonEmptyText,
    kind: VisualAssetKindSchema,
    source: AssetSourceSchema,
    storageKey: NonEmptyText.optional(),
    url: z.url().optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
    altText: z.string().trim().min(1).max(300),
  })
  .strict()

export const CaptionCueSchema = z
  .object({
    text: NonEmptyText.max(180),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    emphasis: CaptionEmphasisSchema.default('normal'),
  })
  .strict()
  .refine((cue) => cue.endMs > cue.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  })

export const AudioTrackSchema = z
  .object({
    id: NonEmptyText,
    kind: AudioTrackKindSchema,
    assetId: NonEmptyText,
    startMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    volume: z.number().min(0).max(1).default(1),
  })
  .strict()

export const SceneSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: NonEmptyText,
    index: z.number().int().nonnegative(),
    archetype: SceneArchetypeSchema,
    title: NonEmptyText.max(120),
    narration: NonEmptyText.max(4000),
    durationMs: z.number().int().min(1000).max(120000),
    visualAssets: z.array(AssetRefSchema).min(1).max(32),
    captionCues: z.array(CaptionCueSchema).max(200),
    motion: z.array(MotionPrimitiveSchema).min(1).max(12),
    audioTracks: z.array(AudioTrackSchema).max(16),
    rendererHints: z
      .object({
        template: NonEmptyText.max(80),
        safeArea: z.enum(['default', 'tight', 'wide']).default('default'),
        background: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .default('#0B1020'),
      })
      .strict(),
  })
  .strict()

export const StoryBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    topic: NonEmptyText.max(240),
    audience: NonEmptyText.max(160),
    language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    tone: z.enum(['curious', 'serious', 'playful', 'deadpan', 'urgent']),
    targetDurationMs: z.number().int().min(5000).max(180000),
    hook: NonEmptyText.max(300),
    takeaway: NonEmptyText.max(500),
    scenes: z.array(SceneSpecSchema).min(1).max(12),
  })
  .strict()

export const RenderSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    scenes: z.array(SceneSpecSchema).min(1).max(12),
  })
  .strict()

export const ProviderConfigSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    providerId: NonEmptyText.max(100),
    capability: ProviderCapabilitySchema,
    model: NonEmptyText.max(160),
    config: z.record(z.string(), z.unknown()),
    promptVersion: NonEmptyText.max(100).optional(),
  })
  .strict()

export const ProviderContractSchema = z
  .object({
    providerId: NonEmptyText.max(100),
    capability: ProviderCapabilitySchema,
    apiVersion: NonEmptyText.max(80),
    supportsStructuredOutput: z.boolean(),
    supportsRetries: z.boolean(),
    maxConcurrency: z.number().int().positive().max(1000),
  })
  .strict()

export type SceneArchetype = z.infer<typeof SceneArchetypeSchema>
export type VisualAssetKind = z.infer<typeof VisualAssetKindSchema>
export type AssetRef = z.infer<typeof AssetRefSchema>
export type CaptionCue = z.infer<typeof CaptionCueSchema>
export type AudioTrack = z.infer<typeof AudioTrackSchema>
export type SceneSpec = z.infer<typeof SceneSpecSchema>
export type StoryBrief = z.infer<typeof StoryBriefSchema>
export type RenderSpec = z.infer<typeof RenderSpecSchema>
export type ProviderConfigSnapshot = z.infer<typeof ProviderConfigSnapshotSchema>
export type ProviderContract = z.infer<typeof ProviderContractSchema>

export function parseSceneSpec(input: unknown): SceneSpec {
  return SceneSpecSchema.parse(input)
}

export function parseStoryBrief(input: unknown): StoryBrief {
  return StoryBriefSchema.parse(input)
}

export function parseRenderSpec(input: unknown): RenderSpec {
  return RenderSpecSchema.parse(input)
}
