import { test } from '@japa/runner'
import ProviderRegistry from '#services/providers/provider_registry'
import SvgImageProvider from '#services/providers/image_provider'
import {
  buildCaptionCues,
  buildWordTimings,
  normalizeWordTimings,
} from '#services/tts/caption_service'
import DeterministicTtsProvider from '#services/tts/tts_provider'

test.group('Media providers', () => {
  test('creates deterministic SVG image output with provider lineage', async ({ assert }) => {
    const result = await new SvgImageProvider().generate(
      { prompt: 'a friendly map', width: 1080, height: 1920 },
      ProviderRegistry.defaultSnapshot('image')
    )

    assert.equal(result.mimeType, 'image/svg+xml')
    assert.equal(result.width, 1080)
    assert.isAbove(result.body.byteLength, 100)
    assert.isString(result.providerAssetId)
  })

  test('creates audio duration and captions within duration bounds', async ({ assert }) => {
    const result = await new DeterministicTtsProvider().synthesize(
      { text: 'Narasi pendek untuk video explainer.', voice: 'local-default' },
      ProviderRegistry.defaultSnapshot('tts')
    )
    const timings = normalizeWordTimings(
      buildWordTimings('Narasi pendek untuk video explainer.', result.durationMs),
      result.durationMs
    )
    const cues = buildCaptionCues(timings, result.durationMs, {
      preset: 'bold-karaoke',
      safeArea: 'default',
      maxLines: 2,
      position: 'bottom',
    })

    assert.equal(result.mimeType, 'audio/wav')
    assert.isAbove(result.durationMs, 0)
    assert.isAbove(result.body.byteLength, 44)
    assert.isAbove(cues.length, 0)
    assert.isTrue(cues.every((cue) => cue.endMs <= result.durationMs))
  })
})
