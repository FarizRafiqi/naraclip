import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected providerConfigsTable = 'provider_configs'
  protected providerRoutesTable = 'provider_routes'

  async up() {
    this.schema.createTable(this.providerConfigsTable, (table) => {
      table.increments('id').notNullable()
      table.string('provider_id', 100).notNullable()
      table.string('capability', 32).notNullable()
      table.string('model', 160).notNullable()
      table.jsonb('config').notNullable().defaultTo('{}')
      table.string('prompt_version', 100).nullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.integer('cost_minor_per_unit').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.unique(['provider_id', 'capability', 'model'], 'provider_configs_identity_unique')
      table.check(
        "capability IN ('story', 'image', 'tts', 'fact-check', 'render')",
        {},
        'provider_configs_capability_check'
      )
      table.check('cost_minor_per_unit >= 0', {}, 'provider_configs_cost_check')
      table.index(['capability', 'enabled'], 'provider_configs_capability_enabled_idx')
    })

    this.schema.createTable(this.providerRoutesTable, (table) => {
      table.increments('id').notNullable()
      table.string('capability', 32).notNullable().unique()
      table
        .integer('primary_config_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable(this.providerConfigsTable)
        .onDelete('RESTRICT')
      table
        .integer('fallback_config_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable(this.providerConfigsTable)
        .onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.check(
        'fallback_config_id IS NULL OR fallback_config_id <> primary_config_id',
        {},
        'provider_routes_distinct_configs_check'
      )
      table.index('primary_config_id', 'provider_routes_primary_config_idx')
      table.index('fallback_config_id', 'provider_routes_fallback_config_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.providerRoutesTable)
    this.schema.dropTable(this.providerConfigsTable)
  }
}
