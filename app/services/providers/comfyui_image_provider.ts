import { createHash, randomInt, randomUUID } from 'node:crypto'
import type { ProviderConfigSnapshot } from '@naraclip/contracts'
import env from '#start/env'
import type { ImageGenerationInput, ImageProvider, ImageProviderResult } from './image_provider.js'

export type ComfyUiConfig = {
  baseUrl?: string
  workflow?: Record<string, any>
  promptNodeId?: string
  timeoutMs?: number
}

export default class ComfyUiImageProvider implements ImageProvider {
  private readonly defaultBaseUrl: string

  constructor(options?: { baseUrl?: string }) {
    this.defaultBaseUrl = options?.baseUrl ?? env.get('COMFYUI_ENDPOINT') ?? 'http://127.0.0.1:8188'
  }

  async generate(
    input: ImageGenerationInput,
    snapshot: ProviderConfigSnapshot
  ): Promise<ImageProviderResult> {
    const config = (snapshot.config ?? {}) as ComfyUiConfig
    const rawBaseUrl = config.baseUrl ?? this.defaultBaseUrl
    const baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl
    const timeoutMs = config.timeoutMs ?? 180_000

    // 1. Dapatkan atau siapkan workflow prompt
    const workflow = await this.resolveWorkflow(baseUrl, config, input)

    // 2. Enqueue prompt ke ComfyUI API
    const clientId = randomUUID()
    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        prompt: workflow,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!promptResponse.ok) {
      const errorText = await promptResponse.text().catch(() => '')
      throw new Error(
        `ComfyUI enqueue failed (${promptResponse.status}): ${errorText || promptResponse.statusText}`
      )
    }

    const { prompt_id: promptId } = (await promptResponse.json()) as { prompt_id: string }
    if (!promptId) {
      throw new Error('ComfyUI did not return a valid prompt_id')
    }

    // 3. Polling history sampai image generation selesai
    const outputImage = await this.pollHistory(baseUrl, promptId, timeoutMs)

    // 4. Download file gambar hasil generate dari ComfyUI
    const imageUrl = `${baseUrl}/view?filename=${encodeURIComponent(outputImage.filename)}&subfolder=${encodeURIComponent(outputImage.subfolder || '')}&type=${encodeURIComponent(outputImage.type || 'output')}`
    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30_000),
    })

    if (!imageResponse.ok) {
      throw new Error(`Failed to download ComfyUI image (${imageResponse.status})`)
    }

    const arrayBuffer = await imageResponse.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)
    const providerAssetId = createHash('sha256')
      .update(`${snapshot.providerId}:${snapshot.model}:${outputImage.filename}:${input.prompt}`)
      .digest('hex')

    return {
      body: imageBuffer,
      mimeType: 'image/png',
      width: input.width,
      height: input.height,
      providerAssetId,
      metadata: {
        provider: 'comfyui-native',
        promptId,
        filename: outputImage.filename,
        subfolder: outputImage.subfolder,
        prompt: input.prompt,
      },
    }
  }

  /**
   * Menyiapkan workflow graph dengan menyuntikkan prompt ke node teks yang sesuai
   */
  private async resolveWorkflow(
    baseUrl: string,
    config: ComfyUiConfig,
    input: ImageGenerationInput
  ): Promise<Record<string, any>> {
    let graph: Record<string, any>

    if (config.workflow && typeof config.workflow === 'object') {
      graph = structuredClone(config.workflow)
    } else {
      // Ambil workflow terakhir yang sukses dari ComfyUI history sebagai template otomatis
      graph = await this.getLatestWorkflowFromHistory(baseUrl)
    }

    this.injectPromptIntoGraph(graph, input.prompt, config.promptNodeId)
    return graph
  }

  /**
   * Mengambil template workflow aktif dari run terakhir di ComfyUI
   */
  private async getLatestWorkflowFromHistory(baseUrl: string): Promise<Record<string, any>> {
    try {
      const historyRes = await fetch(`${baseUrl}/history`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (historyRes.ok) {
        const historyData = (await historyRes.json()) as Record<string, any>
        const keys = Object.keys(historyData)
        if (keys.length > 0) {
          const lastKey = keys.at(-1)
          const lastItem = lastKey ? historyData[lastKey] : undefined
          if (lastItem?.prompt?.[2]) {
            return structuredClone(lastItem.prompt[2])
          }
        }
      }
    } catch {
      // Jika history kosong atau gagal diambil
    }

    throw new Error(
      'ComfyUI: Belum ada workflow yang dikonfigurasi. Silakan jalankan generate 1x di ComfyUI GUI atau masukkan config.workflow di database ProviderConfig.'
    )
  }

  /**
   * Menemukan node teks prompt dan mengganti isinya dengan prompt baru
   */
  private injectPromptIntoGraph(
    graph: Record<string, any>,
    promptText: string,
    targetNodeId?: string
  ) {
    if (targetNodeId && graph[targetNodeId]?.inputs) {
      graph[targetNodeId].inputs.prompt = promptText
      return
    }

    // Auto-detect node prompt utama: TextGenerate, CLIPTextEncode, atau TextEncodeQwen
    let injected = false

    // Prioritas 1: TextGenerate node (seperti Qwen2.1 / Prompt generator)
    for (const node of Object.values(graph)) {
      if (node.class_type === 'TextGenerate' && typeof node.inputs?.prompt === 'string') {
        node.inputs.prompt = promptText
        injected = true
        break
      }
    }

    // Prioritas 2: CLIPTextEncode positif
    if (!injected) {
      for (const node of Object.values(graph)) {
        if (
          (node.class_type === 'CLIPTextEncode' || node.class_type?.includes('TextEncode')) &&
          typeof node.inputs?.text === 'string'
        ) {
          node.inputs.text = promptText
          injected = true
          break
        }
      }
    }

    // Acak seed jika ada KSampler agar gambar tidak duplikat
    for (const node of Object.values(graph)) {
      if (node.inputs && 'seed' in node.inputs) {
        node.inputs.seed = randomInt(1_000_000_000)
      }
    }

    if (!injected) {
      // Fallback: cari input pertama yang bernama 'prompt'
      for (const node of Object.values(graph)) {
        if (node.inputs && typeof node.inputs.prompt === 'string') {
          node.inputs.prompt = promptText
          break
        }
      }
    }
  }

  /**
   * Melakukan polling ke /history/{promptId} sampai proses generate selesai
   */
  private async pollHistory(
    baseUrl: string,
    promptId: string,
    timeoutMs: number
  ): Promise<{ filename: string; subfolder: string; type: string }> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))

      try {
        const res = await fetch(`${baseUrl}/history/${promptId}`, {
          signal: AbortSignal.timeout(5_000),
        })

        if (!res.ok) continue

        const data = (await res.json()) as Record<string, any>
        const item = data[promptId]

        if (item?.status?.status_str === 'error') {
          const messages = item.status.messages?.map((m: any) => m[1]?.message || m).join(', ')
          throw new Error(`ComfyUI execution error: ${messages || 'Unknown error'}`)
        }

        if (item?.outputs) {
          for (const nodeOutput of Object.values(item.outputs) as any[]) {
            if (Array.isArray(nodeOutput.images) && nodeOutput.images.length > 0) {
              const img = nodeOutput.images[0]
              return {
                filename: img.filename,
                subfolder: img.subfolder || '',
                type: img.type || 'output',
              }
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes('ComfyUI execution error')) throw err
      }
    }

    throw new Error(`ComfyUI generation timed out after ${Math.round(timeoutMs / 1000)}s`)
  }
}
