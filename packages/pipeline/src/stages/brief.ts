import fs from 'node:fs'
import {
  BriefLlmSchema,
  BriefSchema,
  STYLE_PROFILES,
  type Brief,
  type PipelineStyle,
} from '@naraclip/contracts'
import { generateStructured } from '../llm.js'
import {
  fileHash,
  loadState,
  paths,
  readJson,
  saveState,
  setStage,
  sha256,
  writeJson,
} from '../workspace.js'

export function defaultMockBrief(slug: string, style: PipelineStyle, idea: string): Brief {
  return {
    schemaVersion: 1,
    slug,
    idea,
    style,
    voiceSource: STYLE_PROFILES[style].voiceSource,
    language: 'id',
    title: style === 'dev-explainer' ? 'Kenapa Redis Super Cepat?' : 'Kenapa Air Nggak Mempan Buat Pedas?',
    audience: style === 'dev-explainer' ? 'Software engineer & web developer pemula' : 'Penonton umum pecinta kuliner pedas',
    tone: style === 'dev-explainer' ? 'curious' : 'urgent',
    targetDurationSec: 30,
    hook:
      style === 'dev-explainer'
        ? 'Kenapa query database kamu butuh 50ms, tapi Redis bisa respon di bawah 1ms?'
        : 'Lagi kepedesan parah terus langsung minum air dingin? Awas, kamu malah bikin pedasnya makin nyebar!',
    takeaway:
      style === 'dev-explainer'
        ? 'Redis bekerja langsung di RAM dengan single-threaded event loop tanpa disk I/O bottleneck.'
        : 'Capsaicin itu minyak non-polar yang larut dalam lemak kasein susu, bukan air.',
    claims:
      style === 'dev-explainer'
        ? [
            { id: 'c1', text: 'Redis menyimpan seluruh dataset di RAM bukan harddisk', sourceUrl: 'https://redis.io' },
            { id: 'c2', text: 'I/O multiplexing epoll membuat satu thread menangani ribuan koneksi', sourceUrl: null },
            { id: 'c3', text: 'Latency baca tulis rata-rata sub-milidetik', sourceUrl: null },
          ]
        : [
            { id: 'c1', text: 'Capsaicin adalah senyawa minyak non-polar pengikat reseptor panas lidah', sourceUrl: null },
            { id: 'c2', text: 'Air adalah senyawa polar yang tidak bisa melarutkan molekul capsaicin', sourceUrl: null },
            { id: 'c3', text: 'Kasein dalam susu mengikat capsaicin dan membersihkannya dari lidah', sourceUrl: null },
          ],
  }
}

export async function runBrief(
  slug: string,
  options: { idea?: string; force?: boolean } = {}
): Promise<Brief> {
  const p = paths(slug)
  const state = loadState(slug)
  const style = state.style

  let idea = options.idea
  if (!idea && fs.existsSync(p.idea)) {
    idea = fs.readFileSync(p.idea, 'utf8').trim()
  }
  if (!idea) {
    idea = slug.replace(/-/g, ' ')
  }

  // Simpan ide mentah jika belum ada
  if (!fs.existsSync(p.idea)) {
    fs.mkdirSync(p.dir, { recursive: true })
    fs.writeFileSync(p.idea, idea + '\n')
  }

  const ideaHash = sha256(idea)
  if (!options.force && state.stages.brief.status === 'done' && fs.existsSync(p.brief)) {
    if (state.stages.brief.inputHash === ideaHash) {
      return readJson<Brief>(p.brief)
    }
  }

  const prompt = `Anda adalah Video Director & Research Lead untuk NaraClip.
Buat brief video pendek vertikal (TikTok / Shorts / Reels) berdurasi 20-60 detik (ikuti durasi spesifik pada ide bila ada) dalam bahasa Indonesia.

Gaya channel: "${style}" (${style === 'dev-explainer' ? 'Penjelasan konsep programming/arsitektur software yang elegan, visual, dan akurat' : 'Investigasi sains & fakta aneh dengan tone santai tapi kredibel'}).
Ide video: "${idea}"

Panduan:
1. title: Judul hook yang memancing rasa penasaran (maks 120 char, tanpa karakter em dash —).
2. audience: Target audiens yang spesifik.
3. tone: Pilih salah satu dari: curious, serious, playful, deadpan, urgent.
4. targetDurationSec: Durasi video target dalam detik (antara 20 sampai 60 detik; pakai 60 jika ide meminta video 60 detik).
5. hook: Kalimat pembuka 3 detik pertama yang langsung mencengkeram perhatian.
6. takeaway: Intisari kesimpulan akhir yang membekas.
7. claims: 2-8 klaim inti faktual (id: c1, c2, dst). Semua klaim ini WAJIB menjadi landasan naskah.

Keluarkan JSON murni yang sesuai skema.`

  const llmOut = await generateStructured({
    label: 'brief',
    prompt,
    schema: BriefLlmSchema,
    mock: () => {
      const b = defaultMockBrief(slug, style, idea!)
      return {
        title: b.title,
        audience: b.audience,
        tone: b.tone,
        targetDurationSec: b.targetDurationSec,
        hook: b.hook,
        takeaway: b.takeaway,
        claims: b.claims,
      }
    },
  })

  const brief: Brief = {
    schemaVersion: 1,
    slug,
    idea,
    style,
    voiceSource: STYLE_PROFILES[style].voiceSource,
    language: 'id',
    ...llmOut,
  }

  BriefSchema.parse(brief)
  writeJson(p.brief, brief)
  setStage(state, 'brief', 'done', ideaHash, `Brief dibuat: ${brief.title}`)
  saveState(state)

  return brief
}
