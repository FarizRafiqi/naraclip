import { BaseSeeder } from '@adonisjs/lucid/seeders'
import ProviderConfig from '#models/provider_config'
import ProviderRoute from '#models/provider_route'

const defaults = [
  {
    providerId: 'template-local',
    capability: 'story',
    model: 'template-v1',
    promptVersion: 'story-v1',
  },
  { providerId: 'svg-local', capability: 'image', model: 'svg-v1', promptVersion: null },
  {
    providerId: 'deterministic-local',
    capability: 'tts',
    model: 'wav-v1',
    promptVersion: null,
  },
  {
    providerId: 'hyperframes-local',
    capability: 'render',
    model: 'hyperframes-0.8.4',
    promptVersion: null,
  },
]

export default class ProviderSeeder extends BaseSeeder {
  async run() {
    const configs = new Map<string, ProviderConfig>()

    for (const input of defaults) {
      const config = await ProviderConfig.updateOrCreate(
        {
          providerId: input.providerId,
          capability: input.capability,
          model: input.model,
        },
        {
          config: '{}',
          promptVersion: input.promptVersion,
          enabled: true,
          costMinorPerUnit: 0,
        }
      )

      configs.set(input.capability, config)
    }

    for (const [capability, config] of configs) {
      await ProviderRoute.updateOrCreate(
        { capability },
        { primaryConfigId: config.id, fallbackConfigId: null }
      )
    }
  }
}
