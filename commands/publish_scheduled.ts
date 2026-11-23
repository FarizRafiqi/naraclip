import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ScheduledPost from '#models/scheduled_post'
import { uploadInstagramReel, uploadYoutubeShort } from '@naraclip/pipeline'
import { DateTime } from 'luxon'

export default class PublishScheduled extends BaseCommand {
  static commandName = 'social:publish-scheduled'
  static description = 'Periksa dan unggah video yang sudah jatuh tempo jadwal posting'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Hanya tampilkan postingan yang jatuh tempo tanpa mengunggah' })
  declare dryRun: boolean

  async run() {
    this.logger.info('Mengecek antrean postingan terjadwal...')

    const now = DateTime.now()
    const duePosts = await ScheduledPost.query()
      .where('status', 'scheduled')
      .where('scheduled_at', '<=', now.toSQL())
      .preload('socialAccount')
      .orderBy('scheduled_at', 'asc')

    if (duePosts.length === 0) {
      this.logger.info('Tidak ada postingan yang jatuh tempo saat ini.')
      return
    }

    this.logger.info(`Ditemukan ${duePosts.length} postingan yang siap dipublikasikan.`)

    for (const post of duePosts) {
      this.logger.info(`Memproses [#${post.id}] [${post.platform}] "${post.title}"...`)

      if (this.dryRun) {
        this.logger.info(`[Dry-Run] Akan diposting ke ${post.platform}: ${post.videoPath}`)
        continue
      }

      post.status = 'processing'
      await post.save()

      try {
        if (post.platform === 'instagram') {
          const res = await uploadInstagramReel({
            videoPath: post.videoPath,
            caption: post.caption,
          })
          post.status = 'published'
          post.publishedAt = DateTime.now()
          post.externalPostId = res.mediaId
          post.externalPostUrl = res.permalink
          post.errorMessage = null
          await post.save()
          this.logger.success(`✓ [#${post.id}] Berhasil diposting ke Instagram: ${res.permalink}`)
        } else if (post.platform === 'youtube') {
          const res = await uploadYoutubeShort({
            videoPath: post.videoPath,
            thumbnailPath: post.thumbnailPath || undefined,
            title: post.title,
            description: post.caption,
            privacyStatus: (post.privacy as 'public' | 'unlisted' | 'private') || 'public',
          })
          post.status = 'published'
          post.publishedAt = DateTime.now()
          post.externalPostId = res.videoId
          post.externalPostUrl = res.shortsUrl
          post.errorMessage = null
          await post.save()
          this.logger.success(`✓ [#${post.id}] Berhasil diposting ke YouTube: ${res.shortsUrl}`)
        } else {
          throw new Error(`Platform "${post.platform}" belum didukung untuk automated scheduled posting.`)
        }
      } catch (err: any) {
        this.logger.error(`✗ [#${post.id}] Gagal: ${err.message}`)
        post.status = 'failed'
        post.errorMessage = err.message || 'Unknown error'
        await post.save()
      }
    }
  }
}
