import type { ProviderConfigSnapshot } from '@naraclip/contracts'

export type WordTiming = {
  word: string
  startMs: number
  endMs: number
}

export type TtsInput = {
  text: string
  voice: string
}

export type TtsProviderResult = {
  body: Uint8Array
  mimeType: 'audio/wav'
  durationMs: number
  wordTimings?: WordTiming[]
  metadata: Record<string, unknown>
}

export interface TtsProvider {
  synthesize(input: TtsInput, snapshot: ProviderConfigSnapshot): Promise<TtsProviderResult>
}

function estimateDurationMs(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1000, Math.ceil((wordCount / 2.5) * 1000))
}

function createSilentWav(durationMs: number) {
  const sampleRate = 8000
  const sampleCount = Math.ceil((durationMs / 1000) * sampleRate)
  const bytes = Buffer.alloc(44 + sampleCount, 128)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + sampleCount, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate, 28)
  bytes.writeUInt16LE(1, 32)
  bytes.writeUInt16LE(8, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(sampleCount, 40)
  return bytes
}

export default class DeterministicTtsProvider implements TtsProvider {
  async synthesize(input: TtsInput, _snapshot: ProviderConfigSnapshot) {
    const durationMs = estimateDurationMs(input.text)
    return {
      body: createSilentWav(durationMs),
      mimeType: 'audio/wav' as const,
      durationMs,
      metadata: { deterministic: true, voice: input.voice },
    }
  }
}
