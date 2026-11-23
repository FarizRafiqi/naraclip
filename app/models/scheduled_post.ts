import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SocialAccount, { type SocialPlatform } from '#models/social_account'
import User from '#models/user'
import { DateTime } from 'luxon'

export type PostStatus = 'draft' | 'scheduled' | 'processing' | 'published' | 'failed'

export default class ScheduledPost extends BaseModel {
  static table = 'scheduled_posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: string | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare socialAccountId: number | null

  @belongsTo(() => SocialAccount)
  declare socialAccount: BelongsTo<typeof SocialAccount>

  @column()
  declare platform: SocialPlatform

  @column()
  declare title: string

  @column()
  declare caption: string

  @column()
  declare videoPath: string

  @column()
  declare thumbnailPath: string | null

  @column()
  declare privacy: string

  @column.dateTime()
  declare scheduledAt: DateTime

  @column.dateTime()
  declare publishedAt: DateTime | null

  @column()
  declare status: PostStatus

  @column()
  declare externalPostUrl: string | null

  @column()
  declare externalPostId: string | null

  @column()
  declare errorMessage: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
