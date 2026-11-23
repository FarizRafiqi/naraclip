import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'scheduled_posts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('social_account_id')
        .unsigned()
        .references('id')
        .inTable('social_accounts')
        .onDelete('SET NULL')
      table.string('platform', 32).notNullable()
      table.string('title', 255).notNullable()
      table.text('caption').notNullable()
      table.string('video_path', 500).notNullable()
      table.string('thumbnail_path', 500).nullable()
      table.string('privacy', 32).notNullable().defaultTo('public')
      table.timestamp('scheduled_at', { useTz: true }).notNullable()
      table.timestamp('published_at', { useTz: true }).nullable()
      table.string('status', 32).notNullable().defaultTo('scheduled')
      table.string('external_post_url', 500).nullable()
      table.string('external_post_id', 200).nullable()
      table.text('error_message').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.index(['status', 'scheduled_at'], 'scheduled_posts_status_time_idx')
      table.index(['user_id', 'status'], 'scheduled_posts_user_status_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
