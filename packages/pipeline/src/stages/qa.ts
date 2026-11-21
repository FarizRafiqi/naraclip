import fs from 'node:fs'
import path from 'node:path'
import {
  isSafeSvg,
  QAReportSchema,
  validateTiming,
  type Brief,
  type QAFinding,
  type QAReport,
  type Storyboard,
  type Timing,
} from '@naraclip/contracts'
import {
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

export async function runQa(
  slug: string,
  options: { phase?: 'pre-render' | 'post-render' } = {}
): Promise<QAReport> {
  const p = paths(slug)
  const state = loadState(slug)
  const phase = options.phase || 'pre-render'
  const findings: QAFinding[] = []

  if (!fs.existsSync(p.brief) || !fs.existsSync(p.storyboard) || !fs.existsSync(p.timing)) {
    throw new Error(`brief, storyboard, atau timing belum ada untuk "${slug}".`)
  }

  const brief = readJson<Brief>(p.brief)
  const storyboard = readJson<Storyboard>(p.storyboard)
  const timing = readJson<Timing>(p.timing)

  // 1. Validasi timing continuity
  const timingIssues = validateTiming(timing, storyboard)
  for (const issue of timingIssues) {
    findings.push({
      code: 'TIMING_DISCONTINUITY',
      severity: 'error',
      shotId: null,
      message: issue,
    })
  }

  // 2. Audio file check
  const audioPath = path.resolve(p.dir, timing.voiceFile)
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 100) {
    findings.push({
      code: 'AUDIO_MISSING',
      severity: 'error',
      shotId: null,
      message: `File audio "${timing.voiceFile}" tidak ditemukan atau kosong.`,
    })
  }

  // 3. Storyboard & Shot checks
  for (const shot of storyboard.shots) {
    if (shot.recipe === 'custom-svg') {
      if (!shot.svg) {
        findings.push({
          code: 'SVG_EMPTY',
          severity: 'error',
          shotId: shot.id,
          message: `Shot ${shot.id} menggunakan recipe custom-svg tetapi markup svg kosong.`,
        })
      } else if (!isSafeSvg(shot.svg)) {
        findings.push({
          code: 'SVG_UNSAFE',
          severity: 'error',
          shotId: shot.id,
          message: `Shot ${shot.id} memiliki SVG yang tidak aman (script/event handler terdeteksi).`,
        })
      }
    }

    if (shot.headline && shot.headline.length > 90) {
      findings.push({
        code: 'TEXT_OVERFLOW',
        severity: 'warn',
        shotId: shot.id,
        message: `Headline shot ${shot.id} terlalu panjang (${shot.headline.length} > 90 char).`,
      })
    }

    // Antislop hard gate: zero em-dash across copy fields
    const textFields = [shot.headline, shot.body, shot.code, shot.svg].filter(Boolean) as string[]
    if (textFields.some((val) => val.includes('—'))) {
      findings.push({
        code: 'EM_DASH_FORBIDDEN',
        severity: 'error',
        shotId: shot.id,
        message: `Shot ${shot.id} mengandung karakter em-dash (—) yang dilarang antislop R-02.`,
      })
    }

    // Motion density check: shots > 2.5s need cues, highlightSteps, terminal, or SVG anim/cue markers
    const shotT = timing.shots.find((s) => s.shotId === shot.id)
    const shotDurMs = shotT ? shotT.endMs - shotT.startMs : 0
    if (shotDurMs > 2500) {
      const hasMotionSignals =
        Boolean(shot.cues?.length) ||
        Boolean(shot.highlightSteps?.length) ||
        Boolean(shot.terminal?.length) ||
        Boolean(shot.camera?.length && shot.camera.length > 1) ||
        Boolean(shot.svg && /data-(anim|cue)/.test(shot.svg))
      if (!hasMotionSignals) {
        findings.push({
          code: 'STATIC_SHOT_WARN',
          severity: 'warn',
          shotId: shot.id,
          message: `Shot ${shot.id} berdurasi ${shotDurMs}ms tanpa sinyal gerak internal (cues/camera/highlightSteps).`,
        })
      }
    }
  }

  const hasErrors = findings.some((f) => f.severity === 'error')
  const report: QAReport = {
    schemaVersion: 1,
    phase,
    pass: !hasErrors,
    findings,
  }

  QAReportSchema.parse(report)
  const reportPath = phase === 'pre-render' ? p.qaPre : p.qaPost
  writeJson(reportPath, report)

  if (hasErrors) {
    setStage(state, 'qa', 'failed', sha256(report), `QA gagal dengan ${findings.length} temuan`)
    saveState(state)
    throw new Error(
      `QA Pre-Render Gagal:\n${findings.map((f) => `[${f.severity}] ${f.code}: ${f.message}`).join('\n')}`
    )
  }

  setStage(state, 'qa', 'done', sha256(report), `QA lulus (${findings.length} peringatan)`)
  saveState(state)

  return report
}
