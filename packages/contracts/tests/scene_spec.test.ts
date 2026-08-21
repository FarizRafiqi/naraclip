import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ProviderConfigSnapshotSchema, SceneSpecSchema, StoryBriefSchema } from '../src/index.js'

const fixtureNames = [
  'character-human-animal.json',
  'geography-gis-satellite.json',
  'machine-teardown-physics.json',
]

describe('SceneSpec contract fixtures', () => {
  for (const fixtureName of fixtureNames) {
    it(`accepts ${fixtureName}`, () => {
      const fixture = JSON.parse(
        readFileSync(new URL(`../fixtures/${fixtureName}`, import.meta.url), 'utf8')
      )

      expect(SceneSpecSchema.parse(fixture).schemaVersion).toBe(1)
    })
  }

  it('rejects invalid timing', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/character-human-animal.json', import.meta.url), 'utf8')
    )

    expect(() => SceneSpecSchema.parse({ ...fixture, durationMs: 0 })).toThrow()
  })

  it('accepts a StoryBrief containing validated scenes', () => {
    const scene = JSON.parse(
      readFileSync(new URL('../fixtures/geography-gis-satellite.json', import.meta.url), 'utf8')
    )

    const brief = StoryBriefSchema.parse({
      schemaVersion: 1,
      topic: 'How maps turn data into a story',
      audience: 'Curious short-form viewers',
      language: 'id-ID',
      tone: 'curious',
      targetDurationMs: 15000,
      hook: 'A map can hide a story in plain sight.',
      takeaway: 'Visual structure makes complex facts easier to remember.',
      scenes: [scene],
    })

    expect(brief.scenes).toHaveLength(1)
  })

  it('applies safe defaults to provider snapshots and caption style', () => {
    const snapshot = ProviderConfigSnapshotSchema.parse({
      schemaVersion: 1,
      providerId: 'local',
      capability: 'story',
      model: 'template-v1',
      config: {},
    })

    expect(snapshot.flags).toEqual({})
    expect(snapshot.costMinorPerUnit).toBe(0)
  })
})
