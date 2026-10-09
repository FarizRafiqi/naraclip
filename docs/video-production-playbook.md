# Panduan Produksi Video NaraClip

Panduan ini mencatat workflow HyperFrames dan preferensi visual/audio yang sudah disepakati saat membuat explainer pendek NaraClip. Terapkan sebagai titik awal; spesifikasi tiap konten tetap menentukan naskah, durasi, fakta, dan kebutuhan visualnya.

## Stack dan format dasar

- Workspace renderer: `renderer/`, HyperFrames 0.8.4, GSAP 3.14.2, Node.js 24, pnpm 10.
- Format Shorts: portrait 9:16, 1080 × 1920, 30 fps. Durasi mengikuti audio final; jangan memanjangkan narasi hanya untuk memenuhi angka durasi rencana.
- Rendering dan inspeksi: `npx --no-install hyperframes lint`, `check`, `snapshot`, lalu `render`. Gunakan FFmpeg/FFprobe untuk pemeriksaan media.
- Aset bersama renderer, seperti font Outfit dan GSAP, tinggal di `renderer/assets/`. Semua aset dan output khusus konten tinggal di `renderer/content/<slug>/`.

## Struktur per konten

Gunakan slug kecil dan stabil, misalnya `pedas-capsaicin`:

```sh
node renderer/tools/new-content.mjs kenapa-langit-biru "Kenapa Langit Berwarna Biru?"
```

Jalankan dari root repository. Scaffold membuat README, komposisi HyperFrames kosong, serta semua folder sumber, hasil proses, preview, dan export. Jangan alihkan alias komposisi aktif sampai project baru siap dirender.

```text
renderer/content/<slug>/
  README.md                 catatan, timeline, keputusan, lisensi, hasil QC
  composition.html          sumber komposisi HyperFrames
  data/                     transkrip, word timing, edit timing, shot list
  scripts/                  build/mix khusus konten
  assets/
    audio/source/voice/      rekaman narasi asli
    audio/source/music/      musik unduhan dan kandidat
    audio/source/sfx/        efek unduhan dan catatan lisensi
    audio/processed/voice/   trim dan mix narasi
    audio/processed/music/   musik yang di-mix/duck
    audio/processed/sfx/     efek yang dipakai di timeline
    audio/archive/           alternatif yang tidak dipakai
    visuals/source/          aset visual sumber yang sudah disetujui
    visuals/generated/       hasil generasi final
  previews/                  snapshot, contact sheet, dan review visual
  exports/                   render per versi dan final.mp4
```

### Konvensi Git & Isolasi Konten

- **Core Repository vs Content Workspaces:** Repositori Git hanya melacak core application (AdonisJS, Inertia, tools umum, shared assets font/vendor, dokumentasi). Folder konten `renderer/content/<slug>/` dan `public/content/<slug>/` diperlakukan sebagai **self-contained local workspaces** dan di-ignore dari Git agar repo tetap ringan.
- **Skrip Khusus Video:** Semua skrip otomasi yang spesifik untuk satu video (build GSAP, mix audio, ekstraksi cutout, transkripsi Whisper) **harus disimpan di dalam `renderer/content/<slug>/scripts/`**, bukan di root `scripts/`. Root `scripts/` hanya untuk otomasi umum level aplikasi.
- `renderer/index.html`, `renderer/scripts`, `renderer/snapshots`, dan `renderer/output_*.mp4` adalah alias dinamis lokal untuk project yang sedang aktif dirender. Jangan commit alias ini ke Git; biarkan `renderer/index.html` di repo mengarah pada template dasar.

## Urutan kerja

1. Baca brief/spec konten. Pastikan fakta, naskah, referensi, tone, dan durasi yang diminta jelas. Tandai bagian yang perlu pemeriksaan sumber.
2. Simpan rekaman asli tanpa perubahan di `assets/audio/source/voice/`. Dengarkan setiap file dan konfirmasi isi serta urutan aktual; nama file kadang tidak cocok dengan storyboard.
3. Trim senyap yang tidak disengaja di awal/akhir rekaman. Pertahankan jeda napas/intonasi yang memang bagian dari penyampaian. Buat hasil edit baru di `audio/processed/voice/`, tambah fade pendek untuk mencegah klik, lalu normalisasi secara konsisten. Jangan menimpa file sumber.
4. Buat/rapikan word-level timing dan caption dalam `data/`. Koreksi salah transkripsi, tetapi jangan mengganti kata dengan naskah yang tidak diucapkan. Sinkronkan timestamp setelah trimming dan susun act dari audio yang benar-benar direkam.
5. Letakkan visual sumber dan hasil generasi di kategori yang sesuai. Untuk kolase stop-motion, siapkan tiap pose sebagai layer terpisah; foreground meja dapat menutupi karakter supaya karakter terasa berada di belakang meja.
6. Susun audio di timeline dengan narasi sebagai foreground. Pilih BGM berlisensi jelas dan simpan URL, penulis, jenis lisensi, serta perubahan yang dilakukan. Mulai dari level musik 0.15–0.20 (`data-volume="0.18"` dipakai pada project pedas) dan gunakan sidechain ducking.
7. Tambahkan SFX hanya untuk mendukung beat visual: pergantian pose, aksi minum, ledakan panik, dan payoff solusi. Gunakan efek human yell bila ekspresi kepedasan membutuhkannya. Hindari bunyi rendah/aneh yang mengalihkan perhatian; hapus cue dari timeline dan arsipkan file tak terpakai.
8. Render snapshot pada awal, tiap pergantian beat, bagian caption panjang, dan outro. Periksa ukuran/posisi karakter, meja, prop, garis aman Shorts, keterbacaan caption, audio, serta sinkronisasi.
9. Simpan tiap percobaan render sebagai versi baru di `exports/`. Jalankan lint dan check, decode FFmpeg, serta FFprobe sebelum menetapkan `final.mp4`. Catat durasi, resolusi, fps, codec, loudness/true peak jika tersedia, hash, dan hasil pemeriksaan di README konten.
10. Simpan kredit musik untuk deskripsi publikasi bila lisensinya meminta atribusi. Jangan membakar daftar sumber/credit card ke video kecuali diminta.

## Preferensi visual yang sudah disepakati

- Gaya Vinconium: Kolase mixed-media berbasis foto & layer dengan pose stop-motion, googly eyes pada karakter, dan animasi kinetik snappy (`back.out(1.7)`).
  - **Props Realistis (Bukan Stiker 2D):** Mayoritas props berupa objek fotorealistis (botol kemasan asli, snack foil kusut, makanan renyah, penampang 3D organ usus, butiran softgel vitamin mengkilap).
  - **Layering Video/GIF (Video di Atas Video):** Gunakan looping video/GIF transparan untuk efek fluida/partikel (misal: minyak mendidih di dalam wajan, uap mengepul, peristaltik usus, percikan api).
  - **Bukti Otentik (Real Evidence):** Jangan semua digenerate AI; sertakan screenshot asli artikel berita/jurnal (L.A. Times, Reuters, dll.) dengan highlight stabilo teks penting di atas grid background untuk kredibilitas investigatif.
  - **Kamera Dinamis (Zoom In / Zoom Out):** Terapkan slow push-in (zoom in) untuk memusatkan fokus ke ekspresi karakter, wajan, atau artikel berita; serta zoom out untuk reveal konteks ruangan/peta.
  - **Translasi Posisi Nyata (Bukan Sekadar Wiggle/Getar):** Jangan membuat semua gambar bergetar acak. Jika objek perlu bergerak/berjalan (karakter masuk frame, kapsul meluncur di usus, tetesan minyak jatuh), animasikan posisi X dan Y secara terarah meskipun gambarnya statis.
- Caption tanpa kotak atau panel latar: teks putih tebal dengan outline hitam tipis dan bayangan halus. Baseline project pedas ialah Outfit Black 70 px dengan stroke 2.5 px.
- Caption harus benar-benar center secara horizontal. Baseline project pedas memakai area 760 px dari x=160 sampai x=920 (pusat x=540), `top: 1140px`, dengan ruang aman untuk kontrol Shorts dan UI bagian bawah. Review di resolusi penuh; jangan mengandalkan alignment visual perkiraan.
- Panggung dapur project pedas memakai karakter lebih kecil dan tampak di belakang meja; meja menutup bagian bawah karakter. Untuk latar kosong, gunakan prompt user yang disetujui di README project pedas.
- Untuk ilustrasi penyebaran minyak pedas, pakai glow merah tepi yang lembut/berbulu, bukan border tebal berbentuk kotak.

## Elemen yang jangan ditambahkan tanpa permintaan

- Tidak ada tulisan/label dekoratif di atas kepala, nama channel atau branding di footer, progress bar kuning, panel background caption, atau sumber bacaan/credit card di akhir video.
- Jangan menambahkan frasa seperti “paham kan” bila tidak ada di rekaman. Caption hanya mengikuti audio yang terdengar.
- Jangan menambah cue BGM/SFX yang menutupi kata, terdengar seperti buzzer rendah, atau tidak punya beat visual yang jelas.

## Perintah renderer

Jalankan dari `renderer/`:

```sh
export PATH="$HOME/.local/bin:$PATH"
node scripts/build-pedas.mjs
node scripts/mix-pedas.mjs
npx --no-install hyperframes lint
npx --no-install hyperframes check --at 0.8,4.1,9.3,18.9,23.4,29.5
npx --no-install hyperframes snapshot --at 0.8,4.1,9.3,18.9,23.4,29.5 --no-end -o content/pedas-capsaicin/previews/review
npx --no-install hyperframes render --fps 30 --quality high --workers 4 -o content/pedas-capsaicin/exports/v5-pre-master.mp4
```

Sesuaikan slug, timestamp, dan nomor versi untuk konten berikutnya. Jangan render ke nama versi yang sudah ada. Saat merender project baru, pastikan entrypoint HyperFrames menunjuk ke komposisi yang sedang dikerjakan.
