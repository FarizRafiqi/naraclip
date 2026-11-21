# Panduan Motion Architecture, SFX, & Anti-Slop Channel 2 (Remotion)

Dokumen ini mencatat pelajaran nyata (*post-mortem*) dari produksi explainer 60 detik (`docker-dalam-60-detik`) beserta kerangka berpikir arsitektur gerak agar setiap video Channel 2 berikutnya langsung memiliki kualitas animasi, sinkronisasi audio, dan kejelasan visual yang konsisten sejak render pertama.

---

## Bagian 1: Post-Mortem & Daftar Kesalahan yang Tidak Boleh Diulang

1. **Animasi Berbasis Frame Tetap vs Kata yang Diucapkan**
   - *Kesalahan*: Menjadwalkan elemen SVG dengan delay frame statis (`4, 14, 24, 34`) membuat gambar dan suara berjalan di dua jam berbeda. Elemen muncul terlalu cepat atau terlambat saat tempo bicara berubah.
   - *Aturan Wajib*: Ikat seluruh kejadian visual (`data-cue`, `highlightSteps`, `annotations`, `cmd-1`/`out-1`) ke nilai `atMs` yang dihitung relatif dari `startMs` shot di `timing.json`.

2. **Proportional Word Alignment Drift vs Dynamic Programming (DP)**
   - *Kesalahan*: Memetakan kata naskah ke timestamp Whisper secara proporsional linear (`i / N * M`) menimbulkan pergeseran kumulatif 0,5 hingga 1,0 detik di pertengahan video karena Whisper sering memecah kata majemuk atau istilah teknis (`Dockerfile` menjadi `docker file`, `dotCloud` menjadi `.cloud`).
   - *Aturan Wajib*: Gunakan DP token alignment (`alignBeatsWithWhisper` di `packages/pipeline/src/stages/voice.ts`) agar setiap kata naskah tetap terkunci pada timestamp suara aslinya tanpa pergeseran kumulatif.

3. **Kamera Pan Horizontal (`x != 0`) yang Memotong Diagram Lebar**
   - *Kesalahan*: Menggeser kamera secara horizontal (`x: +115 / -115` dengan `scale: 1.15`) pada diagram 2-kolom (`DOCKERFILE` dan `IMAGE`) atau diagram lebar (`width > 750px`, seperti paus pembawa peti kemas dan balok timbangan) membuat sisi kiri atau kanan diagram terpotong keluar kanvas `1080px`.
   - *Aturan Wajib*: Untuk diagram 2-kolom atau diagram lebar penuh, kunci `camera.x = 0` (center horizontal) dan gunakan gerak skala/vertikal halus (`scale: 0.98` sampai `1.02`, `y: -15` sampai `+15`). Pan horizontal (`x != 0`) dengan `scale >= 1.25` hanya boleh digunakan jika kamera sengaja melakukan close-up pada satu objek tunggal yang terisolasi (misalnya close-up layar laptop di shot pembuka).

4. **Shot "Satu Spring Masuk Lalu Diam 4 Detik"**
   - *Kesalahan*: Memberi animasi masuk hanya pada 0,3 detik pertama lalu membiarkan frame diam selama 3 hingga 5 detik membuat visual terasa seperti slide presentasi pasif (gagal memenuhi dial `MOTION 3`).
   - *Aturan Wajib*: Setiap klausa narasi (kurang lebih setiap 0,8 sampai 1,5 detik) harus memicu minimal satu kejadian visual: elemen baru masuk, stempel menghantam, sorotan baris kode berpindah, anotasi muncul, atau status container berubah.

5. **Kanvas Kosong 60% pada Shot Kode & Terminal (`ink`)**
   - *Kesalahan*: Meletakkan satu `CodeBlock` atau `TerminalBlock` sendirian di tengah kanvas `1080x1920` menyisakan 60% ruang hitam kosong di atas dan bawah.
   - *Aturan Wajib*: Gunakan pola **Split-Stage Workbench** (`DevExplainer/index.tsx`). Tempatkan `CodeBlock` atau `TerminalBlock` mode `compact` di paruh atas (`top: 125px`), dan render SVG pendamping (`shot.svg`) di paruh bawah (`top: 695px`) yang memvisualisasikan dampak kode/perintah secara real time (layer Dockerfile menumpuk, container menyala dengan port aktif, atau log/stop/remove).

6. **Hierarki 3-Tier SFX Claude Web Audio API (Presisi & Halus, Terorganisir)**
   - *Kesalahan*: Memutar blip keras/ziper pada tiap transisi atau memakai sampel acak yang bertabrakan dengan vokal dan ritme visual.
   - *Aturan Wajib (3-Tier SFX Hierarchy)*:
     1. **Tier 1 (Utama)**: Gunakan 56 preset Web Audio API milik Claude di `packages/pipeline/src/audio.ts` (katalog lengkap & WAV ekspor: [claude-pack README](file:///home/farizrafiqi/Projects/naraclip/docs/references/claude-pack/README.md), audio siap pakai: `packages/pipeline/assets/sfx/claude/<preset>.wav`).
     2. **Tier 2 (Sintesis Web Audio Baru)**: Jika dibutuhkan bunyi baru, sintesiskan langsung di `packages/pipeline/src/audio.ts` memakai primitif `tone()` + `noise()` BiquadFilter Web Audio API (`master.gain = 0.7`).
     3. **Tier 3 (Cadangan Eksternal)**: Hanya gunakan berkas audio eksternal (`packages/pipeline/assets/sfx/`) jika sintesis Web Audio API masih belum mencukupi.
   - *Prinsip Penempatan*: SFX dibuat **tenang dan sinkron**: transisi scene memakai bunyi udara halus (`whoosh`, `slideIn`, `swipe`, `swish`), kemunculan elemen memakai `pop`/`bubble`, counter memakai `counter`/`tick`, logo penutup memakai `softHit + bell`, dan dipadukan dengan limiter (`<= 0.88`) + sidechain ducking halus (`threshold=0.09:ratio=1.9:attack=8:release=90`).

7. **Kontras Warna di Bawah Standar WCAG AA (4,5:1)**
   - *Kesalahan*: Pemakaian `#5B6572` di atas `#171F2A` untuk nomor baris kode menghasilkan rasio `2.80:1`, dan teks hijau `#34D399` di atas kartu teal `#128067` menghasilkan `2.53:1`. Keduanya buram saat ditonton di layar ponsel setelah kompresi video.
   - *Aturan Wajib*: Nomor baris minimal `#8E9BAE` (`5.89:1` pada `#171F2A`), komentar `#94A3B8` (`6.47:1`), dan teks di atas kartu `#128067` wajib `#FFFFFF` (`4.87:1`).

8. **Label Uppercase Generik & Proporsi Objek Tidak Akurat**
   - *Kesalahan*: Header `$ SHELL`, `BUILD & RUN`, `MONITOR & CLEAN` membuat tampilan terasa generik AI; teks subtitle memakai drop-shadow kabur berlapis stroke; dan bentuk objek penting (misalnya siluet laptop pembuka) terlihat seperti trapesium terlalu lebar tanpa bezel/engsel.
   - *Aturan Wajib*: Ganti header shell generik dengan prompt minimalis (`~/myapp`), hilangkan drop-shadow pada subtitle yang sudah memiliki stroke `7px`, dan gambar objek utama dengan detail anatomis yang jelas (bezel, kamera, engsel, keyboard deck, trackpad, chassis lip).

9. **Bobot Shot Tidak Sesuai Porsi Kalimat dalam Satu Beat**
   - *Kesalahan*: Jika satu beat memiliki tiga klausa beruntun (misal Beat 9: masalah web+db -> tulis `compose.yaml` -> `docker compose up`) lalu bobot shot dibagi tidak proporsional, shot visual akan berganti sebelum kata kuncinya selesai diucapkan.
   - *Aturan Wajib*: Pecah beat majemuk ke shot tersendiri dan atur `weight` (`1..10`) secara proporsional terhadap rentang `startMs..endMs` tiap klausa di `timing.json`.

10. **Unique Visual World per Topic (Anti Copy-Paste Siluet Antar Video)**
    - *Kesalahan*: Mengulang bentuk kartu berbingkai kotak (`rect` seragam berderet) yang sama persis antar video membuat seluruh konten terasa seperti satu template yang cuma diganti teksnya.
    - *Aturan Wajib*: Tetap pertahankan DNA palet/tipografi/taktil channel, tetapi bangun siluet dan metafora mekanik yang unik per topik (misal untuk Redis: disk platter + lengan aktuator, cutaway toko 2 lantai vs gudang bawah tanah, stopwatch analog `<1ms`, split-flap counter, podium juara, perisai lengkung).

11. **No Blank Early Frame (`0..1.5s`): Base Structural Silhouette Wajib Muncul di `0ms`**
    - *Kesalahan*: Membungkus seluruh elemen utama dalam `data-cue*` yang baru muncul di `>= 1000ms..2650ms` (contoh: kedua ruangan cutaway di shot analogi disk vs RAM sempat menghilang saat `"Analoginya simpel..."` diucapkan) membuat kanvas tampak kosong di awal shot.
    - *Aturan Wajib*: Setiap shot wajib memiliki jangkar visual dasar (`data-anim="pop-1"` atau garis arsitektur utama + outline socket) yang langsung tampil pada `0ms`. Elemen `data-cue*` bertugas mengisi detail, stempel, atau transisi progresif di atas panggung tersebut sesuai kata yang diucapkan, dan cue `cmd-1` terminal wajib dimulai di `300..350ms` (bukan `>= 1000ms`).

12. **Punchy Multi-Layered SFX & Balanced Sidechain Ducking**
    - *Kesalahan*: Sintesis SFX dengan amplitudo `0.10..0.25` dan satu bentuk gelombang sederhana tenggelam oleh narasi ketika dipadukan dengan `sidechaincompress=threshold=0.025:ratio=3.5`.
    - *Aturan Wajib*: Rancang tiap SFX secara berlapis (sub-bass body `40..150Hz` + mid punch + transient click frekuensi tinggi + harmonic shimmer) pada puncak `0.48..0.74` (`soft-knee limit <= 0.88` agar `max_volume <= -1.0 dB`), gunakan penguatan terukur (`volume=1.35,alimiter=limit=0.92:level=false`), dan setel sidechain yang seimbang (`threshold=0.09:ratio=2.0:attack=8:release=90`) agar SFX tetap nendang tanpa menenggelamkan suara narasi.

---

## Bagian 2: Kerangka Berpikir Motion Architecture & Gaya Halus ala Claude

Setiap kali merancang storyboard dan animasi Channel 2 baru, terapkan prinsip arsitektur gerak berikut sejak awal:

- **Gerakan Tenang & Presisi (`20-40px`, `0.94..1.0`, Critically Damped — [claude-pack README](file:///home/farizrafiqi/Projects/naraclip/docs/references/claude-pack/README.md))**:
  - Terapkan prinsip easing lembut tanpa bounce berlebihan (`ShotStage`: `damping: 20, stiffness: 180`; `SvgDiagram`: `damping: 16-18, stiffness: 175-220`, referensi kurva CSS `cubic-bezier(.22, 1, .36, 1)`). Palette tetap bebas & kreatif per topik/video.
  - Elemen masuk dengan fade + slide kecil `20-40px` (`slideUp: 32px`, `slideRight: -36px`, `drop: -72px`, `slide-push: 56px`), scale subtle (`pop: 0.96 -> 1.0`, `stamp-cut: 1.04 -> 1.0`, `popAt: 0.88 -> 1.0`, `stamp: 1.16 -> 1.0`), serta getaran mikro maksimal `4px`.
  - Sinkronkan transisi scene dengan `whoosh`/`slideIn`/`swish`/`swipe` halus dan aksi utama dengan `cue.atMs`.

1. **Word-Driven Choreography (Satu Klausa = Satu Aksi)**
   Jangan berpikir "apa gambar untuk beat ini", melainkan "apa kejadian sekuensial untuk tiap kata kunci di kalimat ini". Peta waktu dari `timing.json` ditulis dulu, baru SVG dan keyframe disusun mengelilingi titik-titik kata tersebut.

2. **Fisika sebagai Penjelasan (*Physics as Explanation*)**
   Gunakan kurva gerak dan berat massa untuk menjelaskan konsep abstrak tanpa menambah kata di layar:
   - Hal berat/lambat (Guest OS di VM): `data-cue-drop` dengan `thud-heavy` yang menekan pan timbangan ke bawah.
   - Hal ringan/instan (Container, port binding): `pop-rise` cepat dan memantul ringan ke atas.
   - Transisi data antar-mesin: lintasan melengkung (`arc-throw`), bukan sekadar fade in/out.

3. **Satu Titik Fokus per Layar (*Single Focal Point*)**
   Jika membandingkan dua arsitektur (seperti VM vs Container), hindari menaruh dua tabel sejajar yang sama besar karena mata penonton kebingungan memilih arah baca. Satukan ke satu mekanisme pusat (timbangan jungkat-jungkit, mesin cetak stensil, atau jalur perakitan vertikal).

4. **Motif Identitas Konsisten (*Stamp & Ink-Wipe Motif*)**
   Agar video tidak terasa seperti kumpulan animasi template yang berbeda-beda:
   - Setiap kesimpulan, error, atau penegasan fakta masuk sebagai **stempel** (`data-cue-stamp`) dengan sedikit overshoot dan getaran mikro 10-frame.
   - Perpindahan antara permukaan kertas hangat (`paper`) dan pelat tinta (`ink`) selalu dijembatani **sapuan balok cetak** (`transitionIn: 'ink-wipe'`), bukan kedipan opacity.

5. **Struktur Narasi Melingkar (*Circular Loop Storytelling*)**
   Shorts modern ditonton berulang (*looping*). Rancang frame penutup (`s12`) agar menjawab langsung visual pembuka (`s01`): pembuka menampilkan 1 laptop jalan + server error, penutup menampilkan 3 mesin dengan gaya laptop yang sama dan semuanya berstatus `JALAN`.

---

## Bagian 3: Checklist Wajib Sebelum Render Final

Sebelum menetapkan `exports/final.mp4`:
1. **Validasi Skema & QA**: Jalankan `runQa` dan pastikan `0` temuan (nol em-dash `—`, setiap shot > 2,5 detik memiliki `cues` / `highlightSteps` / `camera`).
2. **Audit Kontras**: Pastikan semua pasangan warna teks vs latar memenuhi WCAG AA (`>= 4.5:1` untuk teks normal, `>= 3.0:1` untuk display >= 24px).
3. **Inspeksi Frame Cue & Margin**: Ekstrak frame tepat pada timestamp `cue.atMs` krusial (terutama pada shot bertipe `code`, `terminal`, dan diagram lebar) untuk memastikan **nol elemen terpotong** di tepi kiri/kanan layar `1080x1920`.
4. **Audio & Decode**: Pastikan `sfx-cues.wav` memiliki onset pada seluruh `cues`, `volumedetect` menunjukkan `max_volume <= -1.0 dB` (bebas clipping), dan `ffmpeg -v error -i final.mp4 -f null -` keluar tanpa error.
