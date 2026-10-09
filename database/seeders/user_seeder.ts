import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

export default class UserSeeder extends BaseSeeder {
  async run() {
    await User.updateOrCreate(
      { email: 'demo@naraclip.local' },
      {
        fullName: 'NaraClip Demo',
        password: process.env.DEFAULT_USER_PASSWORD ?? 'password',
        role: 'admin',
      }
    )
  }
}
