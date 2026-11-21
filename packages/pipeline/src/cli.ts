#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  GATE_IDS,
  STAGE_IDS,
  STYLE_PROFILES,
  type GateId,
  type PipelineStyle,
  type StageId,
} from '@naraclip/contracts'
import { runPipeline } from './runner.js'
import {
  authorizeSocialPlatform,
  listSocialProviders,
  publishVideoToSocial,
  type SocialPlatformId,
} from './social/index.js'
import {
  initState,
  loadState,
  paths,
  resetGate,
  saveState,
  setStage,
  slugify,
} from './workspace.js'

function printHelp() {
  console.log(`
NaraClip Video Pipeline Engine (CLI: nc)

Perintah:
  nc new "<ide video>" [--style <dev-explainer|vinconium>] [--slug <slug>]
      Inisialisasi video baru dan langsung buat brief awal.

  nc run <slug> [--to <stage>] [--auto-approve] [--preview] [--force]
      Jalankan pipeline sampai stage target atau terhenti di gate persetujuan.
      Daftar stage: ${STAGE_IDS.join(' -> ')}

  nc approve <slug> <script|storyboard|assets>
      Setujui checkpoint gate agar pipeline dapat melanjutkan ke tahap berikutnya.

  nc status <slug>
      Lihat progress stage, status checkpoint gate, dan file hasil output.

  nc redo <slug> --stage <stage>
      Ulangi eksekusi stage tertentu dari awal.

  nc social status
      Lihat daftar platform sosmed & status koneksi OAuth saat ini.

  nc social auth [youtube] [--code <code_atau_redirect_url>]
      Hubungkan akun YouTube via Google OAuth2 (loopback atau tempel URL/kode callback).

  nc social upload <slug> [--platform youtube] [--privacy public|unlisted|private]
      Unggah exports/final.mp4 + thumbnail + caption ke YouTube Shorts / sosmed.

Pilihan Style:
  - dev-explainer (default Channel 2: 100% vector/code Remotion, Edge-TTS)
  - vinconium     (default Channel 1: photorealistic mixed-media GSAP HyperFrames, rekaman VO)
`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp()
    process.exit(0)
  }

  const cmd = args[0]

  try {
    if (cmd === 'new') {
      const idea = args[1]
      if (!idea) {
        console.error('Error: Masukkan ide video. Contoh: nc new "Kenapa Redis Cepat?"')
        process.exit(1)
      }

      let style: PipelineStyle = 'dev-explainer'
      const styleIdx = args.indexOf('--style')
      if (styleIdx !== -1 && args[styleIdx + 1]) {
        style = args[styleIdx + 1] as PipelineStyle
      }

      let slug = slugify(idea)
      const slugIdx = args.indexOf('--slug')
      if (slugIdx !== -1 && args[slugIdx + 1]) {
        slug = slugify(args[slugIdx + 1])
      }

      const p = paths(slug)
      if (fs.existsSync(p.dir)) {
        console.log(`Workspace "${slug}" sudah ada di: ${p.dir}`)
      } else {
        fs.mkdirSync(p.dir, { recursive: true })
        const state = initState(slug, style)
        saveState(state)
        fs.writeFileSync(p.idea, idea + '\n')
        console.log(`✓ Workspace dibuat: content/${slug}`)
      }

      await runPipeline(slug, { to: 'brief' })
      console.log(`\n🎉 Ide siap! Untuk melanjutkan ke naskah, jalankan:`)
      console.log(`  nc run ${slug}`)
    } else if (cmd === 'run') {
      const slug = args[1]
      if (!slug) {
        console.error('Error: Masukkan slug. Contoh: nc run kenapa-redis-cepat')
        process.exit(1)
      }

      let to: StageId | undefined
      const toIdx = args.indexOf('--to')
      if (toIdx !== -1 && args[toIdx + 1]) {
        to = args[toIdx + 1] as StageId
      }

      const autoApprove = args.includes('--auto-approve')
      const force = args.includes('--force')
      const preview = args.includes('--preview')

      const res = await runPipeline(slug, { to, autoApprove, force, preview })
      if (res.completed) {
        console.log(`\n✨ Pipeline selesai untuk "${slug}"!`)
      }
    } else if (cmd === 'approve') {
      const slug = args[1]
      const gate = args[2] as GateId
      if (!slug || !gate || !GATE_IDS.includes(gate)) {
        console.error(`Error: Format perintah salah. Contoh: nc approve ${slug || '<slug>'} <${GATE_IDS.join('|')}>`)
        process.exit(1)
      }

      const state = loadState(slug)
      state.gates[gate].approvedAt = new Date().toISOString()
      saveState(state)
      console.log(`✓ Gate "${gate}" disetujui untuk "${slug}"!`)
      console.log(`Jalankan langkah berikutnya dengan: nc run ${slug}`)
    } else if (cmd === 'status') {
      const slug = args[1]
      if (!slug) {
        console.error('Error: Masukkan slug. Contoh: nc status kenapa-redis-cepat')
        process.exit(1)
      }

      const state = loadState(slug)
      console.log(`\n=== Status Pipeline: ${slug} (${state.style}) ===`)
      console.log(`Lokasi: content/${slug}\n`)

      console.log('Stages:')
      for (const [id, s] of Object.entries(state.stages)) {
        const symbol =
          s.status === 'done' ? '✓' : s.status === 'waiting' ? '⏸' : s.status === 'skipped' ? '⊘' : '○'
        const note = s.note ? ` (${s.note})` : ''
        console.log(`  ${symbol} ${id.padEnd(12)}: ${s.status}${note}`)
      }

      console.log('\nGates:')
      for (const [g, val] of Object.entries(state.gates)) {
        const status = val.approvedAt ? `Disetujui pada ${val.approvedAt}` : 'Menunggu persetujuan'
        console.log(`  - ${g.padEnd(12)}: ${status}`)
      }
      console.log(`\nRender Version: v${state.renderVersion}\n`)
    } else if (cmd === 'redo') {
      const slug = args[1]
      const stageIdxFlag = args.indexOf('--stage')
      const targetStage =
        stageIdxFlag !== -1 && args[stageIdxFlag + 1]
          ? (args[stageIdxFlag + 1] as StageId)
          : undefined

      if (!slug || !targetStage || !STAGE_IDS.includes(targetStage)) {
        console.error(
          `Error: Format perintah salah. Contoh: nc redo ${slug || '<slug>'} --stage <${STAGE_IDS.join('|')}>`
        )
        process.exit(1)
      }

      const state = loadState(slug)
      const profile = STYLE_PROFILES[state.style]
      const startIndex = STAGE_IDS.indexOf(targetStage)

      for (let i = startIndex; i < STAGE_IDS.length; i++) {
        const s = STAGE_IDS[i]
        const nextStatus = profile.skipStages.includes(s) ? 'skipped' : 'pending'
        setStage(state, s, nextStatus, null, i === startIndex ? 'Di-reset lewat nc redo' : null)
        if ((GATE_IDS as readonly string[]).includes(s)) {
          resetGate(state, s as GateId)
        }
      }
      saveState(state)
      console.log(`↻ Stage "${targetStage}" (dan turunannya) di-reset untuk "${slug}".`)

      const autoApprove = args.includes('--auto-approve')
      const preview = args.includes('--preview')
      const res = await runPipeline(slug, {
        to: targetStage,
        autoApprove,
        force: true,
        preview,
      })
      if (res.completed) {
        console.log(`✓ Stage "${targetStage}" selesai dijalankan ulang.`)
      }
    } else if (cmd === 'social') {
      const sub = args[1] || 'status'
      if (sub === 'status') {
        console.log('\n=== Status Koneksi Multi-Social ===')
        for (const p of listSocialProviders()) {
          const stateBadge = p.connected ? '✓ CONNECTED' : p.oauthConfigured ? '○ READY' : '· UNCONFIGURED'
          const who = p.accountName ? ` -> ${p.accountName}${p.accountHandle ? ` (${p.accountHandle})` : ''}` : ''
          console.log(`  [${p.platform.padEnd(9)}] ${stateBadge}${who}`)
          if (p.notes && !p.connected) {
            console.log(`              ${p.notes}`)
          }
        }
        console.log('')
      } else if (sub === 'auth') {
        const platform = ((args[2] && !args[2].startsWith('--') ? args[2] : 'youtube') as SocialPlatformId)
        const codeIdx = args.indexOf('--code')
        const codeOrUrl = codeIdx !== -1 ? args[codeIdx + 1] : undefined
        const token = await authorizeSocialPlatform(platform, {
          codeOrUrl,
          onAuthUrl: (url) => {
            console.log('\nBuka link Google OAuth berikut di browser untuk menghubungkan YouTube:')
            console.log(url + '\n')
          },
        })
        console.log(`✓ Akun ${platform} terhubung: ${token.accountName} (${token.accountId})`)
      } else if (sub === 'upload') {
        const slug = args[2]
        if (!slug || slug.startsWith('--')) {
          console.error('Error: Masukkan slug video. Contoh: nc social upload redis-dalam-60-detik')
          process.exit(1)
        }
        const pIdx = args.indexOf('--platform')
        const platform = (pIdx !== -1 && args[pIdx + 1] ? args[pIdx + 1] : 'youtube') as SocialPlatformId
        const prIdx = args.indexOf('--privacy')
        const privacy = (prIdx !== -1 && args[prIdx + 1] ? args[prIdx + 1] : 'public') as
          | 'public'
          | 'unlisted'
          | 'private'
        const result = await publishVideoToSocial({ slug, platform, privacy })
        console.log(`✓ Upload ${platform} berhasil: ${result.url}`)
        console.log(`  Judul: ${result.title}`)
        console.log(`  Thumbnail custom: ${result.thumbnailUploaded ? '✓ terpasang' : result.thumbnailWarning || 'tidak'}`)
      } else {
        console.error(`Subcommand social tidak dikenal: ${sub}`)
        printHelp()
        process.exit(1)
      }
    } else {
      console.error(`Perintah tidak dikenal: ${cmd}`)
      printHelp()
      process.exit(1)
    }
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`)
    process.exit(1)
  }
}

main()
