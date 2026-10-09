import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'render_jobs'

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
      table.string('status', 32).notNullable().defaultTo('queued')
      table.string('idempotency_key', 255).notNullable()
      table.string('quality', 32).notNullable().defaultTo('draft')
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0)
      table.jsonb('render_spec_snapshot').notNullable()
      table
        .integer('result_asset_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('assets')
        .onDelete('SET NULL')
      table.string('error_code', 100).nullable()
      table.text('error_message').nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.unique(['video_id', 'idempotency_key'], 'render_jobs_idempotency_unique')
      table.check(
        "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
        {},
        'render_jobs_status_check'
      )
      table.check("quality IN ('draft', 'standard', 'high')", {}, 'render_jobs_quality_check')
      table.index(['video_id', 'status'], 'render_jobs_video_status_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
