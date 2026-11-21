import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Storyboard, Timing } from '@naraclip/contracts'

const SAMPLE_RATE = 48000
const MASTER_GAIN = 0.7
const SFX_ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/sfx')
const sfxSampleCache = new Map<string, Float32Array>()

/** Tier 3 fallback: Muat sampel WAV eksternal (48kHz mono PCM16) jika sintesis Web Audio tidak mencukupi */
function loadWavSamples(fileName: string, gain = 1, maxSec = 0.6): Float32Array | null {
  const cacheKey = `wav:${fileName}:${gain}:${maxSec}`
  const cached = sfxSampleCache.get(cacheKey)
  if (cached) return cached

  const fullPath = path.join(SFX_ASSETS_DIR, fileName)
  if (!fs.existsSync(fullPath)) return null

  const buf = fs.readFileSync(fullPath)
  if (buf.length <= 44) return null

  let offset = 12
  let dataOffset = 44
  let dataSize = buf.length - 44
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      dataOffset = offset + 8
      dataSize = Math.min(chunkSize, buf.length - dataOffset)
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }

  const maxSamples = Math.floor(maxSec * SAMPLE_RATE)
  const count = Math.min(maxSamples, Math.floor(dataSize / 2))
  const out = new Float32Array(count)
  const fadeSamples = Math.min(Math.floor(0.025 * SAMPLE_RATE), Math.floor(count * 0.25))
  for (let i = 0; i < count; i++) {
    let val = (buf.readInt16LE(dataOffset + i * 2) / 32768) * gain
    if (i >= count - fadeSamples && fadeSamples > 0) {
      val *= (count - i) / fadeSamples
    }
    out[i] = val
  }
  sfxSampleCache.set(cacheKey, out)
  return out
}

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth'
type FilterType = 'bandpass' | 'highpass' | 'lowpass'

interface RngState {
  seed: number
}

/** PRNG deterministik ringan untuk layer noise SFX agar reproduksibel */
function nextNoise(state: RngState): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0
  return (state.seed / 0xffffffff) * 2 - 1
}

function randRange(rng: RngState, a: number, b: number): number {
  return a + ((nextNoise(rng) + 1) * 0.5) * (b - a)
}

interface OfflineWebAudioCtx {
  layers: Array<{ offset: number; samples: Float32Array }>
  totalSamples: number
  rng: RngState
}

function createOfflineCtx(seed = 1337): OfflineWebAudioCtx {
  return { layers: [], totalSamples: 0, rng: { seed } }
}

function envelopeAt(u: number, dur: number, g: number, at: number): number {
  const minVal = 0.0001
  const atClamped = Math.min(Math.max(at, 0.0002), dur * 0.95)
  const peak = Math.max(g, minVal)
  if (u < 0) return 0
  if (u <= atClamped) {
    return minVal + (peak - minVal) * (u / atClamped)
  }
  if (u <= dur) {
    const rem = Math.max(1e-6, dur - atClamped)
    const frac = (u - atClamped) / rem
    return peak * Math.pow(minVal / peak, frac)
  }
  // Short fade from -80dB to exact 0 over 20ms to avoid DC stop step
  const tail = Math.min(1, Math.max(0, 1 - (u - dur) / 0.02))
  return minVal * tail
}

function sampleOsc(type: OscType, phase: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase)
    case 'square':
      return phase < 0.5 ? 1 : -1
    case 'triangle':
      if (phase < 0.25) return 4 * phase
      if (phase < 0.75) return 2 - 4 * phase
      return 4 * phase - 4
    case 'sawtooth':
      return phase < 0.5 ? 2 * phase : 2 * phase - 2
  }
}

/**
 * Web Audio API offline `tone()` primitive matching Claude's synthesizer signature:
 * osilator (type, f1 -> f2 exp ramp, dur, gain, delay t, attack at)
 */
function tone(
  ctx: OfflineWebAudioCtx,
  type: OscType,
  f1: number,
  f2: number,
  dur: number,
  g = 0.3,
  t = 0,
  at = 0.005
): void {
  const renderDur = dur + 0.02
  const len = Math.max(1, Math.ceil(renderDur * SAMPLE_RATE))
  const offset = Math.max(0, Math.round(t * SAMPLE_RATE))
  const buf = new Float32Array(len)
  const f1Safe = Math.max(f1, 1)
  const f2Safe = Math.max(f2, 1)
  let phase = 0

  for (let i = 0; i < len; i++) {
    const u = i / SAMPLE_RATE
    const frac = Math.min(1, u / Math.max(dur, 1e-6))
    const freq = f2 === f1 ? f1Safe : f1Safe * Math.pow(f2Safe / f1Safe, frac)
    phase = (phase + freq / SAMPLE_RATE) % 1
    buf[i] = sampleOsc(type, phase) * envelopeAt(u, dur, g, at) * MASTER_GAIN
  }

  ctx.layers.push({ offset, samples: buf })
  ctx.totalSamples = Math.max(ctx.totalSamples, offset + len)
}

/**
 * Web Audio API offline `noise()` primitive matching Claude's synthesizer signature:
 * white noise -> W3C BiquadFilterNode (constant 0 dB bandpass / highpass / lowpass) -> Gain envelope
 */
function noise(
  ctx: OfflineWebAudioCtx,
  type: FilterType,
  f1: number,
  f2: number,
  dur: number,
  g = 0.3,
  t = 0,
  q = 1,
  at = 0.005
): void {
  const renderDur = dur + 0.04
  const len = Math.max(1, Math.ceil(renderDur * SAMPLE_RATE))
  const offset = Math.max(0, Math.round(t * SAMPLE_RATE))
  const buf = new Float32Array(len)

  const f1Safe = Math.max(20, Math.min(f1, SAMPLE_RATE * 0.45))
  const f2Safe = Math.max(20, Math.min(Math.max(f2, 1), SAMPLE_RATE * 0.45))
  const qSafe = Math.max(0.05, q)

  // Direct Form I biquad state keeps exponential frequency sweeps unconditionally bounded
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0

  for (let i = 0; i < len; i++) {
    const u = i / SAMPLE_RATE
    const frac = Math.min(1, u / Math.max(dur, 1e-6))
    const cutoff = f2 === f1 ? f1Safe : f1Safe * Math.pow(f2Safe / f1Safe, frac)
    const w0 = (2 * Math.PI * cutoff) / SAMPLE_RATE
    const cosW = Math.cos(w0)
    const sinW = Math.sin(w0)
    const alpha = sinW / (2 * qSafe)

    let b0 = 0
    let b1 = 0
    let b2 = 0
    if (type === 'lowpass') {
      b0 = (1 - cosW) * 0.5
      b1 = 1 - cosW
      b2 = b0
    } else if (type === 'highpass') {
      b0 = (1 + cosW) * 0.5
      b1 = -(1 + cosW)
      b2 = b0
    } else {
      // W3C Web Audio bandpass uses constant 0 dB peak gain (b0 = alpha, b1 = 0, b2 = -alpha)
      b0 = alpha
      b1 = 0
      b2 = -alpha
    }
    const a0 = 1 + alpha
    const a1 = -2 * cosW
    const a2 = 1 - alpha

    const x0 = nextNoise(ctx.rng)
    let y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    if (!Number.isFinite(y0)) y0 = 0
    y0 = Math.max(-4, Math.min(4, y0))

    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0

    buf[i] = y0 * envelopeAt(u, dur, g, at) * MASTER_GAIN
  }

  ctx.layers.push({ offset, samples: buf })
  ctx.totalSamples = Math.max(ctx.totalSamples, offset + len)
}

function finalizeCtx(ctx: OfflineWebAudioCtx): Float32Array {
  const out = new Float32Array(Math.max(1, ctx.totalSamples))
  for (const layer of ctx.layers) {
    for (let i = 0; i < layer.samples.length; i++) {
      const idx = layer.offset + i
      if (idx < out.length) {
        out[idx] += layer.samples[i]
      }
    }
  }
  return out
}

export const CLAUDE_SFX_PRESETS: Record<string, (ctx: OfflineWebAudioCtx) => void> = {
  // ===== TRANSISI =====
  whoosh: (c) => noise(c, 'bandpass', 400, 2500, 0.45, 0.4, 0, 1.5, 0.18),
  whooshUp: (c) => noise(c, 'bandpass', 200, 4000, 0.6, 0.4, 0, 1.2, 0.4),
  whooshDown: (c) => noise(c, 'bandpass', 3500, 200, 0.6, 0.4, 0, 1.2, 0.05),
  swipe: (c) => noise(c, 'highpass', 2000, 6000, 0.2, 0.25, 0, 0.7, 0.05),
  slideIn: (c) => {
    noise(c, 'bandpass', 1200, 500, 0.35, 0.3, 0, 2, 0.05)
    tone(c, 'sine', 500, 250, 0.3, 0.1)
  },
  riser: (c) => {
    tone(c, 'sawtooth', 120, 1200, 1.5, 0.15, 0, 1.3)
    noise(c, 'highpass', 500, 6000, 1.5, 0.15, 0, 0.7, 1.3)
  },
  reverseSwell: (c) => noise(c, 'lowpass', 200, 5000, 1.2, 0.35, 0, 0.8, 1.1),
  sweepHigh: (c) => noise(c, 'bandpass', 800, 8000, 0.5, 0.3, 0, 4, 0.3),

  // ===== UI =====
  pop: (c) => tone(c, 'sine', 700, 200, 0.12, 0.5),
  click: (c) => tone(c, 'square', 1800, 900, 0.03, 0.15, 0, 0.001),
  tick: (c) => tone(c, 'square', 2400, 2400, 0.02, 0.12, 0, 0.001),
  tap: (c) => tone(c, 'triangle', 500, 300, 0.08, 0.4),
  toggleOn: (c) => {
    tone(c, 'sine', 500, 500, 0.08, 0.3)
    tone(c, 'sine', 800, 800, 0.1, 0.3, 0.07)
  },
  toggleOff: (c) => {
    tone(c, 'sine', 800, 800, 0.08, 0.3)
    tone(c, 'sine', 500, 500, 0.1, 0.3, 0.07)
  },
  bubble: (c) => tone(c, 'sine', 300, 900, 0.15, 0.4),
  hover: (c) => tone(c, 'sine', 1200, 1400, 0.05, 0.1),
  select: (c) => tone(c, 'triangle', 660, 990, 0.12, 0.3),
  swish: (c) => noise(c, 'bandpass', 2500, 900, 0.12, 0.25, 0, 2, 0.02),

  // ===== IMPACT =====
  hit: (c) => {
    tone(c, 'sine', 140, 40, 0.35, 0.9, 0, 0.002)
    noise(c, 'lowpass', 800, 100, 0.2, 0.4, 0, 0.7, 0.002)
  },
  softHit: (c) => tone(c, 'sine', 180, 70, 0.3, 0.5),
  boom: (c) => {
    tone(c, 'sine', 80, 25, 1.4, 0.9, 0, 0.005)
    noise(c, 'lowpass', 600, 50, 1.2, 0.5, 0, 0.7, 0.005)
  },
  slam: (c) => {
    noise(c, 'lowpass', 3000, 200, 0.3, 0.7, 0, 0.8, 0.001)
    tone(c, 'sine', 120, 35, 0.4, 0.8, 0, 0.001)
  },
  punch: (c) => {
    tone(c, 'sine', 200, 60, 0.18, 0.8, 0, 0.001)
    noise(c, 'bandpass', 1500, 400, 0.08, 0.4, 0, 1, 0.001)
  },
  stamp: (c) => {
    noise(c, 'lowpass', 2000, 200, 0.12, 0.6, 0, 0.7, 0.001)
    tone(c, 'sine', 100, 50, 0.2, 0.7, 0, 0.001)
  },
  cymbal: (c) => noise(c, 'highpass', 6000, 6000, 1.5, 0.3, 0, 0.5, 0.002),

  // ===== NOTIFIKASI =====
  ding: (c) => {
    tone(c, 'sine', 1320, 1320, 0.9, 0.35, 0, 0.002)
    tone(c, 'sine', 2640, 2640, 0.5, 0.1, 0, 0.002)
  },
  bell: (c) => {
    tone(c, 'sine', 523, 523, 2, 0.3, 0, 0.002)
    tone(c, 'sine', 1046, 1046, 1.6, 0.15, 0, 0.002)
    tone(c, 'sine', 1568, 1568, 1.3, 0.1, 0, 0.002)
  },
  chime: (c) => {
    [784, 988, 1175].forEach((f, i) => tone(c, 'sine', f, f, 1.0, 0.25, i * 0.09, 0.003))
  },
  success: (c) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, 0.25, 0.28, i * 0.08))
  },
  error: (c) => {
    tone(c, 'sawtooth', 220, 180, 0.25, 0.3)
    tone(c, 'sawtooth', 200, 150, 0.3, 0.3, 0.15)
  },
  warning: (c) => {
    tone(c, 'square', 880, 880, 0.12, 0.2)
    tone(c, 'square', 880, 880, 0.12, 0.2, 0.2)
  },
  notify: (c) => {
    tone(c, 'sine', 880, 880, 0.15, 0.3)
    tone(c, 'sine', 1175, 1175, 0.3, 0.3, 0.12)
  },
  coin: (c) => {
    tone(c, 'square', 988, 988, 0.07, 0.2)
    tone(c, 'square', 1319, 1319, 0.4, 0.2, 0.07)
  },
  levelUp: (c) => {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, 'square', f, f, 0.14, 0.18, i * 0.07))
  },
  okay: (c) => tone(c, 'sine', 600, 900, 0.1, 0.3),

  // ===== TEKS & DATA =====
  typewriter: (c) => {
    for (let i = 0; i < 9; i++) {
      const t = i * 0.09 + randRange(c.rng, 0, 0.03)
      noise(c, 'bandpass', 3000, 2000, 0.03, 0.25, t, 1, 0.001)
      tone(c, 'square', randRange(c.rng, 900, 1300), 600, 0.02, 0.08, t, 0.001)
    }
  },
  keyClick: (c) => {
    tone(c, 'square', 1500, 700, 0.025, 0.15, 0, 0.001)
    noise(c, 'highpass', 3000, 3000, 0.02, 0.15, 0, 0.5, 0.001)
  },
  counter: (c) => {
    for (let i = 0; i < 10; i++) {
      tone(c, 'square', 1000 + i * 80, 1000 + i * 80, 0.03, 0.1, i * 0.06, 0.001)
    }
  },
  blip: (c) => tone(c, 'square', 1000, 1000, 0.06, 0.2),
  dataStream: (c) => {
    for (let i = 0; i < 14; i++) {
      tone(c, 'sine', randRange(c.rng, 800, 2200), randRange(c.rng, 800, 2200), 0.05, 0.12, i * 0.045, 0.002)
    }
  },
  barGrow: (c) => tone(c, 'triangle', 200, 800, 0.4, 0.25, 0, 0.1),

  // ===== SCI-FI & GLITCH =====
  glitch: (c) => {
    for (let i = 0; i < 7; i++) {
      tone(c, 'square', randRange(c.rng, 100, 2500), randRange(c.rng, 100, 2500), 0.04, 0.18, i * 0.04, 0.001)
      noise(c, 'highpass', randRange(c.rng, 2000, 6000), 3000, 0.03, 0.15, i * 0.04, 1, 0.001)
    }
  },
  laser: (c) => tone(c, 'sawtooth', 2000, 200, 0.25, 0.25),
  zap: (c) => {
    noise(c, 'bandpass', 5000, 300, 0.2, 0.4, 0, 3, 0.001)
    tone(c, 'sawtooth', 1500, 100, 0.2, 0.2, 0, 0.001)
  },
  powerUp: (c) => tone(c, 'sawtooth', 150, 900, 0.6, 0.2, 0, 0.55),
  powerDown: (c) => tone(c, 'sawtooth', 900, 60, 0.7, 0.25),
  scan: (c) => {
    tone(c, 'sine', 400, 1600, 0.5, 0.2, 0, 0.25)
    tone(c, 'sine', 1600, 400, 0.5, 0.2, 0.5, 0.01)
  },
  beep: (c) => tone(c, 'sine', 1000, 1000, 0.15, 0.3),
  sonar: (c) => tone(c, 'sine', 1000, 1000, 1.2, 0.3, 0, 0.003),
  alarm: (c) => {
    for (let i = 0; i < 4; i++) {
      tone(c, 'square', i % 2 ? 600 : 900, i % 2 ? 600 : 900, 0.2, 0.18, i * 0.22, 0.005)
    }
  },

  // ===== LAIN-LAIN =====
  shutter: (c) => {
    noise(c, 'highpass', 4000, 4000, 0.03, 0.4, 0, 0.5, 0.001)
    noise(c, 'highpass', 3000, 3000, 0.05, 0.3, 0.06, 0.5, 0.001)
  },
  sparkle: (c) => {
    for (let i = 0; i < 9; i++) {
      tone(c, 'sine', randRange(c.rng, 2000, 6000), randRange(c.rng, 2000, 6000), 0.15, 0.12, i * 0.05, 0.002)
    }
  },
  drip: (c) => {
    tone(c, 'sine', 1400, 500, 0.1, 0.4)
    tone(c, 'sine', 900, 400, 0.15, 0.2, 0.1)
  },
  heartbeat: (c) => {
    tone(c, 'sine', 70, 40, 0.15, 0.9)
    tone(c, 'sine', 60, 35, 0.18, 0.7, 0.2)
  },
  shimmer: (c) => noise(c, 'highpass', 4000, 9000, 0.9, 0.15, 0, 2, 0.4),
  wind: (c) => noise(c, 'bandpass', 300, 700, 1.6, 0.3, 0, 3, 0.8),
}

const LEGACY_SFX_TO_CLAUDE: Record<string, string> = {
  'key-click': 'keyClick',
  'enter-thock': 'tap',
  'thud-heavy': 'slam',
  'clank-lock': 'toggleOn',
  'crate-wood': 'softHit',
  'whoosh-fast': 'swish',
  'whoosh-slow': 'whoosh',
  'pop-rise': 'bubble',
  'tick-rise': 'tick',
  'ratchet-decel': 'counter',
  'chime-ok': 'chime',
  'buzz-error': 'error',
  'glass-crack': 'zap',
  'power-down': 'powerDown',
  'relay-click': 'click',
  'power-on-riser': 'riser',
  crumple: 'shutter',
  'water-bed': 'wind',
  'ship-horn': 'boom',
}

function generateCueSamples(sfx: string): Float32Array {
  const presetName = CLAUDE_SFX_PRESETS[sfx]
    ? sfx
    : LEGACY_SFX_TO_CLAUDE[sfx] && CLAUDE_SFX_PRESETS[LEGACY_SFX_TO_CLAUDE[sfx]]
      ? LEGACY_SFX_TO_CLAUDE[sfx]
      : sfx

  const cacheKey = `claude:${presetName}`
  const cached = sfxSampleCache.get(cacheKey)
  if (cached) return cached

  // Tier 1: Claude Web Audio API preset synthesizer
  const synth = CLAUDE_SFX_PRESETS[presetName]
  if (synth) {
    const ctx = createOfflineCtx(1337)
    synth(ctx)
    const out = finalizeCtx(ctx)
    sfxSampleCache.set(cacheKey, out)
    return out
  }

  // Tier 3 fallback: External WAV asset in packages/pipeline/assets/sfx/
  return loadWavSamples(`${presetName}.wav`, 0.5, 0.5) ?? new Float32Array(0)
}

function addCueAtMs(track: Float32Array, sfx: string, atMs: number) {
  if (!sfx || sfx === 'none') return
  const cue = generateCueSamples(sfx)
  if (cue.length === 0) return
  const offset = Math.floor((atMs / 1000) * SAMPLE_RATE)
  for (let i = 0; i < cue.length; i++) {
    const idx = offset + i
    if (idx >= 0 && idx < track.length) {
      track[idx] += cue[i]
    }
  }
}

function writeMonoPcmWav(filePath: string, samples: Float32Array) {
  const dataBytes = samples.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < samples.length; i++) {
    const soft = Math.tanh(samples[i] * 1.1)
    const clamped = Math.max(-1, Math.min(1, soft))
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buf)
}

export function exportClaudeSfxWavPack(outDir: string): Array<{ name: string; file: string; durationMs: number }> {
  fs.mkdirSync(outDir, { recursive: true })
  const entries: Array<{ name: string; file: string; durationMs: number }> = []
  for (const name of Object.keys(CLAUDE_SFX_PRESETS)) {
    const samples = generateCueSamples(name)
    const file = `${name}.wav`
    writeMonoPcmWav(path.join(outDir, file), samples)
    entries.push({
      name,
      file,
      durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
    })
  }
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        sampleRate: SAMPLE_RATE,
        channels: 1,
        format: 'pcm_s16le',
        source: 'claude-web-audio-pack',
        presets: entries,
      },
      null,
      2
    )
  )
  return entries
}

export function buildSfxTrack(
  storyboard: Storyboard,
  timing: Timing,
  outSfxWav: string
) {
  const totalSamples = Math.max(SAMPLE_RATE, Math.ceil((timing.durationMs / 1000) * SAMPLE_RATE))
  const track = new Float32Array(totalSamples)
  const timingMap = new Map(timing.shots.map((s) => [s.shotId, s]))

  for (const shot of storyboard.shots) {
    const t = timingMap.get(shot.id)
    if (!t) continue
    if (shot.sfx && shot.sfx !== 'none') {
      addCueAtMs(track, shot.sfx, t.startMs)
    }
    if (shot.cues) {
      for (const cue of shot.cues) {
        if (cue.sfx && cue.sfx !== 'none') {
          addCueAtMs(track, cue.sfx, t.startMs + cue.atMs)
        }
      }
    }
  }

  // Soft-knee limiting di atas 0.72 (plafon 0.88) agar tumpang-tindih cue bebas hard-clipping
  for (let i = 0; i < track.length; i++) {
    const abs = Math.abs(track[i])
    if (abs > 0.72) {
      const excess = (abs - 0.72) / (1 - 0.72)
      track[i] = Math.sign(track[i]) * (0.72 + 0.16 * Math.tanh(excess))
    }
  }

  writeMonoPcmWav(outSfxWav, track)
}

export function buildMixedAudio(
  voiceWav: string,
  storyboard: Storyboard,
  timing: Timing,
  outMasterWav: string
): void {
  fs.mkdirSync(path.dirname(outMasterWav), { recursive: true })
  const sfxWav = path.join(path.dirname(outMasterWav), 'sfx-cues.wav')
  buildSfxTrack(storyboard, timing, sfxWav)

  if (!fs.existsSync(voiceWav) || fs.statSync(voiceWav).size < 1000) {
    fs.copyFileSync(voiceWav, outMasterWav)
    return
  }

  // Sidechain ringan agar SFX Web Audio Claude terdengar halus & presisi tanpa menutup narasi
  const res = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      voiceWav,
      '-i',
      sfxWav,
      '-filter_complex',
      '[0:a]aresample=48000,asplit=2[v_mix][v_sc];[1:a]aresample=48000,volume=1.35,alimiter=limit=0.88:level=false[s_raw];[s_raw][v_sc]sidechaincompress=threshold=0.09:ratio=1.9:attack=8:release=90[s_ducked];[v_mix][s_ducked]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:LRA=11:TP=-1.5[out]',
      '-map',
      '[out]',
      '-ar',
      '48000',
      '-ac',
      '1',
      outMasterWav,
    ],
    { encoding: 'utf8', timeout: 60000 }
  )

  if (res.status !== 0 || !fs.existsSync(outMasterWav) || fs.statSync(outMasterWav).size < 1000) {
    fs.copyFileSync(voiceWav, outMasterWav)
  }
}
