import type { ProviderConfigSnapshot, StoryBrief } from '@naraclip/contracts'

export type StoryGenerationInput = {
  prompt: string
  language: string
  targetDurationMs: number
}

export interface StoryGenerationProvider {
  generate(input: StoryGenerationInput, snapshot: ProviderConfigSnapshot): Promise<unknown>
}

const ARCHETYPES = [
  'CHARACTER_HUMAN_ANIMAL',
  'GEOGRAPHY_GIS_SATELLITE',
  'MACHINE_TEARDOWN_PHYSICS',
  'CHEMICAL_MATERIAL_FOOD',
] as const

export default class TemplateStoryProvider implements StoryGenerationProvider {
  async generate(
    input: StoryGenerationInput,
    _snapshot: ProviderConfigSnapshot
  ): Promise<StoryBrief> {
    const topic = input.prompt.trim().slice(0, 240)
    const durationMs = Math.max(5000, Math.min(180000, input.targetDurationMs))
    const sceneDurationMs = Math.max(1000, Math.floor(durationMs / 4))
    const sceneTopics = ['hook', 'context', 'mechanism', 'takeaway']

    return {
      schemaVersion: 1,
      topic,
      audience: 'Curious short-form viewers',
      language: input.language,
      tone: 'curious',
      targetDurationMs: sceneDurationMs * 4,
      hook: `Satu pertanyaan sederhana tentang ${topic}.`,
      takeaway: `Penonton memahami inti ${topic} melalui empat beat visual yang jelas.`,
      scenes: sceneTopics.map((beat, index) => ({
        schemaVersion: 1,
        id: `scene-${index + 1}`,
        index,
        archetype: ARCHETYPES[index],
        title: `${beat} · ${topic}`.slice(0, 120),
        narration: `Beat ${index + 1} menjelaskan ${topic} dengan bahasa singkat dan visual yang mudah diikuti.`,
        durationMs: sceneDurationMs,
        visualAssets: [
          {
            id: `asset-${index + 1}`,
            kind: 'image',
            source: 'generated',
            storageKey: `pending://scene-${index + 1}`,
            mimeType: 'image/svg+xml',
            altText: `Visual ${beat} untuk ${topic}`,
          },
        ],
        captionCues: [
          {
            text: beat.toUpperCase(),
            startMs: 400,
            endMs: Math.min(sceneDurationMs - 200, 1800),
            emphasis: index === 0 ? 'keyword' : 'normal',
          },
        ],
        captionStyle: {
          preset: 'bold-karaoke',
          safeArea: 'default',
          maxLines: 2,
          position: 'bottom',
        },
        motion: ['fade', index % 2 === 0 ? 'scale' : 'pan', 'highlight'],
        audioTracks: [
          {
            id: `voice-${index + 1}`,
            kind: 'voice',
            assetId: `pending-audio-${index + 1}`,
            startMs: 0,
            durationMs: sceneDurationMs,
            volume: 1,
          },
        ],
        rendererHints: {
          template: beat === 'mechanism' ? 'machine-teardown' : 'editorial-explainer',
          safeArea: 'default',
          background: '#0B1020',
        },
      })),
    }
  }
}
