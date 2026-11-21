#!/usr/bin/env node
/**
 * NaraClip Codex Image Generation Runner
 *
 * Menggunakan Codex CLI non-interaktif (`codex exec`) yang terhubung dengan akun
 * ChatGPT Plus lokal (~/.codex/auth.json) untuk menghasilkan gambar resolusi tinggi
 * tanpa memotong kuota OpenAI Platform API (Rp0 biaya API).
 *
 * Usage:
 *   node packages/hyperframes/tools/imagegen/codex_imagegen.mjs --prompt "..." --out <output_path>
 *   node packages/hyperframes/tools/imagegen/codex_imagegen.mjs --job <slug> <job_id>
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const CODEX_BIN = process.env.CODEX_BIN || path.join(process.env.HOME || '', '.local/bin/codex');
const CODEX_GENERATED_DIR = path.join(process.env.HOME || '', '.codex/generated_images');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' && args[i + 1]) parsed.prompt = args[++i];
    else if (args[i] === '--out' && args[i + 1]) parsed.out = args[++i];
    else if (args[i] === '--dry-run') parsed.dryRun = true;
    else if (args[i] === '--help') {
      console.log(`Usage:
  node codex_imagegen.mjs --prompt "<prompt>" --out <file_path.png>
  node codex_imagegen.mjs --help`);
      process.exit(0);
    }
  }
  return parsed;
}

async function main() {
  const { prompt, out, dryRun } = parseArgs();

  if (!prompt || !out) {
    console.error('Error: --prompt dan --out wajib diisi.');
    process.exit(1);
  }

  const outPath = path.resolve(process.cwd(), out);
  const outDir = path.dirname(outPath);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[Codex Imagegen] Menyiapkan generate gambar...`);
  console.log(`[Codex Imagegen] Output target: ${outPath}`);
  console.log(`[Codex Imagegen] Prompt: ${prompt.slice(0, 100)}...`);

  if (dryRun) {
    console.log('[Codex Imagegen] Dry run selesai.');
    return;
  }

  if (!fs.existsSync(CODEX_BIN)) {
    console.error(`Error: Codex binary tidak ditemukan di ${CODEX_BIN}`);
    process.exit(1);
  }

  // Rekam snapshot file yang sudah ada sebelum eksekusi
  const beforeFiles = fs.existsSync(CODEX_GENERATED_DIR)
    ? fs.readdirSync(CODEX_GENERATED_DIR, { recursive: true })
    : [];

  const codexInstruction = `You must generate an image using your image generation tool with the following prompt:
"${prompt}"
After generating the image, inform that the generation is complete.`;

  console.log(`[Codex Imagegen] Menjalankan 'codex exec' via ChatGPT Plus session...`);
  const t0 = Date.now();

  try {
    const stdout = execFileSync(
      CODEX_BIN,
      [
        'exec',
        '--ephemeral',
        '--dangerously-bypass-approvals-and-sandbox',
        codexInstruction,
      ],
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 180000, // 3 menit
      }
    );

    // Cari file gambar baru di ~/.codex/generated_images/
    const afterFiles = fs.existsSync(CODEX_GENERATED_DIR)
      ? fs.readdirSync(CODEX_GENERATED_DIR, { recursive: true })
      : [];

    const newFiles = afterFiles.filter(
      (f) =>
        !beforeFiles.includes(f) &&
        (String(f).endsWith('.png') || String(f).endsWith('.jpg') || String(f).endsWith('.webp'))
    );

    if (newFiles.length > 0) {
      // Ambil file yang terbaru
      const candidate = path.join(CODEX_GENERATED_DIR, String(newFiles[newFiles.length - 1]));
      fs.copyFileSync(candidate, outPath);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[Codex Imagegen] ✅ Sukses dalam ${elapsed}s! Gambar disimpan di: ${outPath}`);
    } else {
      console.log(`[Codex Imagegen] Respon selesai (${((Date.now() - t0) / 1000).toFixed(1)}s).`);
      console.log(stdout.slice(-500));
    }
  } catch (err) {
    console.error(`[Codex Imagegen] ❌ Gagal:`, err.message);
    process.exit(1);
  }
}

main();
