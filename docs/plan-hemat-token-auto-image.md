# Plan: NaraClip lebih hemat token + generate gambar otomatis tanpa biaya bulanan tambahan

Status: draft untuk disetujui. Tanggal: 2026-10-09.

## 1. Fakta yang membatasi desain (sudah dicek)

| Fakta | Dampak |
|---|---|
| Langganan **Google AI Pro** memberi kuota Nano Banana di **aplikasi Gemini** (±100 gambar/hari), **bukan** kuota API. | Tidak bisa dipanggil dari skrip secara resmi. |
| **Gemini API**: semua model gambar (Nano Banana 2/2.1/Pro) **tidak punya free tier**; $0.034–$0.24 per gambar (batch ±50% lebih murah). | Jalur API = bayar per pakai, bukan langganan. |
| **9router** merutekan model *chat* lewat OAuth langganan (Antigravity/Gemini CLI). Tidak terbukti mengekspos model gambar via OAuth, dan pemakaian sesi langganan lewat proxy berisiko melanggar ToS (akun bisa dibatasi/diblokir). Free tier Gemini CLI juga sudah dihentikan. | **Tidak dipakai** untuk gambar. Akun Google utama terlalu berharga untuk dipertaruhkan. |
| Mesin: **RTX 5070 Ti Laptop 12 GB VRAM**; WSL dibatasi ±10 GB RAM (pernah crash). | Generate lokal layak, tapi ComfyUI harus jalan **native di Windows**, bukan di WSL. |
| NaraClip sudah punya abstraksi `ImageProvider` + `provider_routes` (comfyui, 9router/openai-compatible, svg). Provider 9router saat ini hanya kirim teks prompt, tanpa gambar referensi. | Konsistensi karakter butuh input gambar referensi; provider baru harus mendukungnya. |

Sumber: halaman harga Gemini API (ai.google.dev/gemini-api/docs/pricing), README & issue decolua/9router, panduan pihak ketiga soal kuota aplikasi Gemini (perlu dicek ulang berkala).

## 2. Keputusan arsitektur

**Router gambar = provider registry NaraClip sendiri**, bukan 9router/LiteLLM. Alasan: sudah ada, tidak menambah proses yang harus dijaga, dan bisa mengatur urutan fallback + anggaran per job.

Tiga jalur gambar, urut prioritas:

| Jalur | Biaya | Otomatis | Dipakai untuk |
|---|---|---|---|
| **A. Lokal — ComfyUI di Windows (GPU)** | Rp0 | Penuh | Props, background, variasi pose dari referensi, cutout |
| **B. Aplikasi Gemini (langganan AI Pro)** | Rp0 (sudah bayar) | Semi: tempel prompt, file di-*ingest* otomatis | Hero shot / karakter pertama yang butuh kualitas Nano Banana |
| **C. Gemini API (opsional, default MATI)** | Bayar per gambar, plafon anggaran | Penuh | Darurat saja; batas `IMAGE_BUDGET_USD=0` secara default |

Tidak direkomendasikan: OAuth langganan lewat router pihak ketiga (9router/Antigravity) untuk gambar.

**Jalur B+ (opsional, eksperimen) — web Gemini "rasa API" lewat cookie.** Paket tidak resmi `gemini_webapi` (HanaokaYuzu/Gemini-API, Python 3.11+) memanggil web app Gemini memakai cookie login (`__Secure-1PSID`, `__Secure-1PSIDTS`), jadi kuota Nano Banana dari langganan AI Pro bisa dipakai dari skrip: generate, edit dengan gambar referensi, 9:16. Versi MCP: AndyShaman/gemini-webapi-mcp (AGPL-3.0).
- Risiko: reverse-engineered dan tidak resmi, bisa rusak kapan saja, berpotensi melanggar ToS Google (akses otomatis) → akun bisa dibatasi.
- Mitigasi bila dipakai: akun Google **terpisah** (mis. anggota family sharing langganan, kalau plan-mu mendukung), volume rendah (±15 gambar/video, jauh di bawah kuota harian), jeda antar request, cookie dari Firefox (cookie Chromium cepat kedaluwarsa karena device-bound), watermark tidak dihapus.
- Implementasi: skrip sidecar `renderer/tools/gemini_web_gen.py` membaca `image-jobs.json` (tanpa token LLM), bukan lewat MCP.

Model lokal yang dikandidatkan (diuji di Fase 3, cek lisensi sebelum dipakai):
- **Qwen-Image-Edit** (Apache-2.0): ganti pose/ekspresi dari gambar referensi karakter → konsistensi wajah.
- **Qwen-Image / FLUX.1 (dev/Krea)** kuantisasi GGUF/FP8 agar muat 12 GB: props fotoreal dan background.
- **BiRefNet** (node RMBG di ComfyUI, GPU Windows): cutout otomatis tanpa memakan RAM WSL.

## 3. Hemat token (Claude) — dari mana boros di proyek pedas-capsaicin

| Pemborosan yang terjadi | Perbaikan |
|---|---|
| Build script ±700 baris ditulis ulang per video | Kit bersama `renderer/tools/vinconium-kit.mjs` (charW, prop, label, arrowTo, steam, embers, swap, camPush, SFX synth, narasi, caption, BGM). Per video cukup **shot list ±150 baris**. |
| Banyak membaca gambar grid untuk mengukur koordinat (meja, mata, lidah, cabai) | `measure.py`: bbox alpha, deteksi mata googly, crop props, tepi meja → `data/measurements.json`. Claude membaca angka, bukan gambar. |
| Iterasi snapshot berkali-kali karena cacat yang bisa dicek mesin | `qa.mjs` satu perintah: lint, check, alpha leak, black detect, caption cps/overlap, true peak, elemen keluar frame → laporan teks. Gambar hanya 1 contact sheet resolusi rendah di akhir. |
| Pelajaran (mata bocor, defringe, TP AAC, symlink D:) diturunkan ulang | Masukkan ke `.claude/skills/vinconium-short/SKILL.md` + skrip `prep_visuals.py`, `make_srt_en.mjs`, `master.mjs` sebagai template. |
| Semua kerja mekanis memakai model besar | Pekerjaan mekanis (rename, menjalankan render, QA) didelegasikan ke subagent model kecil; model besar hanya untuk naskah, shot list, dan review akhir. |
| Diskusi panjang di luar produksi (nama channel) memakan konteks yang sama | Pisahkan sesi: satu sesi = satu video. Brainstorm di sesi/obrolan lain. |

Target terukur (diverifikasi di Fase 5): pembacaan gambar ≤5 per video, satu sesi tanpa kompaksi per video, tidak ada penulisan ulang helper.

## 4. Fase kerja

### Fase 1 — Kit & QA (hemat token; tidak butuh GPU)
1. Ekstrak helper dari `pedas-capsaicin/scripts/build-pedas.mjs` ke `renderer/tools/vinconium-kit.mjs`.
2. Ubah build pedas jadi pemakai kit; hasil render harus identik secara visual dengan v6 (bandingkan snapshot).
3. `renderer/tools/measure.py` dan `renderer/tools/qa.mjs`.
4. Perbarui SKILL.md vinconium-short.
- **Selesai bila:** rebuild pedas lewat kit → lint 0 error, `qa.mjs` hijau, snapshot sama dengan v6.

### Fase 2 — Format job gambar + jalur B (tanpa GPU, langsung bermanfaat)
1. Skema `data/image-jobs.json` per video: `id`, `kind` (char/prop/bg), `prompt`, `refs`, `bg` (white/gray), `size`, `lane` (local/gemini-app/api).
2. Blok karakter tetap (`[CHAR]`) dan props (`[PROP]`) disimpan sebagai template, jadi prompt dirakit skrip, bukan ditulis ulang oleh LLM.
3. `gen-prompt-pack.mjs` → `00_brief/prompt-pack.md` untuk job jalur B (siap tempel ke aplikasi Gemini, urut, dengan nama file target).
4. `ingest.mjs` → pantau `D:\...\02_images\inbox`, cocokkan file ke job (urutan/nama), rename, simpan ke `generated-raw`, lalu cutout otomatis (Fase 3) atau tandai untuk cutout manual.
- **Selesai bila:** satu video baru bisa dari ide → prompt pack → ingest tanpa rename manual.

### Fase 3 — ComfyUI lokal di Windows (jalur A)
1. Pasang ComfyUI portable di Windows + node GGUF + RMBG/BiRefNet; buka akses dari WSL (`localhost` dengan networking mirrored, atau IP host).
2. Simpan workflow API (JSON) di `renderer/tools/comfy-workflows/`: `prop.json`, `background.json`, `pose-from-ref.json`, `cutout.json`.
3. `gen-images.mjs <slug>`: jalankan job jalur A lewat ComfyUI, simpan ke folder D:, catat seed+model di `manifest.json`, lewati job yang hash-nya sudah ada (tidak generate ulang).
4. Uji kualitas: generate ulang 10 props + 3 pose pedas-capsaicin, bandingkan berdampingan dengan hasil Gemini.
- **Selesai bila:** props/background lokal lolos QA visual; keputusan tertulis job mana yang lokal vs aplikasi Gemini.

### Fase 4 — Integrasi ke aplikasi NaraClip
1. `ImageGenerationInput` ditambah `referenceImages` dan `background`.
2. `ComfyUiImageProvider` mendukung workflow per `kind`; `GeminiImageProvider` (jalur C) di belakang flag + plafon anggaran.
3. Seed `provider_routes`: `comfyui-local` primer → `svg-local` fallback; `gemini-api` nonaktif.
4. Tes unit untuk routing, cache hash, dan plafon anggaran.

### Fase 5 — Ukur
Produksi satu video baru dari `docs/ide-konten-niche-vinconium.md` memakai pipeline baru; catat jumlah gambar per jalur, waktu, jumlah iterasi render, dan pembacaan gambar.

## 5. Risiko

| Risiko | Mitigasi |
|---|---|
| Kualitas lokal di bawah Nano Banana (wajah, tangan) | Karakter pertama dari aplikasi Gemini; pose turunan lewat Qwen-Image-Edit; cutout & QA tetap. |
| VRAM 12 GB tidak cukup untuk model penuh | GGUF Q4/Q5 atau FP8, satu model aktif per job. |
| Lisensi model lokal | Prioritaskan Apache-2.0 (Qwen); cek lisensi FLUX sebelum dipakai untuk channel monetisasi. |
| Kuota/aturan Google berubah | Fakta di bagian 1 dicek ulang tiap kuartal. |
| Biaya tak sengaja di jalur C | Default mati, plafon anggaran wajib, log biaya per job. |

## 6. Keputusan yang perlu dari pengguna
1. Setuju jalur C tetap mati (murni Rp0)?
2. Boleh pasang ComfyUI di Windows (±30–40 GB model)?
3. Cutout tetap manual atau otomatis lewat BiRefNet lokal?

## 7. Update 2026-10-09 — keputusan: jalur utama gambar = web Gemini via cookie

### 7.1 Rantai fallback generator (`renderer/tools/imagegen/`)
Satu runner membaca `data/image-jobs.json`, mencoba backend berurutan, berhenti di yang pertama sukses, mencatat backend + durasi di `manifest.json`, dan melewati job yang hash-nya sudah ada.

| Urutan | Backend | Mekanisme | Rusak bersamaan dengan |
|---|---|---|---|
| 1 | `gemini_webapi` (Python, HanaokaYuzu) | Protokol web internal + cookie | #2 bila Google ganti protokol |
| 2 | `baoyu-danger-gemini-web` (TypeScript port, JimLiu/baoyu-skills) | Protokol yang sama, codebase lain | #1 (hanya menolong bila bug di library #1) |
| 3 | Playwright + profil browser login sendiri (dibuat sendiri) | Klik UI gemini.google.com: upload referensi, kirim prompt, unduh gambar | Hanya bila UI berubah — independen dari #1/#2 |
| 4 | Playwright di Google Flow (labs.google/flow) | Sama, situs berbeda; gambar Nano Banana gratis di semua plan | Independen |
| 5 | Prompt pack + `ingest.mjs` (manual) | Tempel sendiri, file di-rename otomatis | Tidak pernah |

Tidak dipakai: useapi.net (Google Flow API) — US$15/bulan, melanggar syarat "tanpa biaya bulanan tambahan"; ekstensi browser — hanya helper UI, Playwright memberi kontrol penuh.
Aturan aman: akun Google terpisah bila memungkinkan, jeda acak antar request, maks ±30 gambar/hari, watermark tidak dihapus, cookie dari Firefox.

### 7.2 Arsip aset per video
Ukuran pedas-capsaicin sekarang: exports 348 MB (v1–v6 + master), previews 139 MB, source 63 MB, audio 39 MB, generated 28 MB, processed 24 MB.
Penghematan terbesar = **membuang yang bisa dibuat ulang**, bukan kompresi (PNG/MP4 sudah terkompres).

`renderer/tools/archive-content.mjs <slug>` setelah video final:
1. Tetap terbuka: `exports/final` (master MP4), `.srt`, README, deskripsi → disalin ke `D:\Projects\Shorts\<NN_slug>\05_export\`.
2. Dibuang (bisa dibangun ulang dari skrip): `previews/`, `exports/v*` non-final, `assets/visuals/processed/`, `assets/audio/processed/`, plate di `generated/background/`.
3. Dikemas ke `D:\Projects\Shorts\<NN_slug>\archive\<slug>-src.tar.zst` (zstd -19 --long): skrip, data, composition.html, sumber gambar/VO/BGM/SFX, manifest. Disertai `sha256` dan daftar isi.
4. `restore-content.mjs <slug>` membongkar arsip, membuat ulang symlink, lalu `build` + render bisa jalan lagi.
Estimasi: ±640 MB → ±0.2 GB arsip + ±50 MB final. Perlu `sudo apt install zstd` (fallback: `tar.xz`).
