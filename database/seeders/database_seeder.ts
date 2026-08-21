import { BaseSeeder } from '@adonisjs/lucid/seeders'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import ProjectSeeder from './project_seeder.js'
import ProviderSeeder from './provider_seeder.js'
import UserSeeder from './user_seeder.js'

type SeederConstructor = new (client: QueryClientContract) => BaseSeeder

export default class DatabaseSeeder extends BaseSeeder {
  private async seed(Seeder: SeederConstructor) {
    await new Seeder(this.client).run()
  }

  async run() {
    await this.seed(UserSeeder)
    await this.seed(ProjectSeeder)
    await this.seed(ProviderSeeder)
  }
}
