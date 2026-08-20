import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'scenes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('video_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('videos')
        .onDelete('CASCADE')
      table.integer('sequence_no').unsigned().notNullable()
      table.string('state', 32).notNullable().defaultTo('planned')
      table.integer('spec_version').unsigned().notNullable().defaultTo(1)
      table.jsonb('scene_spec').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.unique(['video_id', 'sequence_no'], 'scenes_video_sequence_unique')
      table.check(
        "state IN ('planned', 'assets_pending', 'ready', 'failed')",
        {},
        'scenes_state_check'
      )
      table.index(['video_id', 'state'], 'scenes_video_state_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
