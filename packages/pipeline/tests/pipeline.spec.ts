import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildSfxTrack,
  compileHyperframes,
  initState,
  listSocialProviders,
  loadState,
  paths,
  readJson,
  runBrief,
  runCompose,
  runPipeline,
  runPublish,
  runQa,
  runRender,
  runScript,
  runStoryboard,
  runVoice,
  saveState,
  slugify,
} from '../src/index.js'

describe('NaraClip Video Pipeline', () => {
  const tmpContentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-test-content-'))
  const origEnv = process.env.NC_CONTENT_ROOT
  const origLlm = process.env.NC_LLM

  beforeAll(() => {
    process.env.NC_CONTENT_ROOT = tmpContentRoot
    process.env.NC_LLM = 'mock'
  })

  afterAll(() => {
    process.env.NC_CONTENT_ROOT = origEnv
    process.env.NC_LLM = origLlm
    fs.rmSync(tmpContentRoot, { recursive: true, force: true })
  })

  it('slugify converts titles to valid kebab-case', () => {
    expect(slugify('Kenapa Redis Begitu Cepat?!')).toBe('kenapa-redis-begitu-cepat')
    expect(slugify('Air vs Pedas: Kesalahan Fatal!')).toBe('air-vs-pedas-kesalahan-fatal')
  })

  it('initializes state for dev-explainer and vinconium styles', () => {
    const sDev = initState('test-dev', 'dev-explainer')
    expect(sDev.style).toBe('dev-explainer')
    expect(sDev.stages.assets.status).toBe('skipped')
    expect(sDev.stages.brief.status).toBe('pending')

    const sVinc = initState('test-vinc', 'vinconium')
    expect(sVinc.style).toBe('vinconium')
    expect(sVinc.stages.assets.status).toBe('pending')
  })

  it('executes dev-explainer pipeline stages with bundled fonts, words, and audio', async () => {
    const slug = 'test-redis-fast'
    const p = paths(slug)
    fs.mkdirSync(p.dir, { recursive: true })
    const state = initState(slug, 'dev-explainer')
    saveState(state)

    // Stage 1: Brief
    const brief = await runBrief(slug, { idea: 'Kenapa Redis Begitu Cepat?' })
    expect(brief.slug).toBe(slug)
    expect(brief.style).toBe('dev-explainer')
    expect(brief.claims.length).toBeGreaterThanOrEqual(1)
    expect(fs.existsSync(p.brief)).toBe(true)

    // Stage 2: Script
    const script = await runScript(slug)
    expect(script.beats.length).toBeGreaterThanOrEqual(3)
    expect(fs.existsSync(p.script)).toBe(true)

    // Stage 3: Storyboard
    const storyboard = await runStoryboard(slug)
    expect(storyboard.shots.length).toBeGreaterThanOrEqual(3)
    expect(storyboard.shots.every((s) => s.recipe)).toBe(true)

    // Stage 4: Voice (Mock mode)
    const timing = await runVoice(slug)
    expect(timing.durationMs).toBeGreaterThan(0)
    expect(timing.words.length).toBeGreaterThan(5)
    expect(timing.shots.length).toBe(storyboard.shots.length)
    expect(timing.shots[0].startMs).toBe(0)
    expect(timing.shots[timing.shots.length - 1].endMs).toBe(timing.durationMs)
    expect(fs.existsSync(path.join(p.exports, `${slug}.id.srt`))).toBe(true)

    // Stage 5: Compose (Remotion + public-dir assets)
    const composeRes = await runCompose(slug)
    expect(composeRes.engine).toBe('remotion')
    const remotionPropsFile = path.join(p.render, 'remotion-props.json')
    expect(fs.existsSync(remotionPropsFile)).toBe(true)
    const props = readJson<any>(remotionPropsFile)
    expect(props.title).toBe(brief.title)
    expect(props.audioSrc).toBe('audio/master.wav')
    expect(props.words.length).toBe(timing.words.length)
    expect(props.shots.length).toBe(storyboard.shots.length)
    expect(fs.existsSync(path.join(p.render, 'public', 'fonts', 'Outfit-Black.ttf'))).toBe(true)
    expect(fs.existsSync(path.join(p.render, 'public', 'fonts', 'Roboto-Bold.ttf'))).toBe(true)
    expect(fs.existsSync(path.join(p.render, 'public', 'audio', 'master.wav'))).toBe(true)

    // Stage 6: QA Pre-render
    const qaReport = await runQa(slug, { phase: 'pre-render' })
    expect(qaReport.pass).toBe(true)
    expect(fs.existsSync(p.qaPre)).toBe(true)

    // Stage 7: Preview Render (Still frame)
    const renderRes = await runRender(slug, { preview: true, stillFrame: 30 })
    expect(renderRes.isPreview).toBe(true)
    expect(fs.existsSync(renderRes.finalFile)).toBe(true)

    // Stage 8: Publish
    const pub = await runPublish(slug)
    expect(pub.titleVariants.length).toBe(3)
    expect(pub.titleVariants[1]).not.toContain('Kenapa Kenapa')
    expect(pub.youtubeShortsTitle).toContain('#Shorts')
    expect(pub.thumbnailFile).toBe('exports/thumbnail.png')
    expect(pub.verticalThumbnailFile).toBe('exports/thumbnail-shorts.png')
    expect(fs.existsSync(path.join(p.dir, pub.thumbnailFile!))).toBe(true)
    expect(fs.existsSync(path.join(p.dir, pub.verticalThumbnailFile!))).toBe(true)
    expect(pub.description).not.toContain('—')
    expect(pub.chapters.length).toBe(timing.beats.length)
    expect(fs.existsSync(p.publish)).toBe(true)
  }, 30000)

  it('handles gate pauses and auto-approvals in runner', async () => {
    const slug = 'test-runner-flow'
    const p = paths(slug)
    fs.mkdirSync(p.dir, { recursive: true })
    saveState(initState(slug, 'dev-explainer'))

    const res1 = await runPipeline(slug, { to: 'storyboard', autoApprove: false })
    expect(res1.completed).toBe(false)
    expect(res1.stoppedAtGate).toBe('script')

    const state = loadState(slug)
    state.gates.script.approvedAt = new Date().toISOString()
    saveState(state)

    const res2 = await runPipeline(slug, { to: 'storyboard', autoApprove: false })
    expect(res2.completed).toBe(false)
    expect(res2.stoppedAtGate).toBe('storyboard')

    const res3 = await runPipeline(slug, { to: 'qa', autoApprove: true })
    expect(res3.completed).toBe(true)
    expect(res3.state.stages.qa.status).toBe('done')
  }, 30000)

  it('compiles hyperframes composition for vinconium style', async () => {
    const slug = 'test-vinc-flow'
    const p = paths(slug)
    fs.mkdirSync(p.dir, { recursive: true })
    saveState(initState(slug, 'vinconium'))

    const brief = await runBrief(slug, { idea: 'Kenapa Air Nggak Mempan Buat Pedas?' })
    await runScript(slug)
    const storyboard = await runStoryboard(slug)
    const timing = await runVoice(slug)

    const html = compileHyperframes(slug, brief, storyboard, timing)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('data-composition-id="test-vinc-flow"')
    expect(html).toContain('gsap')
  })

  it('schedules cue-level SFX transients at exact cue offsets', () => {
    const outWav = path.join(tmpContentRoot, 'test-sfx.wav')
    const storyboard: any = {
      schemaVersion: 1,
      shots: [
        {
          id: 's01',
          beatId: 'b1',
          recipe: 'custom-svg',
          headline: null,
          body: null,
          code: null,
          terminal: null,
          svg: '<svg viewBox="0 0 100 100"/>',
          assetId: null,
          motion: 'none',
          sfx: 'none',
          emphasis: [],
          cues: [
            { id: 'c-bang', atMs: 1000, sfx: 'stamp' },
            { id: 'c-ok', atMs: 2500, sfx: 'chime-ok' },
          ],
          weight: 5,
        },
      ],
    }
    const timing: any = {
      schemaVersion: 1,
      voiceFile: 'voice/voice.wav',
      durationMs: 3500,
      source: 'mock',
      words: [],
      beats: [{ beatId: 'b1', startMs: 0, endMs: 3500 }],
      shots: [{ shotId: 's01', startMs: 0, endMs: 3500 }],
    }
    buildSfxTrack(storyboard, timing, outWav)
    const buf = fs.readFileSync(outWav)
    // Check energy around 1000ms (48000 samples * 2 bytes + 44 header) vs silent 500ms
    const silentSample = buf.readInt16LE(44 + 24000 * 2)
    let peakAt1000 = 0
    for (let i = 48000; i < 48000 + 2000; i++) {
      peakAt1000 = Math.max(peakAt1000, Math.abs(buf.readInt16LE(44 + i * 2)))
    }
    expect(silentSample).toBe(0)
    expect(peakAt1000).toBeGreaterThan(500)

    // Verify Claude Web Audio presets directly
    const outClaudeWav = path.join(tmpContentRoot, 'test-claude-sfx.wav')
    const claudeStoryboard: any = {
      schemaVersion: 1,
      shots: [
        {
          id: 's01',
          beatId: 'b1',
          recipe: 'custom-svg',
          headline: null,
          body: null,
          code: null,
          terminal: null,
          svg: '<svg viewBox="0 0 100 100"/>',
          assetId: null,
          motion: 'none',
          sfx: 'slideIn',
          emphasis: [],
          cues: [
            { id: 'c-pop', atMs: 500, sfx: 'pop' },
            { id: 'c-shutter', atMs: 1200, sfx: 'shutter' },
            { id: 'c-counter', atMs: 1900, sfx: 'counter' },
            { id: 'c-ding', atMs: 2800, sfx: 'ding' },
          ],
          weight: 5,
        },
      ],
    }
    const claudeTiming: any = {
      schemaVersion: 1,
      voiceFile: 'voice/voice.wav',
      durationMs: 4000,
      source: 'mock',
      words: [],
      beats: [{ beatId: 'b1', startMs: 0, endMs: 4000 }],
      shots: [{ shotId: 's01', startMs: 0, endMs: 4000 }],
    }
    buildSfxTrack(claudeStoryboard, claudeTiming, outClaudeWav)
    const cBuf = fs.readFileSync(outClaudeWav)
    for (const ms of [0, 500, 1200, 1900, 2800]) {
      const startSample = Math.floor((ms / 1000) * 48000)
      let peak = 0
      for (let i = startSample; i < startSample + 3000 && 44 + i * 2 + 1 < cBuf.length; i++) {
        peak = Math.max(peak, Math.abs(cBuf.readInt16LE(44 + i * 2)))
      }
      expect(peak).toBeGreaterThan(200)
    }
  })

  it('lists supported multi-social providers including YouTube, TikTok, Instagram, Facebook, and X', () => {
    const providers = listSocialProviders()
    expect(providers.map((item) => item.platform)).toEqual([
      'youtube',
      'tiktok',
      'instagram',
      'facebook',
      'x',
    ])
    const yt = providers.find((item) => item.platform === 'youtube')
    expect(yt?.oauthConfigured).toBe(true)
    expect(yt?.uploadSupported).toBe(true)
  })
})
