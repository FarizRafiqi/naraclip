import { createHash } from 'node:crypto'
import type { ProviderConfigSnapshot } from '@naraclip/contracts'

export type ImageGenerationInput = {
  prompt: string
  width: number
  height: number
}

export type ImageProviderResult = {
  body: Uint8Array
  mimeType: string
  width: number
  height: number
  providerAssetId: string
  metadata: Record<string, unknown>
}

export interface ImageProvider {
  generate(
    input: ImageGenerationInput,
    snapshot: ProviderConfigSnapshot
  ): Promise<ImageProviderResult>
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

export default class SvgImageProvider implements ImageProvider {
  async generate(input: ImageGenerationInput, snapshot: ProviderConfigSnapshot) {
    const providerAssetId = createHash('sha256')
      .update(`${snapshot.providerId}:${snapshot.model}:${input.prompt}`)
      .digest('hex')
    const label = escapeXml(input.prompt.slice(0, 120))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#0B1020"/><circle cx="${Math.round(input.width * 0.5)}" cy="${Math.round(input.height * 0.38)}" r="${Math.round(Math.min(input.width, input.height) * 0.18)}" fill="#6EE7B7" opacity="0.8"/><text x="${Math.round(input.width * 0.08)}" y="${Math.round(input.height * 0.72)}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="${Math.round(input.width * 0.055)}">${label}</text></svg>`

    return {
      body: Buffer.from(svg),
      mimeType: 'image/svg+xml',
      width: input.width,
      height: input.height,
      providerAssetId,
      metadata: { deterministic: true, prompt: input.prompt },
    }
  }
}
