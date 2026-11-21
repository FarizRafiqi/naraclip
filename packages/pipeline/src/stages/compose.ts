import fs from 'node:fs'
import {
  STYLE_PROFILES,
  type Brief,
  type Storyboard,
  type Timing,
} from '@naraclip/contracts'
import { compileHyperframes } from '../compilers/hyperframes.js'
import { compileRemotion } from '../compilers/remotion.js'
import {
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
} from '../workspace.js'

export async function runCompose(
  slug: string,
  options: { force?: boolean; fps?: number } = {}
): Promise<{ engine: 'remotion' | 'hyperframes'; targetFile: string }> {
  const p = paths(slug)
  const state = loadState(slug)
  const profile = STYLE_PROFILES[state.style]

  if (!fs.existsSync(p.brief) || !fs.existsSync(p.storyboard) || !fs.existsSync(p.timing)) {
    throw new Error(`brief, storyboard, atau timing belum ada untuk "${slug}".`)
  }

  const brief = readJson<Brief>(p.brief)
  const storyboard = readJson<Storyboard>(p.storyboard)
  const timing = readJson<Timing>(p.timing)

  const inputHash = sha256({ brief, storyboard, timing })
  fs.mkdirSync(p.render, { recursive: true })

  let targetFile = ''
  if (profile.engine === 'remotion') {
    compileRemotion(slug, brief, storyboard, timing, options.fps || 30)
    targetFile = 'render/remotion-props.json'
  } else {
    compileHyperframes(slug, brief, storyboard, timing, options.fps || 30)
    targetFile = 'render/composition.html'
  }

  setStage(
    state,
    'compose',
    'done',
    inputHash,
    `Komposisi ${profile.engine} berhasil dikompilasi (${targetFile})`
  )
  saveState(state)

  return { engine: profile.engine, targetFile }
}
