import fs from 'node:fs'
import {
  ScriptLlmSchema,
  ScriptSchema,
  validateScript,
  type Brief,
  type Script,
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

export function defaultMockScript(brief: Brief): Script {
  if (brief.style === 'dev-explainer') {
    return {
      schemaVersion: 1,
      beats: [
        {
          id: 'b1',
          narration: 'Pernah mikir nggak, kenapa query database bisa puluhan milidetik tapi Redis bisa selesai dalam sekejap?',
          claimIds: ['c3'],
          onScreenText: 'Kenapa Redis Cepat?',
        },
        {
          id: 'b2',
          narration: 'Kuncinya sederhana. Redis nyimpen seluruh datanya langsung di RAM tanpa perlu bolak-balik muter harddisk.',
          claimIds: ['c1'],
          onScreenText: 'Data Disimpan di RAM',
        },
        {
          id: 'b3',
          narration: 'Ditambah lagi, event loop I/O multiplexing bikin ribuan koneksi ditangani mulus dalam satu thread tanpa overhead.',
          claimIds: ['c2'],
          onScreenText: 'I/O Multiplexing Epoll',
        },
        {
          id: 'b4',
          narration: 'Hasilnya latency sub milidetik dan aplikasi kamu bisa scaling gila-gilaan dengan mudah.',
          claimIds: ['c3'],
          onScreenText: '< 1ms Latency',
        },
      ],
    }
  }

  return {
    schemaVersion: 1,
    beats: [
      {
        id: 'b1',
        narration: 'Lagi kepedesan parah terus langsung neguk segelas air dingin? Selamat, kamu baru aja bikin kesalahan fatal.',
        claimIds: ['c1'],
        onScreenText: 'Jangan Minum Air Dingin!',
      },
      {
        id: 'b2',
        narration: 'Rasa terbakar itu asalnya dari molekul capsaicin. Masalahnya capsaicin itu zat minyak yang nggak larut dalam air.',
        claimIds: ['c1', 'c2'],
        onScreenText: 'Capsaicin = Senyawa Minyak',
      },
      {
        id: 'b3',
        narration: 'Air cuma bakal nyebarin minyak pedas ke seluruh rongga mulut kamu, bikin panasnya makin merata ke mana-mana.',
        claimIds: ['c2'],
        onScreenText: 'Air Malah Menyebarkan Minyak',
      },
      {
        id: 'b4',
        narration: 'Solusinya minum susu hangat atau makan es krim, karena protein kasein di susu bisa mengikat dan menghapus capsaicin.',
        claimIds: ['c3'],
        onScreenText: 'Minum Susu: Kasein Mengikat Lemak',
      },
    ],
  }
}

export async function runScript(
  slug: string,
  options: { force?: boolean } = {}
): Promise<Script> {
  const p = paths(slug)
  const state = loadState(slug)

  if (!fs.existsSync(p.brief)) {
    throw new Error(`brief.json tidak ditemukan untuk slug "${slug}". Jalankan runBrief terlebih dahulu.`)
  }

  const brief = readJson<Brief>(p.brief)
  const briefHash = sha256(brief)

  if (!options.force && state.stages.script.status === 'done' && fs.existsSync(p.script)) {
    if (state.stages.script.inputHash === briefHash) {
      return readJson<Script>(p.script)
    }
  }

  const targetWords = Math.round(brief.targetDurationSec * 2.5)
  const claimsPrompt = brief.claims.map((c) => `- [${c.id}] ${c.text}`).join('\n')

  const prompt = `Anda adalah Naskah Lead / Copywriter untuk NaraClip.
Tulis naskah video pendek (voiceover) berbahasa Indonesia natural, santai, dan bertenaga berdasarkan brief berikut:

Judul: ${brief.title}
Audiens: ${brief.audience}
Tone: ${brief.tone}
Target durasi: ${brief.targetDurationSec} detik (~${targetWords} kata total)
Hook awal: ${brief.hook}
Takeaway: ${brief.takeaway}

DAFTAR KLAIM WAJIB (semua ID ini harus tercakup dalam beat):
${claimsPrompt}

ATURAN NASKAH:
1. Buat antara ${brief.targetDurationSec >= 45 ? '7 sampai 11' : '3 sampai 6'} beat naskah berurutan.
2. Setiap beat memiliki:
   - id: b1, b2, dst.
   - narration: Kalimat yang diucapkan oleh narator (bahasa Indonesia percakapan yang renyah, tanpa bahasa kaku, tanpa karakter em dash —, dan tanpa buzzword klise). JANGAN GUNAKAN TAG HTML.
   - claimIds: Array ID klaim yang dijelaskan di beat ini (misal ["c1"]). SETIAP KLAIM WAJIB MUNCUL MINIMAL SATU KALI.
   - onScreenText: Teks pendek untuk overlay layar (maks 60 karakter, opsional / nullable).
3. Total kata dari seluruh narration harus proporsional dengan target durasi (${brief.targetDurationSec} detik @ 2.5 kata/detik = antara ${Math.round(brief.targetDurationSec * 1.8)} s/d ${Math.round(brief.targetDurationSec * 3.2)} kata total).

Keluarkan JSON murni yang sesuai skema.`

  const llmOut = await generateStructured({
    label: 'script',
    prompt,
    schema: ScriptLlmSchema,
    validate: (candidate) => validateScript(brief, { schemaVersion: 1, ...candidate }),
    mock: () => {
      const mock = defaultMockScript(brief)
      return { beats: mock.beats }
    },
  })

  const script: Script = {
    schemaVersion: 1,
    beats: llmOut.beats,
  }

  ScriptSchema.parse(script)
  writeJson(p.script, script)
  setStage(state, 'script', 'done', briefHash, `Naskah selesai: ${script.beats.length} beats`)
  saveState(state)

  return script
}
