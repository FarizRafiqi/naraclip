# Video work in NaraClip

## Konvensi Repository: Core Framework vs Content Workspace

Repositori Git ini difokuskan murni untuk **Core Application & Shared Video Engine**. Proyek video individual diperlakukan sebagai **Self-Contained Local Workspaces** yang di-ignore dari Git:

1. **Yang Bersifat UMUM (Tracked di Git):**
   - Core AdonisJS backend (`app/`, `config/`, `database/`, `start/`, dll.)
   - Inertia frontend (`inertia/`, dll.)
   - Shared renderer tooling: `renderer/tools/new-content.mjs`, font bersama (`renderer/assets/fonts/`), dan library vendor (`renderer/assets/vendor/`).
   - Root `scripts/`: Khusus untuk skrip otomasi umum level aplikasi (bukan untuk satu video tertentu).
   - Global documentation (`docs/`, `AGENTS.md`, `README.md`).

2. **Yang Bersifat KHUSUS / SPESIFIK KONTEN (Lokal & Gitignored):**
   - Seluruh konten di `renderer/content/<slug>/` dan `public/content/<slug>/` bersifat lokal dan **tidak dipush ke Git**.
   - Setiap kali membuat video baru (`node renderer/tools/new-content.mjs <slug> "<title>"`), simpan SEMUA hal yang berhubungan dengan video tersebut secara mandiri di dalam foldernya:
     - `renderer/content/<slug>/scripts/`: Seluruh skrip khusus video (skrip build GSAP, mixing audio, ekstraksi layer cutout, transkripsi Whisper). **JANGAN PERNAH** menaruh skrip khusus video di root `scripts/`.
     - `renderer/content/<slug>/assets/visuals/`: Layer gambar, cutout PNG, background.
     - `renderer/content/<slug>/assets/audio/`: Rekaman narasi asli, BGM, SFX.
     - `renderer/content/<slug>/data/`: Word timing JSON (`words.json`), edit timing JSON.
     - `renderer/content/<slug>/composition.html`: Komposisi HyperFrames aktif video tersebut.
     - `renderer/content/<slug>/previews/` & `exports/`: Hasil render dan snapshots.

## Urutan Kerja Produksi Video

- Selalu baca [the video production playbook](docs/video-production-playbook.md) dan spec konten sebelum memulai.
- Buat struktur proyek standar dengan `node renderer/tools/new-content.mjs <slug> "<title>"` dari root repository.
- Jalankan skrip build konten dari folder konten masing-masing. Jangan alihkan alias `renderer/index.html` sampai konten tersebut siap dirender, dan jangan commit alias dinamis ke Git.
- Pertahankan rekaman narasi asli dan lisensi sumber aset. Jangan pernah menambah kata pada caption yang tidak diucapkan pada rekaman.
- Sebelum handoff video, jalankan HyperFrames lint dan visual inspection, verifikasi seluruh aset, dan decode MP4 final dengan FFmpeg.

## Standar Visual & Filosofi Props (Aesthetic Vinconium / NaraClip)

- **Props TIDAK MESTI Berupa Stiker Kartun:**
  - Jangan terjebak membuat props hanya sebagai ilustrasi stiker 2D atau vektor kartun flat.
  - Berdasarkan acuan video Vinconium (seperti explainer Olestra/minyak goreng), **mayoritas props berwujud FOTOREALISTIS dan BERTEKSTUR NYATA**:
    - **Produk & Kemasan Riil:** Botol minyak goreng transparan dengan pantulan plastik nyata, kemasan snack bertekstur foil kusut, wajan penggorengan asli, piring gorengan renyah beruap.
    - **Render Sains & Anatomi 3D:** Penampang organ/usus bertekstur daging nyata, butiran/kapsul softgel vitamin (A, D, E, K) transparan mengkilap dengan specular highlight dan refraksi optik.
    - **Lingkungan & Latar Nyata:** Eksterior pabrik industri berpenjaga, peta satelit bumi fotorealistik, kompor dapur nyata.

- **Mixed Media: Looping Video / GIF / Video Ditimpa Video:**
  - Visual dinamis tidak melulu gambar statis yang digeser. Gunakan **looping video transparan, GIF, atau footage riil yang di-masking**:
    - Contoh: video gejolak minyak goreng mendidih dimasukkan ke dalam props wajan di atas kompor gas berapi biru.
    - Video uap panas/asap mengepul transparan di atas makanan matang.
    - Video animasi peristaltik organ pencernaan yang berdenyut/bergerak.
    - Tetesan cairan/minyak realistis yang jatuh menembus pakaian.

- **Bukti Otentik (Authentic Evidence: Screenshot Berita, Jurnal & Dokumen Asli):**
  - **JANGAN SEMUANYA DIGENERATE AI!** Sisipkan artefak dunia nyata untuk membangun kredibilitas jurnalistik/investigatif:
    - Screenshot artikel berita terverifikasi (L.A. Times, Reuters, Kompas, dll.) lengkap dengan tanggal arsip.
    - Efek highlight/stabilo (misal: warna pink atau kuning cerah) pada klaim atau data angka krusial di artikel.
    - Label peringatan resmi badan regulasi (FDA, BPOM) atau dokumen arsip historis.
    - Ditampilkan dalam format card melayang di atas background blueprint/grid minimalis.

- **Karakter Fotorealistis + Gimmick Meme Kontras:**
  - Gunakan foto manusia nyata (bukan kartun generik) dengan pakaian dan tekstur realistis.
  - Transformasi stop-motion cerdas (misal: chef bertubuh kurus mendadak berganti ke foto berbadan gemuk, ekspresi panik menoleh ke belakang).
  - Sentuhan komedi dihadirkan lewat **kontras visual**: subjek dan objek fotorealistis yang serius dipadukan dengan cutout mata googly (googly eyes), noda dramatis, atau pose stop-motion yang jenaka.

- **Motion & Kinetic Physics (GSAP):**
  - **Kamera Dinamis (Zoom In & Zoom Out):**
    - Jangan biarkan adegan terasa kaku/statis seperti slide presentasi.
    - Terapkan **slow push-in (zoom in)** untuk membangun tensi, memusatkan fokus ke ekspresi koki, detail masakan, atau teks artikel berita.
    - Terapkan **zoom out / pull-back** untuk membuka konteks yang lebih luas (reveal dapur, pabrik, atau peta dunia).
    - Lakukan via animasi scale container yang mulus (`scale: 1.0` ke `1.15`, dengan `transformOrigin` terpusat pada subjek penting).
  - **Gerak Posisi Nyata vs Anti-Wiggle Sembarangan:**
    - **JANGAN SEMUA GAMBAR DIBUAT GETAR (RANDOM SHAKE/WIGGLE)!** Efek getar berlebihan tanpa alasan merusak ritme dan terkesan murahan.
    - Jika suatu objek perlu "berjalan", "meluncur", atau "berpindah", **gerakkan posisinya secara lugas (manipulasi sumbu X & Y)**, meskipun gambar asetnya berupa foto statis:
      - Cutout orang statis berjalan masuk frame dari samping (`x: -400 -> 0`).
      - Kapsul vitamin 3D meluncur turun menyusuri lorong usus (`y: 0 -> 800`).
      - Tetesan minyak jatuh menetes ke bawah secara linier.
      - Botol minyak turun mendarat menancap di atas peta benua.
  - **Snappy Pop & Overshoot:**
    - Props dan elemen pendukung masuk dengan overshoot snappy (`back.out(1.7)`), melayang 2.5D saat statis, lalu keluar atau berpindah dengan transisi posisi tegas.
  - Kombinasi objek nyata + video overlay + kamera zoom + pergerakan posisi yang bertujuan (*purposeful positioning*) adalah kunci visual premium NaraClip.
