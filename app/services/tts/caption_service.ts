import type { CaptionCue, CaptionStyle } from '@naraclip/contracts'
import type { WordTiming } from './tts_provider.js'

export function normalizeWordTimings(timings: WordTiming[], durationMs: number) {
  return timings
    .map((timing) => ({
      word: timing.word.trim(),
      startMs: Math.max(0, Math.min(durationMs, Math.round(timing.startMs))),
      endMs: Math.max(0, Math.min(durationMs, Math.round(timing.endMs))),
    }))
    .filter((timing) => timing.word && timing.endMs > timing.startMs)
    .sort((left, right) => left.startMs - right.startMs)
}

export function buildWordTimings(text: string, durationMs: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const totalCharacters = words.reduce((total, word) => total + word.length, 0)
  let cursor = 0

  return words.map((word, index) => {
    const duration = Math.max(80, Math.round((word.length / totalCharacters) * durationMs))
    const startMs = cursor
    const endMs = index === words.length - 1 ? durationMs : Math.min(durationMs, cursor + duration)
    cursor = endMs
    return { word, startMs, endMs }
  })
}

export function buildCaptionCues(
  timings: WordTiming[],
  durationMs: number,
  style: CaptionStyle
): CaptionCue[] {
  const normalized = normalizeWordTimings(timings, durationMs)
  const cues: CaptionCue[] = []

  for (let index = 0; index < normalized.length; index += 5) {
    const words = normalized.slice(index, index + 5)
    const first = words[0]
    const last = words.at(-1)
    if (!first || !last) continue

    cues.push({
      text: words
        .map((word) => word.word)
        .join(' ')
        .slice(0, 180),
      startMs: first.startMs,
      endMs: Math.min(durationMs, last.endMs),
      emphasis: index === 0 ? 'keyword' : 'normal',
    })
  }

  return cues
    .filter((cue) => cue.endMs > cue.startMs)
    .map((cue) => ({
      ...cue,
      endMs: Math.min(cue.endMs, durationMs),
      text: style.maxLines > 1 ? cue.text : cue.text.split(' ').slice(0, 3).join(' '),
    }))
}
