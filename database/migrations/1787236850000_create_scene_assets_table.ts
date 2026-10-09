import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'scene_assets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer('scene_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('scenes')
        .onDelete('CASCADE')
      table
        .integer('asset_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('assets')
        .onDelete('RESTRICT')
      table.string('role', 32).notNullable()
      table.integer('sequence_no').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.primary(['scene_id', 'asset_id', 'role'])
      table.check(
        "role IN ('visual', 'audio', 'caption', 'background', 'overlay')",
        {},
        'scene_assets_role_check'
      )
      table.index(['scene_id', 'role'], 'scene_assets_scene_role_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
