import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Asset from '#models/asset'
import R2Storage, { type R2UploadInput } from '#services/storage/r2_storage'
import type { CaptionStyle, ProviderConfigSnapshot } from '@naraclip/contracts'
import DeterministicTtsProvider, { type TtsProvider } from './tts_provider.js'
import { buildCaptionCues, buildWordTimings, normalizeWordTimings } from './caption_service.js'

type AudioStorage = Pick<R2Storage, 'upload'>

function parseAssetMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'bold-karaoke',
  safeArea: 'default',
  maxLines: 2,
  position: 'bottom',
}

export default class TtsService {
  constructor(
    private readonly provider: TtsProvider = new DeterministicTtsProvider(),
    private readonly storage: AudioStorage = new R2Storage()
  ) {}

  async synthesizeForScene(input: {
    sceneId: number
    userId: number
    projectId: number
    text: string
    snapshot: ProviderConfigSnapshot
    voice?: string
    captionStyle?: CaptionStyle
  }) {
    const voice = input.voice ?? String(input.snapshot.config.voice ?? 'local-default')
    const providerAssetId = createHash('sha256')
      .update(`${input.snapshot.providerId}:${input.snapshot.model}:${voice}:${input.text}`)
      .digest('hex')
    const existing = await Asset.query()
      .where('kind', 'audio')
      .where('providerId', input.snapshot.providerId)
      .where('providerAssetId', providerAssetId)
      .first()

    const style = input.captionStyle ?? DEFAULT_CAPTION_STYLE
    if (existing) {
      const metadata = parseAssetMetadata(existing.metadata)
      const durationMs = Number(metadata.durationMs ?? 1000)
      const wordTimings = buildWordTimings(input.text, durationMs)
      return {
        asset: existing,
        reused: true,
        durationMs,
        wordTimings,
        captionCues: buildCaptionCues(wordTimings, durationMs, style),
        captionStyle: style,
      }
    }

    const result = await this.provider.synthesize({ text: input.text, voice }, input.snapshot)
    const durationMs = Math.max(1, Math.round(result.durationMs))
    const wordTimings = normalizeWordTimings(
      result.wordTimings ?? buildWordTimings(input.text, durationMs),
      durationMs
    )
    const checksumSha256 = createHash('sha256').update(result.body).digest('hex')
    const storageKey = R2Storage.buildKey({
      userId: input.userId,
      projectId: input.projectId,
      assetId: providerAssetId.slice(0, 16),
      kind: 'audio',
      filename: 'narration.wav',
    })
    const upload: R2UploadInput = {
      key: storageKey,
      body: result.body,
      contentType: result.mimeType,
      byteSize: result.body.byteLength,
      checksumSha256,
      metadata: { providerId: input.snapshot.providerId, providerAssetId, voice },
    }
    await this.storage.upload(upload)

    const asset = await Asset.create({
      kind: 'audio',
      source: 'generated',
      status: 'available',
      storageKey,
      mimeType: result.mimeType,
      byteSize: result.body.byteLength,
      checksumSha256,
      providerId: input.snapshot.providerId,
      providerAssetId,
      metadata: JSON.stringify({
        ...result.metadata,
        durationMs,
        voice,
        text: input.text,
        model: input.snapshot.model,
        configSnapshot: input.snapshot,
      }),
    })
    await this.linkToScene(input.sceneId, asset.id)

    return {
      asset,
      reused: false,
      durationMs,
      wordTimings,
      captionCues: buildCaptionCues(wordTimings, durationMs, style),
      captionStyle: style,
    }
  }

  private async linkToScene(sceneId: number, assetId: number) {
    const existing = await db
      .query()
      .from('scene_assets')
      .where({ scene_id: sceneId, asset_id: assetId, role: 'audio' })
      .first()
    if (existing) return

    await db
      .insertQuery()
      .table('scene_assets')
      .insert({
        scene_id: sceneId,
        asset_id: assetId,
        role: 'audio',
        sequence_no: 0,
        created_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
  }
}
