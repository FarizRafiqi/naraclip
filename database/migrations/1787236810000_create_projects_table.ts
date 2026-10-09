import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'projects'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('owner_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('title', 160).notNullable()
      table.text('source_prompt').notNullable()
      table.string('status', 32).notNullable().defaultTo('draft')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.check(
        "status IN ('draft', 'generating', 'ready', 'failed', 'archived')",
        {},
        'projects_status_check'
      )
      table.index(['owner_id', 'status'], 'projects_owner_status_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
