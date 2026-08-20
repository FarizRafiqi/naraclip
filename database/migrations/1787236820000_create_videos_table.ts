import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'videos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('project_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.string('status', 32).notNullable().defaultTo('draft')
      table.integer('width').unsigned().notNullable().defaultTo(1080)
      table.integer('height').unsigned().notNullable().defaultTo(1920)
      table.integer('fps').unsigned().notNullable().defaultTo(30)
      table.integer('duration_ms').unsigned().nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.check(
        "status IN ('draft', 'planning', 'generating', 'rendering', 'ready', 'failed')",
        {},
        'videos_status_check'
      )
      table.check('width > 0 AND height > 0 AND fps > 0', {}, 'videos_dimensions_check')
      table.index(['project_id', 'status'], 'videos_project_status_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
