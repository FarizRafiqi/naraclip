import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'generation_jobs'

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
      table.string('job_type', 32).notNullable()
      table.string('status', 32).notNullable().defaultTo('queued')
      table.string('idempotency_key', 255).notNullable()
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0)
      table.jsonb('provider_config_snapshot').nullable()
      table.integer('cost_minor').unsigned().notNullable().defaultTo(0)
      table.string('error_code', 100).nullable()
      table.text('error_message').nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.unique(['video_id', 'idempotency_key'], 'generation_jobs_idempotency_unique')
      table.check(
        "job_type IN ('story', 'image', 'tts', 'fact_check')",
        {},
        'generation_jobs_type_check'
      )
      table.check(
        "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
        {},
        'generation_jobs_status_check'
      )
      table.index(['video_id', 'status'], 'generation_jobs_video_status_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
