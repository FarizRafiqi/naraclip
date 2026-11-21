import fs from 'node:fs'
import path from 'node:path'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import WorkspaceAsset from '#models/workspace_asset'

export default class StorageSyncAssets extends BaseCommand {
  static commandName = 'storage:sync-assets'
  static description = 'Sync local and S3 storage manifests into workspace_assets table'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Mulai sinkronisasi workspace_assets...')

    const manifestFiles: string[] = []

    // 1. Channel 1 manifests
    const c1Dir = path.resolve('packages/hyperframes/content')
    if (fs.existsSync(c1Dir)) {
      for (const entry of fs.readdirSync(c1Dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const m = path.join(c1Dir, entry.name, 'storage-manifest.json')
          if (fs.existsSync(m)) manifestFiles.push(m)
        }
      }
    }

    // 2. Channel 2 manifests
    const c2Dir = path.resolve('content')
    if (fs.existsSync(c2Dir)) {
      for (const entry of fs.readdirSync(c2Dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const m = path.join(c2Dir, entry.name, 'storage-manifest.json')
          if (fs.existsSync(m)) manifestFiles.push(m)
        }
      }
    }

    let insertedCount = 0
    let updatedCount = 0

    for (const mf of manifestFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(mf, 'utf-8'))
        this.logger.info(`Memproses [${data.channel}] ${data.slug} (${data.assets?.length || 0} aset)...`)

        for (const asset of data.assets || []) {
          const existing = await WorkspaceAsset.query()
            .where('storage_key', asset.storageKey)
            .first()

          if (existing) {
            existing.merge({
              workspaceSlug: data.slug,
              channel: data.channel,
              assetPath: asset.sourcePath,
              storageDriver: data.driver || 's3',
              originalMime: asset.originalMime,
              compressedMime: asset.compressedMime,
              originalByteSize: asset.originalBytes,
              compressedByteSize: asset.compressedBytes,
              checksumSha256: asset.checksumSha256,
            })
            await existing.save()
            updatedCount++
          } else {
            await WorkspaceAsset.create({
              workspaceSlug: data.slug,
              channel: data.channel,
              assetPath: asset.sourcePath,
              storageDriver: data.driver || 's3',
              storageKey: asset.storageKey,
              originalMime: asset.originalMime,
              compressedMime: asset.compressedMime,
              originalByteSize: asset.originalBytes,
              compressedByteSize: asset.compressedBytes,
              checksumSha256: asset.checksumSha256,
            })
            insertedCount++
          }
        }
      } catch (err: any) {
        this.logger.error(`Gagal membaca ${mf}: ${err.message}`)
      }
    }

    this.logger.success(`Selesai! Ditambahkan: ${insertedCount}, Diperbarui: ${updatedCount}`)
  }
}
