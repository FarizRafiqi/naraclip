import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'assets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('kind', 32).notNullable()
      table.string('source', 32).notNullable()
      table.string('status', 32).notNullable().defaultTo('available')
      table.string('storage_key', 512).notNullable().unique()
      table.string('mime_type', 120).notNullable()
      table.bigInteger('byte_size').unsigned().notNullable()
      table.integer('width').unsigned().nullable()
      table.integer('height').unsigned().nullable()
      table.string('checksum_sha256', 64).nullable()
      table.string('provider_id', 100).nullable()
      table.string('provider_asset_id', 255).nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.check(
        "kind IN ('image', 'audio', 'video', 'font', 'icon', 'map', 'chart')",
        {},
        'assets_kind_check'
      )
      table.check(
        "source IN ('generated', 'uploaded', 'stock', 'inline', 'rendered')",
        {},
        'assets_source_check'
      )
      table.check(
        "status IN ('pending', 'available', 'failed', 'deleted')",
        {},
        'assets_status_check'
      )
      table.check('byte_size >= 0', {}, 'assets_byte_size_check')
      table.index(['provider_id', 'provider_asset_id'], 'assets_provider_lookup_idx')
      table.index('checksum_sha256', 'assets_checksum_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
