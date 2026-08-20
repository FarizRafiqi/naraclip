import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('full_name').nullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.string('role', 32).notNullable().defaultTo('user')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.check("role IN ('user', 'admin')", {}, 'users_role_check')
      table.index('role', 'users_role_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
