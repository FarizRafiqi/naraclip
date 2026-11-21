import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'social_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('platform', 32).notNullable()
      table.string('account_id', 160).notNullable()
      table.string('account_name', 160).nullable()
      table.string('account_handle', 160).nullable()
      table.text('access_token').notNullable()
      table.text('refresh_token').nullable()
      table.timestamp('expires_at', { useTz: true }).nullable()
      table.jsonb('scopes').notNullable().defaultTo('[]')
      table.jsonb('metadata').notNullable().defaultTo('{}')
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.unique(['platform', 'account_id'], 'social_accounts_platform_account_unique')
      table.check(
        "platform IN ('youtube', 'tiktok', 'instagram', 'facebook', 'x')",
        {},
        'social_accounts_platform_check'
      )
      table.index(['platform', 'enabled'], 'social_accounts_platform_enabled_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
