# HyperFrames workspace

Workspace renderer NaraClip menggunakan HyperFrames 0.8.4, GSAP 3.14.2, Node.js 24, dan FFmpeg. Panduan untuk konten berikutnya ada di [`../docs/video-production-playbook.md`](../docs/video-production-playbook.md); ringkasan proyek aktif ada di [`content/pedas-capsaicin/README.md`](content/pedas-capsaicin/README.md).

## Organisasi

Setiap video memiliki folder sendiri di `content/<slug>/`, mencakup sumber komposisi, data caption/timing, skrip build, aset audio/visual, snapshot review, dan export. Aset bersama saja yang berada di `assets/fonts/` dan `assets/vendor/`.

Buat folder baru dari root repository dengan `node renderer/tools/new-content.mjs <slug> "<title>"`.

Untuk kompatibilitas workspace aktif, `index.html`, `scripts/`, `snapshots/`, `assets/pedas-capsaicin/`, dan `output_pedas_capsaicin*.mp4` menunjuk ke `content/pedas-capsaicin/`. File sumber komposisi adalah `content/pedas-capsaicin/composition.html`; jangan menaruh aset baru di alias lama.
Skrip build harus menulis ke `content/<slug>/composition.html`. Alihkan symlink `index.html` hanya saat memilih project yang siap dirender.

## Build dan render

Jalankan dari folder ini:

```sh
export PATH="$HOME/.local/bin:$PATH"
node scripts/build-pedas.mjs
node scripts/mix-pedas.mjs
npx --no-install prettier --write content/pedas-capsaicin/composition.html content/pedas-capsaicin/scripts/*.mjs
npx --no-install hyperframes lint
npx --no-install hyperframes check --at 0.8,4.1,9.3,18.9,23.4,29.5
npx --no-install hyperframes snapshot --at 0.8,4.1,9.3,18.9,23.4,29.5 --no-end -o content/pedas-capsaicin/previews/review
npx --no-install hyperframes render --fps 30 --quality high --workers 4 -o content/pedas-capsaicin/exports/v5-pre-master.mp4
```

Render setiap revisi ke nama versi baru. Setelah review dan pemeriksaan decode selesai, arahkan `exports/final.mp4` ke versi yang disetujui. Atribusi Sneaky Snitch untuk deskripsi YouTube serta hasil QC v4 tercatat di README project pedas.
