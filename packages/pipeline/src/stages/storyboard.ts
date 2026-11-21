import fs from 'node:fs'
import {
  RECIPES,
  StoryboardLlmSchema,
  StoryboardSchema,
  validateStoryboard,
  type Brief,
  type Script,
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

export function defaultMockStoryboard(brief: Brief, script: Script): Storyboard {
  if (brief.style === 'dev-explainer') {
    return {
      schemaVersion: 1,
      shots: [
        {
          id: 's01',
          beatId: 'b1',
          recipe: 'kinetic-title',
          headline: 'Kenapa Redis Cepat Banget?',
          body: 'RAM vs Disk I/O dalam 30 Detik',
          code: null,
          terminal: null,
          svg: null,
          assetId: null,
          motion: 'pop',
          sfx: 'whoosh',
          emphasis: ['Redis', 'Cepat', 'RAM'],
          weight: 1,
        },
        {
          id: 's02',
          beatId: 'b2',
          recipe: 'custom-svg',
          headline: 'Arsitektur In-Memory',
          body: null,
          code: null,
          terminal: null,
          svg: `<svg viewBox="0 0 860 320" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(60, 80)">
    <rect width="200" height="150" rx="16" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
    <text x="100" y="70" text-anchor="middle" fill="#f8fafc" font-size="22" font-weight="700">Client App</text>
    <text x="100" y="105" text-anchor="middle" fill="#94a3b8" font-size="16">API Gateway</text>
  </g>
  <line x1="280" y1="155" x2="400" y2="155" stroke="#38bdf8" stroke-width="4" stroke-dasharray="8 8"/>
  <g transform="translate(420, 60)">
    <rect width="220" height="190" rx="20" fill="#1e1b4b" stroke="#818cf8" stroke-width="3"/>
    <text x="110" y="75" text-anchor="middle" fill="#ffffff" font-size="26" font-weight="800">REDIS</text>
    <text x="110" y="115" text-anchor="middle" fill="#34d399" font-size="20" font-weight="700">RAM: 0.1ms</text>
  </g>
  <g transform="translate(680, 80)">
    <rect width="140" height="150" rx="16" fill="#1e293b" stroke="#475569" stroke-width="2"/>
    <text x="70" y="70" text-anchor="middle" fill="#94a3b8" font-size="18" font-weight="700">Disk DB</text>
    <text x="70" y="105" text-anchor="middle" fill="#ef4444" font-size="16">50ms Seek</text>
  </g>
</svg>`,
          assetId: null,
          motion: 'slide-up',
          sfx: 'pop',
          emphasis: ['RAM', '0.1ms'],
          weight: 2,
        },
        {
          id: 's03',
          beatId: 'b3',
          recipe: 'code',
          headline: 'Set & Get Operasi Instan',
          body: null,
          code: `// Simpan dan ambil langsung dari RAM tanpa disk seek
await redis.set('user:42', JSON.stringify(data), 'EX', 3600);
const cached = await redis.get('user:42');`,
          terminal: null,
          svg: null,
          assetId: null,
          motion: 'push-in',
          sfx: 'whoosh',
          emphasis: ['set', 'get'],
          weight: 2,
        },
        {
          id: 's04',
          beatId: 'b4',
          recipe: 'terminal',
          headline: 'Benchmark Hasil Riil',
          body: null,
          code: null,
          terminal: [
            { cmd: 'curl https://api.local/users/42', output: 'HTTP/2 200 OK | 1.2ms (HIT)' },
            { cmd: 'redis-cli ping', output: 'PONG (0.1ms)' },
          ],
          svg: null,
          assetId: null,
          motion: 'pop',
          sfx: 'hit',
          emphasis: ['1.2ms', 'PONG'],
          weight: 1,
        },
      ],
    }
  }

  return {
    schemaVersion: 1,
    shots: [
      {
        id: 's01',
        beatId: 'b1',
        recipe: 'char-pose',
        headline: 'Lagi Kepedesan Parah?',
        body: 'Makan ramen super pedas lalu panik',
        code: null,
        terminal: null,
        svg: null,
        assetId: 'char-panik',
        motion: 'pop',
        sfx: 'hit',
        emphasis: ['Kepedesan'],
        weight: 1,
      },
      {
        id: 's02',
        beatId: 'b2',
        recipe: 'prop-popin',
        headline: 'Capsaicin = Molekul Minyak',
        body: 'Struktur molekul capsaicin hidrofobik',
        code: null,
        terminal: null,
        svg: null,
        assetId: 'capsaicin-molecule',
        motion: 'push-in',
        sfx: 'whoosh',
        emphasis: ['Capsaicin', 'Minyak'],
        weight: 2,
      },
      {
        id: 's03',
        beatId: 'b3',
        recipe: 'evidence-card',
        headline: 'Air Malah Menyebarkan Minyak',
        body: 'Minyak tidak larut dalam air dan mengapung di permukaan rongga lidah',
        code: null,
        terminal: null,
        svg: null,
        assetId: 'water-oil-evidence',
        motion: 'slide-up',
        sfx: 'pop',
        emphasis: ['Air', 'Menyebar'],
        weight: 2,
      },
      {
        id: 's04',
        beatId: 'b4',
        recipe: 'stat-callout',
        headline: 'Minum Susu: Kasein Pengikat Capsaicin',
        body: 'Protein kasein mengikat molekul capsaicin dan melarutkannya dari lidah',
        code: null,
        terminal: null,
        svg: null,
        assetId: null,
        motion: 'pop',
        sfx: 'hit',
        emphasis: ['Kasein', 'Susu'],
        weight: 1,
      },
    ],
  }
}

export async function runStoryboard(
  slug: string,
  options: { force?: boolean } = {}
): Promise<Storyboard> {
  const p = paths(slug)
  const state = loadState(slug)

  if (!fs.existsSync(p.brief) || !fs.existsSync(p.script)) {
    throw new Error(`brief.json atau script.json tidak ditemukan untuk slug "${slug}".`)
  }

  const brief = readJson<Brief>(p.brief)
  const script = readJson<Script>(p.script)
  const inputHash = sha256({ brief, script })

  if (!options.force && state.stages.storyboard.status === 'done' && fs.existsSync(p.storyboard)) {
    if (state.stages.storyboard.inputHash === inputHash) {
      return readJson<Storyboard>(p.storyboard)
    }
  }

  const allowedRecipes = RECIPES[brief.style].join(', ')
  const beatsSummary = script.beats
    .map((b) => `- [${b.id}] "${b.narration}" (overlay: "${b.onScreenText || '-'}")`)
    .join('\n')

  const prompt = `Anda adalah Storyboard Director & Visual Lead untuk NaraClip.
Rancang storyboard visual untuk video pendek berikut:

Judul: ${brief.title}
Gaya: ${brief.style}
Allowed Recipes untuk gaya ini: [${allowedRecipes}]

DAFTAR BEAT NASKAH:
${beatsSummary}

ATURAN STORYBOARD:
1. Setiap beat WAJIB memiliki minimal satu shot (bisa 1 atau 2 shot per beat).
2. Hanya gunakan recipe yang ada dalam daftar allowed recipes: [${allowedRecipes}].
3. ${
    brief.style === 'dev-explainer'
      ? `Untuk dev-explainer (Ikuti packages/remotion/DESIGN.md - Anti-Slop Editorial Craft):
   - Gunakan recipe: kinetic-title, code, terminal, custom-svg, stat-callout.
   - ZERO em dash (—), ZERO emoji, ZERO generic AI slop / grid / neon blur / macOS dots!
   - Palet: Warm Paper (#F4EFE6), Charcoal Ink (#121820), Cobalt (#1D63ED), Vermilion (#D94426), Teal (#128067).
   - recipe 'code' WAJIB menyertakan string code yang valid (maks 700 char), dan headline adalah nama file singkat (misal "Dockerfile").
   - recipe 'terminal' WAJIB menyertakan array terminal (command & output riil), dan headline adalah label konteks singkat (misal "BUILD & RUN").
   - recipe 'custom-svg' WAJIB menyertakan markup <svg viewBox="0 0 980 1120" xmlns="http://www.w3.org/2000/svg">...</svg> yang aman (isSafeSvg). Jangan taruh top title generik di atas SVG; biar subtitle yang bercerita. Gunakan <g transform="..."><g data-anim="..."> (nested <g>, JANGAN menaruh data-anim langsung pada elemen yang sudah memiliki atribut transform). Animasi didukung: pop-1..5, slide-up-1..3, slide-right, move-right, move-diag, drop, drop-late, flow, draw, float, pulse, shake, reveal-late.
   - assetId biarkan null.`
      : `Untuk vinconium:
   - Gunakan visual fotorealistis / mixed media: bg-plate, char-pose, prop-popin, label-callout, evidence-card, kinetic-title, stat-callout.
   - Shot dengan recipe bg-plate, char-pose, prop-popin, evidence-card WAJIB menyertakan assetId (misal "char-panik", "capsaicin-molecule").`
  }
4. motion: Pilih dari ['pop', 'slide-up', 'slide-left', 'push-in', 'pull-out', 'fade', 'none'].
5. sfx: Pilih dari ['whoosh', 'pop', 'hit', 'tick', 'none'].
6. weight: Bobot durasi shot relatif dalam beat (angka 1 s/d 5).

Keluarkan JSON murni yang sesuai skema.`

  const llmOut = await generateStructured({
    label: 'storyboard',
    prompt,
    schema: StoryboardLlmSchema,
    validate: (candidate) =>
      validateStoryboard(brief, script, { schemaVersion: 1, ...candidate }),
    mock: () => {
      const mock = defaultMockStoryboard(brief, script)
      return { shots: mock.shots }
    },
  })

  const storyboard: Storyboard = {
    schemaVersion: 1,
    shots: llmOut.shots,
  }

  StoryboardSchema.parse(storyboard)
  writeJson(p.storyboard, storyboard)
  setStage(state, 'storyboard', 'done', inputHash, `Storyboard selesai: ${storyboard.shots.length} shots`)
  saveState(state)

  return storyboard
}
