import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BriefSchema,
  ScriptSchema,
  StoryboardSchema,
  StoryboardLlmSchema,
  isSafeSvg,
  validateScript,
  validateStoryboard,
  validateTiming,
  type Brief,
} from '../src/index.js'

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/pipeline/dev-explainer.json', import.meta.url), 'utf8')
)

function build() {
  const brief: Brief = BriefSchema.parse({
    ...fixture.brief,
    schemaVersion: 1,
    slug: 'redis-cepat',
    idea: 'kenapa redis cepat',
    style: 'dev-explainer',
    voiceSource: 'tts',
    language: 'id',
  })
  const script = ScriptSchema.parse({ schemaVersion: 1, ...fixture.script })
  const storyboard = StoryboardSchema.parse({ schemaVersion: 1, ...fixture.storyboard })
  return { brief, script, storyboard }
}

describe('pipeline contracts', () => {
  it('accepts the dev-explainer fixture end to end', () => {
    const { brief, script, storyboard } = build()
    expect(validateScript(brief, script)).toEqual([])
    expect(validateStoryboard(brief, script, storyboard)).toEqual([])
  })

  it('flags unknown claims, uncovered claims and out-of-range duration', () => {
    const { brief, script } = build()
    const bad = { ...script, beats: [{ ...script.beats[0], claimIds: ['zzz'] }, ...script.beats.slice(1, 3)] }
    const issues = validateScript(brief, bad)
    expect(issues.some((i) => i.includes('claim tidak dikenal'))).toBe(true)
    expect(issues.some((i) => i.includes('tidak dipakai'))).toBe(true)
    expect(issues.some((i) => i.includes('durasi'))).toBe(true)
  })

  it('rejects recipes outside the style catalog and missing fields', () => {
    const { brief, script, storyboard } = build()
    const shots = storyboard.shots.map((s, i) =>
      i === 0 ? { ...s, recipe: 'char-pose' as const } : i === 3 ? { ...s, code: null } : s
    )
    const issues = validateStoryboard(brief, script, { ...storyboard, shots })
    expect(issues.some((i) => i.includes('tidak ada di katalog'))).toBe(true)
    expect(issues.some((i) => i.includes('butuh field code'))).toBe(true)
  })

  it('reports beats without shots', () => {
    const { brief, script, storyboard } = build()
    const issues = validateStoryboard(brief, script, { ...storyboard, shots: storyboard.shots.slice(0, 4) })
    expect(issues).toContain('beat b5 belum punya shot')
  })

  it('only allows safe svg', () => {
    expect(isSafeSvg('<svg viewBox="0 0 1 1"><rect/></svg>')).toBe(true)
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false)
    expect(isSafeSvg('<svg><rect onclick="x()"/></svg>')).toBe(false)
    expect(isSafeSvg('<svg><use href="https://evil/x.svg"/></svg>')).toBe(false)
    expect(isSafeSvg('<div></div>')).toBe(false)
  })

  it('validates contiguous timing', () => {
    const { storyboard } = build()
    const shots = storyboard.shots.map((s, i) => ({ shotId: s.id, startMs: i * 1000, endMs: (i + 1) * 1000 }))
    const timing = {
      schemaVersion: 1 as const,
      voiceFile: 'voice.wav',
      durationMs: shots.length * 1000,
      source: 'mock' as const,
      words: [],
      beats: [],
      shots,
    }
    expect(validateTiming(timing, storyboard)).toEqual([])
    expect(validateTiming({ ...timing, durationMs: 1 }, storyboard).length).toBeGreaterThan(0)
  })

  it('exposes an LLM schema convertible to JSON schema', async () => {
    const { z } = await import('zod')
    const json = z.toJSONSchema(StoryboardLlmSchema) as { type: string; additionalProperties?: boolean }
    expect(json.type).toBe('object')
    expect(json.additionalProperties).toBe(false)
  })

  it('accepts optional v3 cues, camera, transitionIn, and annotations while preserving backward compatibility', () => {
    const { brief, script, storyboard } = build()
    const extendedShot = {
      ...storyboard.shots[0],
      sfx: 'stamp' as const,
      transitionIn: 'ink-wipe' as const,
      camera: [{ atMs: 0, x: 0, y: 0, scale: 1.2 }],
      cues: [{ id: 'c1', atMs: 450, sfx: 'buzz-error' as const, label: 'Error stamp' }],
      annotations: [{ line: 1, text: 'Base layer', atMs: 300 }],
      weight: 4,
    }
    const parsed = StoryboardSchema.parse({
      ...storyboard,
      shots: [extendedShot, ...storyboard.shots.slice(1)],
    })
    expect(validateStoryboard(brief, script, parsed)).toEqual([])
    expect(parsed.shots[0].cues?.[0].sfx).toBe('buzz-error')
  })
})
