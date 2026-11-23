import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'social_accounts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE')
      table.index(['user_id', 'platform', 'enabled'], 'social_accounts_user_platform_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user_id', 'platform', 'enabled'], 'social_accounts_user_platform_idx')
      table.dropColumn('user_id')
    })
  }
}
