import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'

export type LlmRequest<T> = {
  /** nama stage, untuk log */
  label: string
  prompt: string
  /** skema validasi penuh (zod) */
  schema: z.ZodType<T>
  /** pemeriksaan semantik tambahan; kembalikan daftar masalah */
  validate?: (value: T) => string[]
  /** data deterministik untuk runner mock (tes / dry-run tanpa kuota) */
  mock?: () => unknown
  maxAttempts?: number
}

const STRIP_KEYS = new Set([
  '$schema',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'default',
  'title',
  'description',
])

/** JSON Schema untuk `codex exec --output-schema`: buang keyword yang tidak didukung strict mode; zod tetap memvalidasi penuh. */
export function toLlmJsonSchema(schema: z.ZodType): unknown {
  const raw = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node)) {
        if (STRIP_KEYS.has(k) && typeof v !== 'object') continue
        out[k] = walk(v)
      }
      return out
    }
    return node
  }
  return walk(raw)
}

export function llmRunnerName() {
  return process.env.NC_LLM ?? 'codex'
}

function runCodex(prompt: string, jsonSchema: unknown, label: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-llm-'))
  const schemaFile = path.join(tmp, 'schema.json')
  const outFile = path.join(tmp, 'out.json')
  fs.writeFileSync(schemaFile, JSON.stringify(jsonSchema))
  const bin = process.env.CODEX_BIN ?? path.join(os.homedir(), '.local/bin/codex')
  const args = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-C',
    tmp,
    '--output-schema',
    schemaFile,
    '-o',
    outFile,
    '-',
  ]
  if (process.env.NC_CODEX_MODEL) args.splice(1, 0, '-m', process.env.NC_CODEX_MODEL)
  const res = spawnSync(bin, args, {
    input: prompt,
    encoding: 'utf8',
    timeout: Number(process.env.NC_LLM_TIMEOUT_MS ?? 600_000),
    maxBuffer: 32 * 1024 * 1024,
  })
  try {
    if (res.status !== 0 || !fs.existsSync(outFile)) {
      throw new Error(`codex exec gagal untuk ${label} (exit ${res.status}): ${(res.stderr || res.stdout || '').slice(-600)}`)
    }
    return fs.readFileSync(outFile, 'utf8')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('keluaran LLM bukan JSON')
    return JSON.parse(match[0])
  }
}

export async function generateStructured<T>(req: LlmRequest<T>): Promise<T> {
  const runner = llmRunnerName()
  const maxAttempts = req.maxAttempts ?? 3
  let prompt = req.prompt
  let lastIssues: string[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let candidate: unknown
    if (runner === 'mock') {
      if (!req.mock) throw new Error(`NC_LLM=mock tetapi stage ${req.label} tidak punya data mock`)
      candidate = req.mock()
    } else if (runner === 'codex') {
      candidate = extractJson(runCodex(prompt, toLlmJsonSchema(req.schema), req.label))
    } else {
      throw new Error(`NC_LLM tidak dikenal: ${runner} (pilih codex atau mock)`)
    }

    const parsed = req.schema.safeParse(candidate)
    if (!parsed.success) {
      lastIssues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    } else {
      lastIssues = req.validate?.(parsed.data) ?? []
      if (lastIssues.length === 0) return parsed.data
    }
    if (runner === 'mock') break
    console.log(`  ! ${req.label} percobaan ${attempt}/${maxAttempts} ditolak:\n    - ${lastIssues.slice(0, 8).join('\n    - ')}`)
    prompt = `${req.prompt}\n\n## PERBAIKI\nKeluaran sebelumnya ditolak validator dengan masalah berikut. Perbaiki semuanya dan keluarkan JSON lengkap yang baru:\n${lastIssues.map((i) => `- ${i}`).join('\n')}`
  }
  throw new Error(`${req.label}: keluaran tidak valid setelah ${maxAttempts} percobaan:\n- ${lastIssues.join('\n- ')}`)
}
