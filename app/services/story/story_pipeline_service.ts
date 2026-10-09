import { parseStoryBrief, type ProviderConfigSnapshot, type StoryBrief } from '@naraclip/contracts'
import ProviderRegistry from '#services/providers/provider_registry'
import TemplateStoryProvider, {
  type StoryGenerationInput,
  type StoryGenerationProvider,
} from './story_generation_provider.js'

function containsHtml(value: unknown) {
  return typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)
}

function countWords(brief: StoryBrief) {
  return brief.scenes.reduce(
    (total, scene) => total + scene.narration.trim().split(/\s+/).filter(Boolean).length,
    0
  )
}

export default class StoryPipelineService {
  constructor(
    private readonly providers = new ProviderRegistry(),
    private readonly provider: StoryGenerationProvider = new TemplateStoryProvider()
  ) {}

  async generate(
    input: StoryGenerationInput,
    snapshot?: ProviderConfigSnapshot
  ): Promise<{ brief: StoryBrief; snapshot: ProviderConfigSnapshot; wordCount: number }> {
    if (containsHtml(input.prompt)) {
      throw new Error('Story prompt must be plain text')
    }

    const configSnapshot = snapshot ?? (await this.providers.snapshot('story'))
    const raw = await this.provider.generate(input, configSnapshot)
    if (containsHtml(raw)) {
      throw new Error('Story provider returned raw HTML')
    }

    const brief = parseStoryBrief(raw)
    if (brief.scenes.length < 4 || brief.scenes.length > 7) {
      throw new Error('Story must contain between 4 and 7 scenes')
    }

    const totalDurationMs = brief.scenes.reduce((total, scene) => total + scene.durationMs, 0)
    if (totalDurationMs !== brief.targetDurationMs) {
      throw new Error('Story scene durations must equal targetDurationMs')
    }

    return { brief, snapshot: configSnapshot, wordCount: countWords(brief) }
  }
}
