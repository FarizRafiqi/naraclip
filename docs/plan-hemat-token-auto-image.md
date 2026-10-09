# Plan: NaraClip lebih hemat token + generate gambar otomatis tanpa biaya bulanan tambahan

Status: diperbarui 2026-10-09 setelah keputusan "jalur utama = web Gemini via `gemini_webapi`".

## 0. Status pekerjaan

| Bagian                                                                                       | Status                                                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `renderer/tools/imagegen/imagegen.py` — `generate` (gemini_webapi), `pack` (manual), `check` | Ditulis. `pack` dan `generate --dry-run` diuji; **`generate` belum pernah dijalankan dengan cookie asli**. |
| `renderer/tools/archive-content.mjs` + `restore-content.mjs`                                 | Ditulis dan diuji pada pedas-capsaicin (arsip + restore + checksum). Belum dijalankan dengan `--prune`.    |
| `image-jobs.json` pedas-capsaicin (16 job)                                                   | Ada, sebagai catatan prompt yang sudah dipakai.                                                            |
| Backend cadangan #2–#4 (port TypeScript, Playwright)                                         | **Belum dibuat.** Satu-satunya cadangan yang ada sekarang: `pack` manual.                                  |
| Kit bersama, `measure.py`, `qa.mjs` (hemat token)                                            | **Belum dibuat.**                                                                                          |
| ComfyUI                                                                                      | Provider ada di kode aplikasi dan dites, tapi **belum dipasang atau dicoba** di mesin ini.                 |
| Provider `gemini_webapi` di aplikasi NaraClip                                                | **Tidak ada, dan tidak direncanakan** (lihat bagian 2).                                                    |

## 1. Fakta yang membatasi desain (sudah dicek)

| Fakta                                                                                                                                                                                                     | Dampak                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Langganan **Google AI Pro** memberi kuota Nano Banana di **aplikasi Gemini** (±100 gambar/hari), **bukan** kuota API.                                                                                     | Tidak ada jalur resmi untuk memanggilnya dari skrip.                             |
| **Gemini API**: semua model gambar (Nano Banana 2/2.1/Pro) **tidak punya free tier**; $0.034–$0.24 per gambar (batch ±50% lebih murah).                                                                   | Jalur API = bayar per pakai, bukan langganan.                                    |
| **9router** merutekan model _chat_ lewat OAuth langganan. Tidak terbukti mengekspos model gambar, dan pemakaian sesi langganan lewat proxy berisiko melanggar ToS. Free tier Gemini CLI sudah dihentikan. | **Tidak dipakai** untuk gambar.                                                  |
| **useapi.net** (Google Flow API) berbayar US$15/bulan.                                                                                                                                                    | Tidak dipakai (melanggar syarat tanpa biaya bulanan tambahan).                   |
| Mesin: **RTX 5070 Ti Laptop 12 GB VRAM**; WSL dibatasi ±10 GB RAM (pernah crash).                                                                                                                         | Bila ComfyUI dipakai, jalankan **native di Windows**, bukan di WSL.              |
| Provider 9router/ComfyUI di aplikasi hanya mengirim teks prompt, tanpa gambar referensi.                                                                                                                  | Konsistensi karakter butuh input referensi; tambahkan bila provider itu dipakai. |

Sumber: halaman harga Gemini API, README dan issue decolua/9router, panduan pihak ketiga soal kuota aplikasi Gemini (cek ulang tiap kuartal).

## 2. Keputusan arsitektur

**Alat utama gambar untuk video = `gemini_webapi`** (HanaokaYuzu/Gemini-API, Python 3.11+): memakai cookie login `__Secure-1PSID` / `__Secure-1PSIDTS` dari web Gemini, sehingga kuota Nano Banana langganan AI Pro terpakai. Mendukung generate dan edit dengan gambar referensi.

- **Risiko:** tidak resmi (reverse-engineered), bisa rusak kapan saja, berpotensi melanggar ToS Google → akun bisa dibatasi.
- **Mitigasi:** akun Google terpisah bila memungkinkan; jeda acak antar request; batas 30 gambar/hari (`NARACLIP_IMAGE_DAILY_CAP`); cookie dari Firefox (cookie Chromium cepat kedaluwarsa); watermark tidak dihapus.
- **Letaknya:** skrip lokal untuk workflow video (`imagegen.py`), **bukan** provider di server aplikasi. Alasannya: sesi login pribadi tidak cocok untuk aplikasi multi-pengguna.

Rantai cadangan (urut):

| #   | Backend                                                          | Status                       | Mekanisme                                                                 | Rusak bersamaan dengan                     |
| --- | ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | `gemini_webapi`                                                  | ada, belum diuji cookie asli | Protokol web internal + cookie                                            | #2 bila Google ganti protokol              |
| 2   | `baoyu-danger-gemini-web` (port TypeScript, JimLiu/baoyu-skills) | belum                        | Protokol yang sama, codebase lain                                         | #1 (hanya menolong bila bug di library #1) |
| 3   | Playwright + profil browser yang sudah login                     | belum                        | Klik UI gemini.google.com: upload referensi, kirim prompt, unduh gambar   | Hanya bila UI berubah                      |
| 4   | Playwright di Google Flow (labs.google/flow)                     | belum                        | Sama, situs berbeda                                                       | Independen                                 |
| 5   | Prompt pack manual (`imagegen.py pack`)                          | ada                          | Tempel sendiri ke gemini.google.com, simpan dengan nama file yang tertera | Tidak pernah                               |

Backend lain:

- **Gemini API (berbayar):** nonaktif. Tidak ada kode untuknya.
- **ComfyUI lokal (Rp0, GPU):** **opsional dan belum diputuskan.** Dipertimbangkan hanya bila kualitas atau kuota web Gemini tidak cukup. Kandidat model (cek lisensi dulu): Qwen-Image-Edit (Apache-2.0) untuk variasi pose dari referensi, Qwen-Image/FLUX kuantisasi GGUF/FP8 untuk props dan background, BiRefNet untuk cutout.

Di aplikasi NaraClip, rute image default tetap **`svg-local`** (placeholder tanpa dependensi). `comfyui` dan `9router` terdaftar sebagai opsi yang bisa dipilih lewat `provider_routes`.

## 3. Hemat token (Claude) — dari mana boros di proyek pedas-capsaicin

| Pemborosan yang terjadi                                                   | Perbaikan (belum dikerjakan)                                                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build script ±700 baris ditulis ulang per video                           | Kit bersama `renderer/tools/vinconium-kit.mjs` (charW, prop, label, arrowTo, steam, embers, swap, camPush, SFX synth, narasi, caption, BGM). Per video cukup shot list ±150 baris.           |
| Banyak membaca gambar grid untuk mengukur koordinat                       | `measure.py`: bbox alpha, deteksi mata googly, crop props, tepi meja → `data/measurements.json`. Claude membaca angka, bukan gambar.                                                         |
| Iterasi snapshot berkali-kali untuk cacat yang bisa dicek mesin           | `qa.mjs` satu perintah: lint, check, alpha leak, black detect, caption cps/overlap, true peak, elemen keluar frame → laporan teks. Gambar hanya satu contact sheet resolusi rendah di akhir. |
| Pelajaran (mata bocor, defringe, TP AAC, symlink D:) diturunkan ulang     | Masukkan ke SKILL.md vinconium-short dan skrip templat (`prep_visuals.py`, `make_srt_en.mjs`, `master.mjs`).                                                                                 |
| Semua kerja mekanis memakai model besar                                   | Delegasikan rename, render, dan QA ke subagent model kecil; model besar untuk naskah, shot list, dan review akhir.                                                                           |
| Diskusi panjang di luar produksi (nama channel) memakan konteks yang sama | Satu sesi = satu video; brainstorm di sesi lain.                                                                                                                                             |

Target terukur: pembacaan gambar ≤5 per video, satu sesi tanpa kompaksi per video, tidak ada penulisan ulang helper.

## 4. Fase kerja

### Fase 0 — Selesai (prototipe)

`imagegen.py` (generate/pack/check), `image-jobs.json` pedas, `archive-content` / `restore-content`.
Sisa untuk menutup fase ini: jalankan `imagegen.py check` lalu `generate --limit 1` dengan cookie asli; catat hasilnya.

### Fase 1 — Kit & QA (hemat token; tanpa GPU)

1. Ekstrak helper dari `build-pedas.mjs` ke `renderer/tools/vinconium-kit.mjs`.
2. Ubah build pedas jadi pemakai kit; hasil render harus identik secara visual dengan v6.
3. `renderer/tools/measure.py` dan `renderer/tools/qa.mjs`.
4. Perbarui SKILL.md vinconium-short.

- **Selesai bila:** rebuild pedas lewat kit → lint 0 error, `qa.mjs` hijau, snapshot sama dengan v6.

### Fase 2 — Rantai cadangan generator

1. Runner berantai yang mencoba backend #1 → #5 dan mencatat backend yang dipakai di `imagegen-manifest.json`.
2. Backend #2 (port TypeScript), lalu #3 (Playwright Gemini), lalu #4 (Playwright Flow).
3. `ingest.mjs`: pantau `D:\...\02_images\inbox`, cocokkan file manual ke job, rename ke `generated-raw`.

- **Selesai bila:** mematikan backend #1 dengan sengaja (cookie kosong) tetap menghasilkan gambar lewat cadangan berikutnya.

### Fase 3 — ComfyUI lokal (opsional; hanya bila diputuskan)

1. Pasang ComfyUI portable di Windows + node GGUF + RMBG/BiRefNet; akses dari WSL via localhost (networking mirrored) atau IP host.
2. Workflow API di `renderer/tools/comfy-workflows/` (`prop`, `background`, `pose-from-ref`, `cutout`).
3. `ComfyUiImageProvider` mendukung workflow per `kind`; `ImageGenerationInput` ditambah `referenceImages` dan `background`.
4. Uji: generate ulang 10 props + 3 pose pedas-capsaicin, bandingkan berdampingan dengan hasil Gemini.

- **Selesai bila:** keputusan tertulis job mana yang lokal dan mana yang web Gemini.

### Fase 4 — Ukur

Produksi satu video baru dari `docs/ide-konten-niche-vinconium.md` memakai pipeline baru; catat jumlah gambar per backend, waktu, iterasi render, dan pembacaan gambar.

## 5. Risiko

| Risiko                                                     | Mitigasi                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Google mengubah web Gemini; `gemini_webapi` rusak          | Rantai cadangan (#2–#5); `pack` manual selalu tersedia.                             |
| Akun dibatasi karena akses otomatis                        | Akun terpisah, volume rendah, jeda acak, tanpa penghapusan watermark.               |
| Cookie kedaluwarsa (terutama Chromium)                     | Cookie dari Firefox; `imagegen.py check` sebelum batch.                             |
| Kualitas lokal (bila ComfyUI dipakai) di bawah Nano Banana | Karakter pertama dari web Gemini; pose turunan lewat Qwen-Image-Edit; QA tetap.     |
| VRAM 12 GB tidak cukup                                     | GGUF Q4/Q5 atau FP8, satu model aktif per job.                                      |
| Lisensi model lokal                                        | Prioritaskan Apache-2.0; cek lisensi FLUX sebelum dipakai untuk channel monetisasi. |
| Kuota/aturan Google berubah                                | Fakta di bagian 1 dicek ulang tiap kuartal.                                         |

## 6. Keputusan

Sudah diputuskan:

- Jalur utama gambar = `gemini_webapi` (bukan ComfyUI, bukan Gemini API berbayar, bukan 9router/OAuth).
- Tanpa biaya bulanan tambahan: Gemini API tetap nonaktif.

Masih terbuka:

1. Pasang ComfyUI di Windows (±30–40 GB model) atau tidak?
2. Cutout tetap manual atau otomatis lewat BiRefNet lokal?
3. Jalankan `archive-content --prune` pada pedas-capsaicin? (menghapus previews, hasil render lama, dan folder turunan; final tetap ada)

## 7. Arsip aset per video

Ukuran pedas-capsaicin sebelum prune: exports 348 MB (v1–v6 + master), previews 139 MB, source 63 MB, audio 39 MB, generated 28 MB, processed 24 MB. Penghematan terbesar = **membuang yang bisa dibuat ulang**, bukan kompresi (PNG/MP4 sudah terkompres).

`node renderer/tools/archive-content.mjs <slug> [--shorts-dir <dir>] [--prune]`, setelah video final:

1. Final (MP4 master dan `.srt`) dan README disalin ke `<shorts-dir>/05_export/`.
2. Semua yang tidak bisa dibangun ulang dikemas ke `<shorts-dir>/archive/<slug>-src.tar.xz` (symlink tetap berupa symlink; sumber gambar/VO yang sudah ada di D: tidak digandakan), beserta `.sha256` dan `RESTORE.md`. Arsip diverifikasi (daftar isi + checksum).
3. Dengan `--prune` (dan hanya setelah arsip lolos verifikasi) folder turunan dihapus: `previews/`, `assets/visuals/processed/`, `assets/audio/processed/`, `assets/visuals/generated/background/`, serta hasil render lama selain final.
4. `node renderer/tools/restore-content.mjs <slug> [--shorts-dir <dir>] [--into <dir>]` memverifikasi checksum lalu membongkar arsip; build dan render dijalankan ulang sesuai `RESTORE.md`.

Hasil uji pada pedas-capsaicin: arsip 16 MB (karena sumber besar sudah di D: lewat symlink), restore ke folder uji berhasil. Format `tar.xz` dipakai karena `zstd` belum terpasang (butuh sudo); ganti ke `tar --zstd` bila sudah ada.
