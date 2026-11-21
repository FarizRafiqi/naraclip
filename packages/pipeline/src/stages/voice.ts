import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  STYLE_PROFILES,
  TimingSchema,
  validateTiming,
  type Brief,
  type Script,
  type Storyboard,
  type Timing,
  type WordTiming,
} from '@naraclip/contracts'
import { llmRunnerName } from '../llm.js'
import {
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

export function generateRecordingScript(brief: Brief, script: Script): string {
  const lines: string[] = [
    `# Panduan Rekaman Voiceover: ${brief.title}`,
    '',
    `**Slug**: \`${brief.slug}\``,
    `**Gaya**: ${brief.style}`,
    `**Target Durasi**: ~${brief.targetDurationSec} detik`,
    `**Tone / Emosi**: ${brief.tone}`,
    '',
    '## Petunjuk Penting untuk Voiceover',
    '1. Gunakan mic condenser / headset dengan ruang tenang minim gema.',
    '2. Intonasi santai, ekspresif, dan berenergi.',
    '3. Beri jeda 0.5 detik di awal dan akhir rekaman.',
    `4. Simpan file rekaman audio di folder: \`content/${brief.slug}/voice/source/recording.wav\`.`,
    '',
    '---',
    '',
    '## Naskah Rekaman per Beat',
    '',
  ]

  let runningWords = 0
  for (let i = 0; i < script.beats.length; i++) {
    const beat = script.beats[i]
    const words = beat.narration.trim().split(/\s+/).length
    runningWords += words
    const estSec = (words / 2.5).toFixed(1)

    lines.push(`### Beat ${i + 1} [\`${beat.id}\`] (~${estSec} detik)`)
    if (beat.onScreenText) {
      lines.push(`> *Teks referensi*: **${beat.onScreenText}**`)
    }
    lines.push('')
    lines.push(`"${beat.narration}"`)
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Total estimasi: ${runningWords} kata (~${(runningWords / 2.5).toFixed(1)} detik)*`)

  return lines.join('\n')
}

export function getAudioDurationMs(filePath: string): number {
  try {
    const res = spawnSync(
      'ffprobe',
      ['-i', filePath, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'],
      { encoding: 'utf8' }
    )
    if (res.status === 0 && res.stdout.trim()) {
      const sec = parseFloat(res.stdout.trim())
      if (!isNaN(sec) && sec > 0) return Math.round(sec * 1000)
    }
  } catch {
    // fallback
  }
  return 0
}

function synthesizeMockAudio(outFile: string, durationSec: number) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  const res = spawnSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-t',
    durationSec.toFixed(2),
    outFile,
  ])
  if (res.status !== 0) {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(48000, 24)
    header.writeUInt32LE(96000, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36)
    header.writeUInt32LE(0, 40)
    fs.writeFileSync(outFile, header)
  }
}

type EdgeTtsResult = {
  durationMs: number
  beats: Array<{ beatId: string; startMs: number; endMs: number }>
  words: WordTiming[]
}

function synthesizeAllBeatsEdgeTts(
  beats: Array<{ id: string; text: string }>,
  voiceDir: string,
  outVoiceWav: string,
  voiceName: string,
  rate: string
): EdgeTtsResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-tts-'))
  const specFile = path.join(tmpDir, 'spec.json')
  const pyFile = path.join(tmpDir, 'synth.py')
  const outJsonFile = path.join(tmpDir, 'result.json')

  fs.writeFileSync(
    specFile,
    JSON.stringify({
      beats,
      voiceDir,
      outVoiceWav,
      voiceName,
      rate,
      outJsonFile,
    })
  )

  const pyScript = `import asyncio, json, pathlib, subprocess, wave
import edge_tts

spec = json.loads(pathlib.Path(${JSON.stringify(specFile)}).read_text())
voice_dir = pathlib.Path(spec["voiceDir"])
voice_dir.mkdir(parents=True, exist_ok=True)

SR = 48000
GAP_MS = 110
TAIL_MS = 280

async def synth_all():
    results = []
    for i, b in enumerate(spec["beats"]):
        mp3_path = voice_dir / f"beat-{i+1}.mp3"
        wav_path = voice_dir / f"beat-{i+1}.wav"
        comm = edge_tts.Communicate(b["text"], voice=spec["voiceName"], rate=spec["rate"], boundary="WordBoundary")
        word_events = []
        audio_chunks = bytearray()
        async for ch in comm.stream():
            if ch["type"] == "audio":
                audio_chunks.extend(ch["data"])
            elif ch["type"] == "WordBoundary":
                start_ms = round(ch["offset"] / 10000)
                end_ms = round((ch["offset"] + ch["duration"]) / 10000)
                word_events.append({
                    "word": ch["text"].strip(),
                    "startMs": start_ms,
                    "endMs": max(start_ms + 30, end_ms),
                })
        mp3_path.write_bytes(bytes(audio_chunks))
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3_path), "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(wav_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with wave.open(str(wav_path), "rb") as w:
            total_frames = w.getnframes()
            raw_frames = w.readframes(total_frames)
        if word_events:
            last_end_ms = max(w["endMs"] for w in word_events)
            trim_frames = min(total_frames, max(1, int((last_end_ms + 160) / 1000 * SR)))
            raw_frames = raw_frames[:trim_frames * 2]
            dur_ms = round((trim_frames / SR) * 1000)
        else:
            dur_ms = round((total_frames / SR) * 1000)
        results.append({
            "beatId": b["id"],
            "rawFrames": raw_frames,
            "durationMs": dur_ms,
            "words": word_events,
        })
    return results

beat_data = asyncio.run(synth_all())

gap_bytes = b"\\x00" * (int(SR * GAP_MS / 1000) * 2)
tail_bytes = b"\\x00" * (int(SR * TAIL_MS / 1000) * 2)

combined = bytearray()
beat_timings = []
all_words = []
cursor_ms = 0

for idx, bd in enumerate(beat_data):
    beat_start = cursor_ms
    beat_dur = bd["durationMs"]
    combined.extend(bd["rawFrames"])
    if idx < len(beat_data) - 1:
        combined.extend(gap_bytes)
        beat_end = beat_start + beat_dur + GAP_MS
    else:
        combined.extend(tail_bytes)
        beat_end = beat_start + beat_dur + TAIL_MS

    beat_timings.append({"beatId": bd["beatId"], "startMs": beat_start, "endMs": beat_end})
    for w in bd["words"]:
        if w["word"]:
            all_words.append({
                "word": w["word"],
                "startMs": beat_start + w["startMs"],
                "endMs": beat_start + w["endMs"],
            })
    cursor_ms = beat_end

with wave.open(spec["outVoiceWav"], "wb") as out_w:
    out_w.setnchannels(1)
    out_w.setsampwidth(2)
    out_w.setframerate(SR)
    out_w.writeframes(bytes(combined))

actual_total_ms = round((len(combined) / 2 / SR) * 1000)
if beat_timings:
    beat_timings[-1]["endMs"] = actual_total_ms

pathlib.Path(spec["outJsonFile"]).write_text(json.dumps({
    "durationMs": actual_total_ms,
    "beats": beat_timings,
    "words": all_words,
}))
`
  fs.writeFileSync(pyFile, pyScript)

  try {
    const res = spawnSync('uv', ['run', '--with', 'edge-tts', 'python', pyFile], {
      encoding: 'utf8',
      timeout: 120000,
    })
    if (res.status !== 0 || !fs.existsSync(outJsonFile)) {
      throw new Error(`Edge-TTS sintesis gagal: ${(res.stderr || res.stdout || '').slice(-600)}`)
    }
    return JSON.parse(fs.readFileSync(outJsonFile, 'utf8')) as EdgeTtsResult
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const h = Math.floor(clamped / 3600000)
  const m = Math.floor((clamped % 3600000) / 60000)
  const s = Math.floor((clamped % 60000) / 1000)
  const milli = clamped % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`
}

function writeSrtFromWords(outFile: string, words: WordTiming[]) {
  if (words.length === 0) return
  const blocks: string[] = []
  let buf: WordTiming[] = []
  let chars = 0
  let idx = 1

  const flush = () => {
    if (buf.length === 0) return
    const start = formatSrtTime(buf[0].startMs)
    const end = formatSrtTime(buf[buf.length - 1].endMs)
    const text = buf.map((w) => w.word).join(' ')
    blocks.push(`${idx}\n${start} --> ${end}\n${text}`)
    idx++
    buf = []
    chars = 0
  }

  for (const w of words) {
    const nextLen = chars + (buf.length > 0 ? 1 : 0) + w.word.length
    if (buf.length > 0 && (buf.length >= 4 || nextLen > 25)) {
      flush()
    }
    buf.push(w)
    chars += (buf.length > 1 ? 1 : 0) + w.word.length
    if (/[.!?,;:]$/.test(w.word)) flush()
  }
  flush()

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, blocks.join('\n\n') + '\n')
}

export async function runVoice(
  slug: string,
  options: { force?: boolean } = {}
): Promise<Timing> {
  const p = paths(slug)
  const state = loadState(slug)
  const profile = STYLE_PROFILES[state.style]

  if (!fs.existsSync(p.brief) || !fs.existsSync(p.script) || !fs.existsSync(p.storyboard)) {
    throw new Error(`brief, script, atau storyboard belum lengkap untuk "${slug}".`)
  }

  const brief = readJson<Brief>(p.brief)
  const script = readJson<Script>(p.script)
  const storyboard = readJson<Storyboard>(p.storyboard)

  const voiceName = process.env.NC_TTS_VOICE || 'id-ID-ArdiNeural'
  const ttsRate = process.env.NC_TTS_RATE || '+15%'
  const candidateRecordingFiles = [
    path.join(p.voiceSourceDir, 'recording.wav'),
    path.join(p.voiceSourceDir, 'recording.mp3'),
    path.join(p.voiceSourceDir, 'recording.m4a'),
    path.join(p.voiceDir, 'recording.wav'),
  ]
  const foundRecording = candidateRecordingFiles.find(
    (f) => fs.existsSync(f) && fs.statSync(f).size > 1000
  )

  const inputHash = sha256({
    script,
    storyboardBeats: storyboard.shots.map((s) => ({ id: s.id, beatId: s.beatId, weight: s.weight })),
    voiceName,
    ttsRate,
    recordingSize: foundRecording ? fs.statSync(foundRecording).size : 0,
  })

  if (
    !options.force &&
    state.stages.voice.status === 'done' &&
    state.stages.voice.inputHash === inputHash &&
    fs.existsSync(p.timing) &&
    fs.existsSync(p.voiceWav)
  ) {
    return readJson<Timing>(p.timing)
  }

  fs.mkdirSync(p.voiceDir, { recursive: true })
  fs.mkdirSync(p.voiceSourceDir, { recursive: true })
  fs.writeFileSync(p.recordingScript, generateRecordingScript(brief, script))

  const isMock = llmRunnerName() === 'mock' || process.env.NC_MOCK_VOICE === '1'
  const finalVoiceWav = p.voiceWav

  let timingSource: 'recording' | 'tts' | 'mock' = 'tts'
  let totalDurationMs = 0
  let beatTimings: Array<{ beatId: string; startMs: number; endMs: number }> = []
  let wordTimings: WordTiming[] = []

function transcribeWithWhisper(wavPath: string): WordTiming[] | null {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-whisper-'))
  const pcmPath = path.join(tmpDir, 'audio16k.pcm')
  try {
    const ff = spawnSync(
      'ffmpeg',
      ['-y', '-i', wavPath, '-ar', '16000', '-ac', '1', '-f', 's16le', pcmPath],
      { encoding: 'utf8' }
    )
    if (ff.status !== 0 || !fs.existsSync(pcmPath)) return null

    const py = `import json, numpy as np
from faster_whisper import WhisperModel
audio = np.fromfile(${JSON.stringify(pcmPath)}, dtype=np.int16).astype(np.float32) / 32768.0
model = WhisperModel('small', device='cpu', compute_type='int8', local_files_only=True)
segments, _ = model.transcribe(audio, language='id', word_timestamps=True)
words = []
for seg in segments:
    for w in seg.words:
        t = w.word.strip()
        if t:
            words.append({'word': t, 'startMs': round(w.start * 1000), 'endMs': round(w.end * 1000)})
print(json.dumps(words))`
    const res = spawnSync('uv', ['run', '--with', 'faster-whisper', 'python', '-c', py], {
      encoding: 'utf8',
      timeout: 120000,
    })
    if (res.status !== 0 || !res.stdout.trim()) return null
    const parsed = JSON.parse(res.stdout.trim()) as WordTiming[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function alignBeatsWithWhisper(
  beats: Script['beats'],
  whisperWords: WordTiming[],
  totalDurationMs: number
): {
  beats: Array<{ beatId: string; startMs: number; endMs: number }>
  words: WordTiming[]
} {
  const scriptTokens: Array<{ beatIdx: number; word: string; norm: string }> = []
  beats.forEach((b, beatIdx) => {
    for (const w of b.narration.trim().split(/\s+/)) {
      if (w) scriptTokens.push({ beatIdx, word: w, norm: normalizeWord(w) })
    }
  })

  if (scriptTokens.length === 0 || whisperWords.length === 0) {
    return { beats: [], words: [] }
  }

  // Dynamic programming alignment between scriptTokens (N) and whisperWords (M)
  // Prevents cumulative drift when Whisper splits compound words (e.g. "Dockerfile" -> "docker file").
  const N = scriptTokens.length
  const M = whisperWords.length
  const wNorm = whisperWords.map((w) => normalizeWord(w.word))

  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0))
  for (let i = 1; i <= N; i++) dp[i][0] = i
  for (let j = 1; j <= M; j++) dp[0][j] = j

  for (let i = 1; i <= N; i++) {
    const a = scriptTokens[i - 1].norm
    for (let j = 1; j <= M; j++) {
      const b = wNorm[j - 1]
      const exact = a === b && a.length > 0
      const partial =
        !exact && a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))
      const subCost = exact ? 0 : partial ? 0.35 : 1.0
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost, dp[i - 1][j] + 0.9, dp[i][j - 1] + 0.9)
    }
  }

  // Backtrack to find matching whisper index range for each script token
  const mappedWhisperIndices: number[][] = Array.from({ length: N }, () => [])
  let i = N
  let j = M
  while (i > 0 && j > 0) {
    const a = scriptTokens[i - 1].norm
    const b = wNorm[j - 1]
    const exact = a === b && a.length > 0
    const partial =
      !exact && a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))
    const subCost = exact ? 0 : partial ? 0.35 : 1.0

    if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + subCost)) < 1e-6) {
      mappedWhisperIndices[i - 1].push(j - 1)
      i--
      j--
    } else if (Math.abs(dp[i][j] - (dp[i][j - 1] + 0.9)) < 1e-6) {
      // Extra whisper token (e.g. split word): attach to current/nearest script token
      if (i > 0) mappedWhisperIndices[i - 1].push(j - 1)
      j--
    } else {
      i--
    }
  }
  while (j > 0) {
    mappedWhisperIndices[0].push(j - 1)
    j--
  }

  const alignedWords: WordTiming[] = []
  const beatWordRanges = beats.map(() => ({ firstIdx: Infinity, lastIdx: -1 }))

  for (let idx = 0; idx < N; idx++) {
    const tok = scriptTokens[idx]
    const hits = mappedWhisperIndices[idx]
    let startMs: number
    let endMs: number
    if (hits.length > 0) {
      hits.sort((x, y) => x - y)
      startMs = whisperWords[hits[0]].startMs
      endMs = whisperWords[hits[hits.length - 1]].endMs
    } else {
      const prevEnd = idx > 0 ? alignedWords[idx - 1].endMs : 0
      startMs = prevEnd
      endMs = prevEnd + 160
    }
    alignedWords.push({
      word: tok.word,
      startMs,
      endMs: Math.max(startMs + 40, endMs),
    })
    const range = beatWordRanges[tok.beatIdx]
    if (idx < range.firstIdx) range.firstIdx = idx
    if (idx > range.lastIdx) range.lastIdx = idx
  }

  const beatTimings: Array<{ beatId: string; startMs: number; endMs: number }> = []
  let prevEnd = 0
  for (let bIdx = 0; bIdx < beats.length; bIdx++) {
    const isFirst = bIdx === 0
    const isLast = bIdx === beats.length - 1
    const range = beatWordRanges[bIdx]
    const startMs = isFirst ? 0 : prevEnd
    let endMs: number
    if (isLast) {
      endMs = totalDurationMs
    } else {
      const nextRange = beatWordRanges[bIdx + 1]
      const thisLastEnd = alignedWords[range.lastIdx]?.endMs ?? startMs + 500
      const nextFirstStart = alignedWords[nextRange.firstIdx]?.startMs ?? thisLastEnd + 100
      endMs = Math.max(startMs + 200, Math.round((thisLastEnd + nextFirstStart) / 2))
    }
    beatTimings.push({ beatId: beats[bIdx].id, startMs, endMs })
    prevEnd = endMs
  }

  return { beats: beatTimings, words: alignedWords }
}

  if (profile.voiceSource === 'recording' || Boolean(foundRecording)) {
    timingSource = 'recording'
    const found = foundRecording

    if (!found) {
      if (isMock) {
        timingSource = 'mock'
        const mockDurationSec = Math.max(15, brief.targetDurationSec || 30)
        synthesizeMockAudio(finalVoiceWav, mockDurationSec)
        totalDurationMs = mockDurationSec * 1000
      } else {
        setStage(
          state,
          'voice',
          'waiting',
          null,
          'Menunggu rekaman suara di voice/source/recording.wav. Baca naskah di voice/recording-script.md'
        )
        saveState(state)
        throw new Error(
          `Rekaman suara belum ditemukan di "${candidateRecordingFiles[0]}". Silakan rekam naskah sesuai panduan di "${p.recordingScript}".`
        )
      }
    } else {
      if (path.resolve(found) !== path.resolve(finalVoiceWav)) {
        spawnSync('ffmpeg', ['-y', '-i', found, '-ar', '48000', '-ac', '1', finalVoiceWav])
      }
      totalDurationMs = getAudioDurationMs(finalVoiceWav) || brief.targetDurationSec * 1000
    }

    const whisperWords = found && !isMock ? transcribeWithWhisper(finalVoiceWav) : null
    if (whisperWords) {
      const aligned = alignBeatsWithWhisper(script.beats, whisperWords, totalDurationMs)
      beatTimings = aligned.beats
      wordTimings = aligned.words
    } else {
      const totalWords = script.beats.reduce(
        (sum, b) => sum + b.narration.trim().split(/\s+/).length,
        0
      )
      let curBeatStart = 0
      for (let i = 0; i < script.beats.length; i++) {
        const beat = script.beats[i]
        const beatWords = beat.narration.trim().split(/\s+/)
        const ratio = beatWords.length / totalWords
        const isLast = i === script.beats.length - 1
        const beatDur = isLast ? totalDurationMs - curBeatStart : Math.round(totalDurationMs * ratio)
        const beatEnd = curBeatStart + beatDur
        beatTimings.push({ beatId: beat.id, startMs: curBeatStart, endMs: beatEnd })

        const wordDur = beatDur / beatWords.length
        beatWords.forEach((w, wi) => {
          wordTimings.push({
            word: w,
            startMs: Math.round(curBeatStart + wi * wordDur),
            endMs: Math.round(curBeatStart + (wi + 1) * wordDur),
          })
        })
        curBeatStart = beatEnd
      }
    }
  } else if (isMock) {
    timingSource = 'mock'
    const mockDurationSec = Math.max(15, brief.targetDurationSec || 20)
    synthesizeMockAudio(finalVoiceWav, mockDurationSec)
    totalDurationMs = mockDurationSec * 1000

    const totalWords = script.beats.reduce(
      (sum, b) => sum + b.narration.trim().split(/\s+/).length,
      0
    )
    let curBeatStart = 0
    for (let i = 0; i < script.beats.length; i++) {
      const beat = script.beats[i]
      const beatWords = beat.narration.trim().split(/\s+/)
      const ratio = beatWords.length / totalWords
      const isLast = i === script.beats.length - 1
      const beatDur = isLast ? totalDurationMs - curBeatStart : Math.round(totalDurationMs * ratio)
      const beatEnd = curBeatStart + beatDur
      beatTimings.push({ beatId: beat.id, startMs: curBeatStart, endMs: beatEnd })

      const wordDur = beatDur / beatWords.length
      beatWords.forEach((w, wi) => {
        wordTimings.push({
          word: w,
          startMs: Math.round(curBeatStart + wi * wordDur),
          endMs: Math.round(curBeatStart + (wi + 1) * wordDur),
        })
      })
      curBeatStart = beatEnd
    }
  } else {
    timingSource = 'tts'
    const res = synthesizeAllBeatsEdgeTts(
      script.beats.map((b) => ({ id: b.id, text: b.narration })),
      p.voiceDir,
      finalVoiceWav,
      voiceName,
      ttsRate
    )
    totalDurationMs = res.durationMs
    beatTimings = res.beats
    wordTimings = res.words
  }

  // Hitung shot timings berdasarkan porsi beat dan bobot shot
  const shotTimings: Array<{ shotId: string; startMs: number; endMs: number }> = []
  let globalCursor = 0

  for (const beatTiming of beatTimings) {
    const beatShots = storyboard.shots.filter((s) => s.beatId === beatTiming.beatId)
    const beatDuration = beatTiming.endMs - beatTiming.startMs
    const totalWeight = beatShots.reduce((w, s) => w + s.weight, 0) || 1

    for (let j = 0; j < beatShots.length; j++) {
      const shot = beatShots[j]
      const isLastInBeat = j === beatShots.length - 1
      const shotDur = isLastInBeat
        ? beatTiming.endMs - globalCursor
        : Math.round((beatDuration * shot.weight) / totalWeight)
      const shotStart = globalCursor
      const shotEnd = shotStart + shotDur

      shotTimings.push({ shotId: shot.id, startMs: shotStart, endMs: shotEnd })
      globalCursor = shotEnd
    }
  }

  if (shotTimings.length > 0) {
    shotTimings[shotTimings.length - 1].endMs = totalDurationMs
  }

  const timing: Timing = {
    schemaVersion: 1,
    voiceFile: path.relative(p.dir, finalVoiceWav),
    durationMs: totalDurationMs,
    source: timingSource,
    words: wordTimings,
    beats: beatTimings,
    shots: shotTimings,
  }

  const timingIssues = validateTiming(timing, storyboard)
  if (timingIssues.length > 0) {
    throw new Error(`Timing tidak valid:\n${timingIssues.map((i) => `- ${i}`).join('\n')}`)
  }

  TimingSchema.parse(timing)
  writeJson(p.timing, timing)
  writeSrtFromWords(path.join(p.exports, `${slug}.id.srt`), wordTimings)

  setStage(
    state,
    'voice',
    'done',
    inputHash,
    `Voice timing selesai (${(totalDurationMs / 1000).toFixed(2)}s, ${timingSource}, ${wordTimings.length} kata)`
  )
  saveState(state)

  return timing
}
