import {
  GATE_IDS,
  STAGE_IDS,
  STYLE_PROFILES,
  type GateId,
  type PipelineState,
  type PipelineStyle,
  type StageId,
} from '@naraclip/contracts'
import { runAssets } from './stages/assets.js'
import { runBrief } from './stages/brief.js'
import { runCompose } from './stages/compose.js'
import { runPublish } from './stages/publish.js'
import { runQa } from './stages/qa.js'
import { runRender } from './stages/render.js'
import { runScript } from './stages/script.js'
import { runStoryboard } from './stages/storyboard.js'
import { runVoice } from './stages/voice.js'
import { initState, loadState, saveState, setStage } from './workspace.js'

export type RunOptions = {
  to?: StageId
  autoApprove?: boolean
  force?: boolean
  preview?: boolean
}

export type RunResult = {
  slug: string
  currentStage: StageId
  completed: boolean
  stoppedAtGate?: GateId
  state: PipelineState
}

export async function runPipeline(
  slug: string,
  options: RunOptions = {}
): Promise<RunResult> {
  let state = loadState(slug)
  const profile = STYLE_PROFILES[state.style]
  const targetStage = options.to || 'publish'
  const targetIndex = STAGE_IDS.indexOf(targetStage)

  for (let i = 0; i < STAGE_IDS.length; i++) {
    const stageId = STAGE_IDS[i]
    if (i > targetIndex) break

    // Jika stage ini di-skip oleh profil style
    if (profile.skipStages.includes(stageId)) {
      setStage(state, stageId, 'skipped', null, 'Dilewati untuk style ini')
      saveState(state)
      continue
    }

    console.log(`\n▶ [${slug}] Menjalankan stage: ${stageId}...`)

    switch (stageId) {
      case 'brief':
        await runBrief(slug, { force: options.force })
        break

      case 'script':
        await runScript(slug, { force: options.force })
        state = loadState(slug)
        // Gate: script
        if (profile.gates.includes('script') && !state.gates.script.approvedAt) {
          if (options.autoApprove) {
            state.gates.script.approvedAt = new Date().toISOString()
            saveState(state)
            console.log(`  ✓ Gate 'script' otomatis disetujui (--auto-approve)`)
          } else {
            console.log(`\n⏸ [GATE] Naskah selesai dibuat. Periksa script.json lalu setujui dengan:`)
            console.log(`  nc approve ${slug} script`)
            return { slug, currentStage: stageId, completed: false, stoppedAtGate: 'script', state }
          }
        }
        break

      case 'storyboard':
        await runStoryboard(slug, { force: options.force })
        state = loadState(slug)
        // Gate: storyboard
        if (profile.gates.includes('storyboard') && !state.gates.storyboard.approvedAt) {
          if (options.autoApprove) {
            state.gates.storyboard.approvedAt = new Date().toISOString()
            saveState(state)
            console.log(`  ✓ Gate 'storyboard' otomatis disetujui (--auto-approve)`)
          } else {
            console.log(`\n⏸ [GATE] Storyboard selesai dibuat. Periksa storyboard.json lalu setujui dengan:`)
            console.log(`  nc approve ${slug} storyboard`)
            return { slug, currentStage: stageId, completed: false, stoppedAtGate: 'storyboard', state }
          }
        }
        break

      case 'assets':
        await runAssets(slug, { force: options.force })
        state = loadState(slug)
        // Gate: assets
        if (profile.gates.includes('assets') && !state.gates.assets.approvedAt) {
          if (options.autoApprove) {
            state.gates.assets.approvedAt = new Date().toISOString()
            saveState(state)
            console.log(`  ✓ Gate 'assets' otomatis disetujui (--auto-approve)`)
          } else {
            console.log(`\n⏸ [GATE] Aset visual selesai disiapkan. Periksa assets/ lalu setujui dengan:`)
            console.log(`  nc approve ${slug} assets`)
            return { slug, currentStage: stageId, completed: false, stoppedAtGate: 'assets', state }
          }
        }
        break

      case 'voice':
        await runVoice(slug, { force: options.force })
        break

      case 'compose':
        await runCompose(slug, { force: options.force })
        break

      case 'qa':
        await runQa(slug, { phase: 'pre-render' })
        break

      case 'render':
        await runRender(slug, { preview: options.preview })
        break

      case 'publish':
        await runPublish(slug)
        break
    }

    state = loadState(slug)
    console.log(`  ✓ Selesai: ${stageId}`)
  }

  return {
    slug,
    currentStage: targetStage,
    completed: true,
    state: loadState(slug),
  }
}
