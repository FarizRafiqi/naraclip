import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'workspace_assets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('workspace_slug', 120).notNullable()
      table.string('channel', 32).notNullable()
      table.string('asset_path', 512).notNullable()
      table.string('storage_driver', 32).notNullable().defaultTo('s3')
      table.string('storage_key', 512).notNullable().unique()
      table.string('original_mime', 120).notNullable()
      table.string('compressed_mime', 120).notNullable()
      table.bigInteger('original_byte_size').unsigned().notNullable()
      table.bigInteger('compressed_byte_size').unsigned().notNullable()
      table.string('checksum_sha256', 64).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.index(['workspace_slug', 'channel'], 'workspace_assets_slug_channel_idx')
      table.index('checksum_sha256', 'workspace_assets_checksum_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
