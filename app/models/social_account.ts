import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import { DateTime } from 'luxon'

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'x'

export default class SocialAccount extends BaseModel {
  static table = 'social_accounts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @column()
  declare platform: SocialPlatform

  @column()
  declare accountId: string

  @column()
  declare accountName: string | null

  @column()
  declare accountHandle: string | null

  @column({ serializeAs: null })
  declare accessToken: string

  @column({ serializeAs: null })
  declare refreshToken: string | null

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column({
    prepare: (value: string[]) => JSON.stringify(value ?? []),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value ?? []),
  })
  declare scopes: string[]

  @column({
    prepare: (value: Record<string, unknown>) => JSON.stringify(value ?? {}),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value ?? {}),
  })
  declare metadata: Record<string, unknown>

  @column()
  declare enabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
