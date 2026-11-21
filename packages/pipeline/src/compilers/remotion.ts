import fs from 'node:fs'
import path from 'node:path'
import type { Brief, Storyboard, Timing } from '@naraclip/contracts'
import { buildMixedAudio } from '../audio.js'
import { paths, REPO_ROOT, writeJson } from '../workspace.js'

export type RemotionCompiledProps = {
  title: string
  subtitle: string
  accentColor: string
  audioSrc?: string
  words: Array<{ word: string; startMs: number; endMs: number }>
  beats: Array<{ beatId: string; startMs: number; endMs: number }>
  shots: Array<{
    id: string
    startFrame: number
    durationInFrames: number
    recipe: 'kinetic-title' | 'code' | 'terminal' | 'custom-svg' | 'stat-callout'
    headline: string | null
    body: string | null
    code: string | null
    terminal: Array<{ cmd: string; output?: string | null }> | null
    svg: string | null
    motion: string
    sfx: string
    emphasis: string[]
    highlightSteps?: Array<{ line: number; atMs: number }>
    cues?: Array<{ id: string; atMs: number; sfx?: string; label?: string }>
    camera?: Array<{ atMs: number; x: number; y: number; scale: number }>
    transitionIn?: 'ink-wipe' | 'slide-push' | 'stamp-cut' | 'none'
    annotations?: Array<{ line: number; text: string; atMs: number }>
  }>
}

export function compileRemotion(
  slug: string,
  brief: Brief,
  storyboard: Storyboard,
  timing: Timing,
  fps = 30
): RemotionCompiledProps {
  const p = paths(slug)
  const timingMap = new Map(timing.shots.map((s) => [s.shotId, s]))
  const totalTargetFrames = Math.max(30, Math.round((timing.durationMs / 1000) * fps))

  const compiledShots = storyboard.shots.map((shot) => {
    const t = timingMap.get(shot.id)
    if (!t) throw new Error(`Shot ${shot.id} tidak memiliki timing data`)

    const startFrame = Math.round((t.startMs / 1000) * fps)
    const endFrame = Math.round((t.endMs / 1000) * fps)
    const durationInFrames = Math.max(1, endFrame - startFrame)

    return {
      id: shot.id,
      startFrame,
      durationInFrames,
      recipe: shot.recipe as RemotionCompiledProps['shots'][number]['recipe'],
      headline: shot.headline,
      body: shot.body,
      code: shot.code,
      terminal: shot.terminal,
      svg: shot.svg,
      motion: shot.motion,
      sfx: shot.sfx,
      emphasis: shot.emphasis,
      ...(shot.highlightSteps ? { highlightSteps: shot.highlightSteps } : {}),
      ...(shot.cues ? { cues: shot.cues } : {}),
      ...(shot.camera ? { camera: shot.camera } : {}),
      ...(shot.transitionIn ? { transitionIn: shot.transitionIn } : {}),
      ...(shot.annotations ? { annotations: shot.annotations } : {}),
    }
  })

  // Enforce strict contiguous frame sequence matching totalTargetFrames
  let currentFrame = 0
  for (let i = 0; i < compiledShots.length; i++) {
    const shot = compiledShots[i]
    shot.startFrame = currentFrame
    if (i === compiledShots.length - 1) {
      shot.durationInFrames = Math.max(1, totalTargetFrames - currentFrame)
    }
    currentFrame += shot.durationInFrames
  }

  // Bundle local fonts and mixed master audio into render/public for Remotion --public-dir
  const publicDir = path.join(p.render, 'public')
  const fontsDir = path.join(publicDir, 'fonts')
  const audioDir = path.join(publicDir, 'audio')
  fs.mkdirSync(fontsDir, { recursive: true })
  fs.mkdirSync(audioDir, { recursive: true })

  const sourceFontsDir = path.join(REPO_ROOT, 'packages', 'hyperframes', 'assets', 'fonts')
  for (const fontFile of ['Outfit-Black.ttf', 'Roboto-Bold.ttf']) {
    const src = path.join(sourceFontsDir, fontFile)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(fontsDir, fontFile))
    }
  }

  const rawVoicePath = path.resolve(p.dir, timing.voiceFile)
  let audioSrc: string | undefined
  if (fs.existsSync(rawVoicePath)) {
    const masterWav = path.join(audioDir, 'master.wav')
    buildMixedAudio(rawVoicePath, storyboard, timing, masterWav)
    audioSrc = 'audio/master.wav'
  }

  const props: RemotionCompiledProps = {
    title: brief.title,
    subtitle: brief.hook,
    accentColor: '#1D63ED',
    audioSrc,
    words: timing.words,
    beats: timing.beats,
    shots: compiledShots,
  }

  const outPropsFile = path.join(p.render, 'remotion-props.json')
  writeJson(outPropsFile, props)

  return props
}
