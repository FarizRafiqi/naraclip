import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import User from '#models/user'

export default class ProjectSeeder extends BaseSeeder {
  async run() {
    const user = await User.findByOrFail('email', 'demo@naraclip.local')
    const title = 'Demo Explainer Project'
    const existingProject = await this.client
      .query()
      .from('projects')
      .where({ owner_id: user.id, title })
      .first()

    if (!existingProject) {
      const timestamp = DateTime.utc().toSQL({ includeOffset: false })

      await this.client.insertQuery().table('projects').insert({
        owner_id: user.id,
        title,
        source_prompt: 'Jelaskan topik sains sederhana dalam format explainer vertikal.',
        status: 'draft',
        created_at: timestamp,
        updated_at: timestamp,
      })
    }
  }
}
