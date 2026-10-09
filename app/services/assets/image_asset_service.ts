import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Asset from '#models/asset'
import MinioStorage, { type StorageUploadInput } from '#services/storage/minio_storage'
import type { ProviderConfigSnapshot } from '@naraclip/contracts'
import { resolveImageProvider, type ImageProvider } from '#services/providers/image_provider'

export type AssetStorage = Pick<MinioStorage, 'upload'>

export default class ImageAssetService {
  constructor(
    private readonly provider?: ImageProvider,
    private readonly storage: AssetStorage = new MinioStorage()
  ) {}

  async generateForScene(input: {
    sceneId: number
    userId: number
    projectId: number
    prompt: string
    snapshot: ProviderConfigSnapshot
    width?: number
    height?: number
  }) {
    const promptHash = createHash('sha256')
      .update(`${input.snapshot.providerId}:${input.snapshot.model}:${input.prompt}`)
      .digest('hex')
    const existing = await Asset.query()
      .where('kind', 'image')
      .where('providerId', input.snapshot.providerId)
      .where('providerAssetId', promptHash)
      .first()

    if (existing) {
      await this.linkToScene(input.sceneId, existing.id)
      return { asset: existing, reused: true }
    }

    const provider = this.provider ?? resolveImageProvider(input.snapshot.providerId)
    const result = await provider.generate(
      {
        prompt: input.prompt,
        width: input.width ?? 1080,
        height: input.height ?? 1920,
      },
      input.snapshot
    )
    const checksumSha256 = createHash('sha256').update(result.body).digest('hex')
    const filename = result.mimeType === 'image/svg+xml' ? 'asset.svg' : 'asset.png'
    const storageKey = MinioStorage.buildKey({
      userId: input.userId,
      projectId: input.projectId,
      assetId: promptHash.slice(0, 16),
      kind: 'image',
      filename,
    })
    const upload: StorageUploadInput = {
      key: storageKey,
      body: result.body,
      contentType: result.mimeType,
      byteSize: result.body.byteLength,
      checksumSha256,
      metadata: { providerId: input.snapshot.providerId, promptHash },
    }
    await this.storage.upload(upload)

    const asset = await Asset.create({
      kind: 'image',
      source: 'generated',
      status: 'available',
      storageKey,
      mimeType: result.mimeType,
      byteSize: result.body.byteLength,
      width: result.width,
      height: result.height,
      checksumSha256,
      providerId: input.snapshot.providerId,
      providerAssetId: promptHash,
      metadata: JSON.stringify({
        ...result.metadata,
        promptHash,
        prompt: input.prompt,
        model: input.snapshot.model,
        configSnapshot: input.snapshot,
      }),
    })
    await this.linkToScene(input.sceneId, asset.id)

    return { asset, reused: false, providerResult: result }
  }

  private async linkToScene(sceneId: number, assetId: number) {
    const existing = await db
      .query()
      .from('scene_assets')
      .where({ scene_id: sceneId, asset_id: assetId, role: 'visual' })
      .first()
    if (existing) return

    await db
      .insertQuery()
      .table('scene_assets')
      .insert({
        scene_id: sceneId,
        asset_id: assetId,
        role: 'visual',
        sequence_no: 0,
        created_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
  }
}
