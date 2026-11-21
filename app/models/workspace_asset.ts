import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WorkspaceAsset extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare workspaceSlug: string

  @column()
  declare channel: string

  @column()
  declare assetPath: string

  @column()
  declare storageDriver: string

  @column()
  declare storageKey: string

  @column()
  declare originalMime: string

  @column()
  declare compressedMime: string

  @column()
  declare originalByteSize: number

  @column()
  declare compressedByteSize: number

  @column({ columnName: 'checksum_sha256' })
  declare checksumSha256: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
