import { test } from '@japa/runner'
import ProviderRegistry from '#services/providers/provider_registry'
import TemplateStoryProvider, {
  type StoryGenerationProvider,
} from '#services/story/story_generation_provider'
import StoryPipelineService from '#services/story/story_pipeline_service'
import type { ProviderConfigSnapshot } from '@naraclip/contracts'

const input = {
  prompt: 'Mengapa langit berubah warna saat matahari terbenam?',
  language: 'id-ID',
  targetDurationMs: 20000,
}

test.group('Story pipeline', () => {
  test('generates four validated scenes with deterministic provider', async ({ assert }) => {
    const service = new StoryPipelineService()
    const result = await service.generate(input, ProviderRegistry.defaultSnapshot('story'))

    assert.equal(result.brief.scenes.length, 4)
    assert.equal(result.brief.targetDurationMs, 20000)
    assert.isAbove(result.wordCount, 0)
    assert.isTrue(Object.isFrozen(result.snapshot))
  })

  test('rejects provider HTML output', async ({ assert }) => {
    const provider: StoryGenerationProvider = {
      async generate(_input: typeof input, _snapshot: ProviderConfigSnapshot) {
        return '<div>not a story</div>'
      },
    }
    const service = new StoryPipelineService(undefined, provider)

    await assert.rejects(
      () => service.generate(input, ProviderRegistry.defaultSnapshot('story')),
      'Story provider returned raw HTML'
    )
  })

  test('rejects fewer than four scenes', async ({ assert }) => {
    const template = new TemplateStoryProvider()
    const provider: StoryGenerationProvider = {
      async generate(storyInput, snapshot) {
        const brief = (await template.generate(storyInput, snapshot)) as Record<string, unknown>
        return { ...brief, scenes: (brief.scenes as unknown[]).slice(0, 1) }
      },
    }
    const service = new StoryPipelineService(undefined, provider)

    await assert.rejects(
      () => service.generate(input, ProviderRegistry.defaultSnapshot('story')),
      'Story must contain between 4 and 7 scenes'
    )
  })
})
