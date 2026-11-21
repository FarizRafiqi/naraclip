import fs from 'node:fs'
import path from 'node:path'
import {
  ASSET_RECIPES,
  AssetManifestSchema,
  AssetPlanLlmSchema,
  AssetPlanSchema,
  STYLE_PROFILES,
  type AssetManifest,
  type AssetPlan,
  type Storyboard,
} from '@naraclip/contracts'
import { generateStructured } from '../llm.js'
import {
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

export async function runAssets(
  slug: string,
  options: { force?: boolean } = {}
): Promise<AssetPlan> {
  const p = paths(slug)
  const state = loadState(slug)
  const profile = STYLE_PROFILES[state.style]

  if (profile.skipStages.includes('assets')) {
    setStage(state, 'assets', 'skipped', null, 'Assets dilewati (pure code / vector)')
    saveState(state)
    return { schemaVersion: 1, assets: [] }
  }

  if (!fs.existsSync(p.storyboard)) {
    throw new Error(`storyboard.json tidak ditemukan untuk slug "${slug}".`)
  }

  const storyboard = readJson<Storyboard>(p.storyboard)
  const neededAssetIds = Array.from(
    new Set(
      storyboard.shots
        .filter((s) => ASSET_RECIPES.includes(s.recipe) && s.assetId)
        .map((s) => s.assetId as string)
    )
  )

  const inputHash = sha256({ neededAssetIds })
  if (!options.force && state.stages.assets.status === 'done' && fs.existsSync(p.assetPlan)) {
    if (state.stages.assets.inputHash === inputHash) {
      return readJson<AssetPlan>(p.assetPlan)
    }
  }

  const prompt = `Anda adalah Art Director & Visual Assets Lead untuk NaraClip.
Rancang visual asset plan untuk shot-shot video berikut yang membutuhkan gambar fotorealistis / mixed-media props.

Daftar Asset ID yang dibutuhkan:
${neededAssetIds.map((id) => `- ${id}`).join('\n')}

ATURAN ASSET PLAN:
1. Buat planned asset untuk setiap ID di atas.
2. kind: Pilih dari ['image-ai', 'svg', 'evidence', 'video-loop'].
3. prompt: Berikan prompt gambar yang sangat mendetail, fotorealistis, tekstur nyata (misal: "Studio macro shot of a fresh chili pepper, drops of red capsaicin oil on surface, clean isolated lighting, 8k").
4. background: Pilih dari ['white', 'gray', 'transparent', 'scene'].
5. refs: Array ID referensi (opsional).

Keluarkan JSON murni yang sesuai skema.`

  const llmOut = await generateStructured({
    label: 'assets',
    prompt,
    schema: AssetPlanLlmSchema,
    mock: () => ({
      assets: neededAssetIds.map((id) => ({
        id,
        kind: 'image-ai' as const,
        prompt: `Photorealistic studio shot of ${id.replace(/-/g, ' ')}, 8k, sharp focus`,
        background: 'transparent' as const,
        refs: [],
        note: null,
      })),
    }),
  })

  const assetPlan: AssetPlan = {
    schemaVersion: 1,
    assets: llmOut.assets,
  }

  AssetPlanSchema.parse(assetPlan)
  writeJson(p.assetPlan, assetPlan)

  // Buat folder generated dan manifest dasar
  fs.mkdirSync(p.assetsGenerated, { recursive: true })
  fs.mkdirSync(p.assetsEvidence, { recursive: true })

  const manifest: AssetManifest = {
    schemaVersion: 1,
    entries: assetPlan.assets.map((a) => {
      const mockFile = path.join(p.assetsGenerated, `${a.id}.png`)
      if (!fs.existsSync(mockFile)) {
        // Buat file placeholder 1x1 png jika belum ada
        fs.writeFileSync(
          mockFile,
          Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
        )
      }
      return {
        id: a.id,
        status: 'approved',
        file: path.relative(p.dir, mockFile),
        backend: 'local-mock',
        license: 'cc0',
        sha256: sha256(a.id),
      }
    }),
  }

  AssetManifestSchema.parse(manifest)
  writeJson(p.assetManifest, manifest)

  setStage(state, 'assets', 'done', inputHash, `Asset plan selesai: ${assetPlan.assets.length} aset`)
  saveState(state)

  return assetPlan
}
