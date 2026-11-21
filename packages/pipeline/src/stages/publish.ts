import fs from 'node:fs'
import type { Brief, Timing } from '@naraclip/contracts'
import { generateThumbnails } from '../thumbnail.js'
import {
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

export type PublishPackage = {
  titleVariants: string[]
  youtubeShortsTitle: string
  description: string
  chapters: Array<{ time: string; title: string }>
  hashtags: string[]
  pinnedComment: string
  thumbnailFile: string | null
  verticalThumbnailFile: string | null
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function stripEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ', ')
}

function topicHashtags(slug: string, style: string): string[] {
  if (slug.includes('docker')) {
    return ['#docker', '#devops', '#backend', '#programming', '#coding', '#indonesia', '#shorts']
  }
  if (slug.includes('redis')) {
    return ['#redis', '#caching', '#database', '#backend', '#programming', '#coding', '#indonesia', '#shorts']
  }
  if (style === 'dev-explainer') {
    return ['#programming', '#softwareengineer', '#coding', '#tech', '#indonesia', '#shorts']
  }
  return ['#faktaunik', '#sains', '#edukasi', '#shorts']
}

function toYoutubeShortsTitle(title: string): string {
  const clean = title.trim()
  if (/#shorts/i.test(clean)) return clean.slice(0, 100)
  if (clean.length + 8 <= 100) return `${clean} #Shorts`
  return clean.slice(0, 91).trimEnd() + ' #Shorts'
}

export async function runPublish(slug: string): Promise<PublishPackage> {
  const p = paths(slug)
  const state = loadState(slug)

  if (!fs.existsSync(p.brief) || !fs.existsSync(p.timing)) {
    throw new Error(`brief atau timing belum lengkap untuk "${slug}".`)
  }

  const brief = readJson<Brief>(p.brief)
  const timing = readJson<Timing>(p.timing)
  const script = fs.existsSync(p.script) ? readJson<Script>(p.script) : null
  const storyboard = fs.existsSync(p.storyboard) ? readJson<Storyboard>(p.storyboard) : null

  const chapters = timing.beats.map((b, i) => {
    let title = ''

    // 1. Cari dari storyboard headline
    const matchingShot = storyboard?.shots?.find((s) => s.beatId === b.beatId && s.headline)
    if (matchingShot?.headline) {
      title = matchingShot.headline
    }

    // 2. Cari dari script onScreenText
    if (!title) {
      const matchingScriptBeat = script?.beats?.find((sb) => sb.id === b.beatId)
      if (matchingScriptBeat?.onScreenText) {
        title = matchingScriptBeat.onScreenText
      }
    }

    // 3. Fallback ke ringkasan kata pertama dari timing
    if (!title) {
      const beatWords = timing.words
        .filter((w) => w.startMs >= b.startMs && w.endMs <= b.endMs)
        .map((w) => w.word)
      if (beatWords.length > 0) {
        const snippet = beatWords.slice(0, 5).join(' ').replace(/[.,!?]+$/, '')
        title = snippet
      }
    }

    return {
      time: formatTimestamp(b.startMs),
      title: title ? `${title}` : `Bagian ${i + 1}`,
    }
  })

  const hashtags = topicHashtags(slug, state.style)

  const cleanTitle = stripEmDash(brief.title).trim()
  const youtubeShortsTitle = toYoutubeShortsTitle(cleanTitle)
  const baseNoQ = cleanTitle.replace(/\?$/, '')
  const curiosityTitle = /kenapa/i.test(baseNoQ)
    ? `${baseNoQ}? Ini Penjelasannya`
    : `Kenapa ${baseNoQ}? Ternyata ini alasannya!`

  const cleanHook = stripEmDash(brief.hook).trim()
  const hookVariant = cleanHook.length > 75 ? `${cleanHook.slice(0, 72)}...` : cleanHook
  const titleVariants = [cleanTitle, curiosityTitle, hookVariant]

  const cleanTakeaway = stripEmDash(brief.takeaway).trim()
  const description = `${cleanHook}

${cleanTakeaway}

Timestamp:
${chapters.map((c) => `${c.time} - ${c.title}`).join('\n')}

${hashtags.join(' ')}
`

  const pinnedComment = slug.includes('redis')
    ? 'Sudah pakai Redis buat caching atau session? Tulis pengalamanmu di komentar!'
    : slug.includes('docker')
      ? 'Pernah ngalamin "di laptopku jalan, di server error"? Ceritain di komentar!'
      : 'Bagian mana yang paling baru kamu pahami? Tulis pertanyaan kamu di komentar.'

  const thumbs = generateThumbnails(slug, brief)

  const pkg: PublishPackage = {
    titleVariants,
    youtubeShortsTitle,
    description,
    chapters,
    hashtags,
    pinnedComment,
    thumbnailFile: thumbs.thumbnailPng ? 'exports/thumbnail.png' : null,
    verticalThumbnailFile: thumbs.thumbnailShortsPng ? 'exports/thumbnail-shorts.png' : null,
  }

  const mdContent = `# Paket Publikasi Video: ${cleanTitle}

## Judul YouTube Shorts
**${youtubeShortsTitle}**

## Pilihan Judul (A/B Testing)
1. **${titleVariants[0]}** (Utama)
2. **${titleVariants[1]}** (Curiosity)
3. **${titleVariants[2]}** (Hook)

## Thumbnail Code-Generated
- 16:9 Custom Thumbnail: \`${pkg.thumbnailFile ?? thumbs.thumbnailSvg}\`
- 9:16 Shorts Cover: \`${pkg.verticalThumbnailFile ?? 'none'}\`

---

## Caption / Deskripsi Video
\`\`\`text
${description}
\`\`\`

---

## Pinned Comment
> ${pinnedComment}
`

  writeJson(p.publishJson, pkg)
  fs.writeFileSync(p.publish, mdContent)

  setStage(
    state,
    'publish',
    'done',
    sha256(pkg),
    'Paket publikasi & thumbnail siap di publish.md, publish.json, exports/thumbnail.png'
  )
  saveState(state)

  return pkg
}
