import { createHash } from 'node:crypto'
import type { ProviderConfigSnapshot } from '@naraclip/contracts'
import env from '#start/env'
import type { ImageGenerationInput, ImageProvider, ImageProviderResult } from './image_provider.js'

export type NineRouterConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
  responseFormat?: 'b64_json' | 'url'
  timeoutMs?: number
}

export default class NineRouterImageProvider implements ImageProvider {
  private readonly defaultBaseUrl: string
  private readonly defaultApiKey: string | undefined

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.defaultBaseUrl =
      options?.baseUrl ?? env.get('NINEROUTER_ENDPOINT') ?? 'http://127.0.0.1:20128/v1'
    this.defaultApiKey = options?.apiKey ?? env.get('NINEROUTER_API_KEY')?.release()
  }

  async generate(
    input: ImageGenerationInput,
    snapshot: ProviderConfigSnapshot
  ): Promise<ImageProviderResult> {
    const config = (snapshot.config ?? {}) as NineRouterConfig
    const rawBaseUrl = config.baseUrl ?? this.defaultBaseUrl
    const baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl
    const apiKey = config.apiKey ?? this.defaultApiKey
    const model = snapshot.model || config.model || 'flux-schnell'
    const timeoutMs = config.timeoutMs ?? 120_000

    const endpoint = `${baseUrl}/images/generations`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const payload = {
      prompt: input.prompt,
      model,
      n: 1,
      size: `${input.width}x${input.height}`,
      response_format: config.responseFormat ?? 'b64_json',
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `9Router generation failed (${response.status}): ${errorText || response.statusText}`
      )
    }

    const json = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>
    }

    const item = json.data?.[0]
    if (!item) {
      throw new Error('9Router did not return any image in data array')
    }

    let imageBuffer: Buffer
    if (item.b64_json) {
      imageBuffer = Buffer.from(item.b64_json, 'base64')
    } else if (item.url) {
      const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30_000) })
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${imgRes.status}`)
      }
      const arrayBuffer = await imgRes.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
    } else {
      throw new Error('9Router image object contained neither b64_json nor url')
    }

    const providerAssetId = createHash('sha256')
      .update(`${snapshot.providerId}:${model}:${input.prompt}`)
      .digest('hex')

    return {
      body: imageBuffer,
      mimeType: 'image/png',
      width: input.width,
      height: input.height,
      providerAssetId,
      metadata: {
        provider: '9router-openai',
        model,
        prompt: input.prompt,
      },
    }
  }
}
