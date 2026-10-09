import ProviderConfig from '#models/provider_config'
import ProviderRoute from '#models/provider_route'
import {
  parseProviderConfigSnapshot,
  type ProviderCapability,
  type ProviderConfigSnapshot,
} from '@naraclip/contracts'

const DEFAULT_CONFIGS: Record<ProviderCapability, ProviderConfigSnapshot> = {
  'story': {
    schemaVersion: 1,
    providerId: 'template-local',
    capability: 'story',
    model: 'template-v1',
    config: {},
    promptVersion: 'story-v1',
    flags: { deterministic: true },
    costMinorPerUnit: 0,
  },
  'image': {
    schemaVersion: 1,
    providerId: 'svg-local',
    capability: 'image',
    model: 'svg-v1',
    config: {},
    flags: { deterministic: true },
    costMinorPerUnit: 0,
  },
  'tts': {
    schemaVersion: 1,
    providerId: 'deterministic-local',
    capability: 'tts',
    model: 'wav-v1',
    config: {},
    flags: { deterministic: true },
    costMinorPerUnit: 0,
  },
  'fact-check': {
    schemaVersion: 1,
    providerId: 'disabled',
    capability: 'fact-check',
    model: 'none',
    config: {},
    flags: { enabled: false },
    costMinorPerUnit: 0,
  },
  'render': {
    schemaVersion: 1,
    providerId: 'hyperframes-local',
    capability: 'render',
    model: 'hyperframes-0.8.4',
    config: {},
    flags: { deterministic: true },
    costMinorPerUnit: 0,
  },
}

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeSnapshot(child)
    }
  }
  return value
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) =>
      /(secret|token|password|api[_-]?key)/i.test(key)
        ? [key, '[redacted]']
        : [key, redactSecrets(child)]
    )
  )
}

export default class ProviderRegistry {
  async snapshot(capability: ProviderCapability): Promise<ProviderConfigSnapshot> {
    const route = await ProviderRoute.findBy('capability', capability)
    const primary = route ? await ProviderConfig.find(route.primaryConfigId) : null

    if (!primary || !primary.enabled) {
      return freezeSnapshot(parseProviderConfigSnapshot(DEFAULT_CONFIGS[capability]))
    }

    const fallback = route?.fallbackConfigId
      ? await ProviderConfig.find(route.fallbackConfigId)
      : null
    const config =
      typeof primary.config === 'string' ? JSON.parse(primary.config) : (primary.config ?? {})
    const snapshot = parseProviderConfigSnapshot({
      schemaVersion: 1,
      providerId: primary.providerId,
      capability: primary.capability,
      model: primary.model,
      config: redactSecrets(config) as Record<string, unknown>,
      promptVersion: primary.promptVersion ?? undefined,
      fallbackProviderId: fallback?.enabled ? fallback.providerId : undefined,
      flags: { enabled: primary.enabled },
      costMinorPerUnit: primary.costMinorPerUnit,
    })

    return freezeSnapshot(snapshot)
  }

  static defaultSnapshot(capability: ProviderCapability) {
    return freezeSnapshot(parseProviderConfigSnapshot(DEFAULT_CONFIGS[capability]))
  }
}
