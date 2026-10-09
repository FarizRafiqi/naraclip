# NaraClip Content Production Spec: "Kenapa Minum Air Putih Pas Kepedesan Malah Tambah Meledak?"

Dokumen ini merupakan spesifikasi lengkap perencanaan konten video vertikal (9:16) berdurasi **30–35 detik** berdasarkan analisis video referensi Vinconium (`https://www.youtube.com/shorts/gPomtusGehI`), panduan **NaraClip PRD v3 (Dataset-Audited)**, dan file **README.md**.

Dokumen ini mencakup:

1. **Analisis Video Referensi Vinconium & Format Multi-Layer Cutout**
2. **Evaluasi Kecukupan Aset untuk Video 30 Detik**
3. **Daftar & Hierarki Layer PNG Terpisah (Background, Karakter, Foreground, Limbs, Props)**
4. **Naskah Narasi Lengkap & Story Beat (30–35 Detik)**
5. **Choreography & Panduan Handoff untuk Opus 5.5 (HyperFrames Composition)**

---

## 1. Analisis Video Referensi Vinconium (`gPomtusGehI`)

- **URL Referensi:** [YouTube Shorts - Cara gak digigit nyamuk adalah...](https://www.youtube.com/shorts/gPomtusGehI)
- **Kreator:** Vinco (`@vinconium`)
- **Durasi Asli:** 37 detik | **Format:** 1080×1920 (9:16 Vertical)
- **Ciri Khas Visual & Komposisi:**
  1. **Fotorealistis + Doodled Eyes Overlay:** Karakter adalah foto orang asli di ruangan sinematik, dengan mata kartun doodle putih ber-pupil hitam (_googly doodle eyes_) yang ditempel di wajah untuk ekspresi komikal.
  2. **Multi-Layer Separation (Layer Terpisah):** Background ruangan, subjek orang, foreground meja/alat lab, dan stiker penjelas (seperti eritrosit _"DARAH O"_ dengan panah putih) berada di layer berbeda agar kamera bisa melakukan parallax drift/zoom dan objek bisa bergerak independen.
  3. **Stop-Motion Posing + Micro-Movements:** Karakter tidak dianimasikan 60fps halus, melainkan berganti pose secara ritmis/stop-motion pada setiap ketukan narasi, ditambah getaran/wobble tangan atau objek.

---

## 2. Evaluasi: Apakah Jumlah Gambar Ini Cukup untuk Video 30 Detik?

> **Jawaban: SANGAT CUKUP DAN MERUPAKAN JUMLAH IDEAL.**

### Rationale Berdasarkan NaraClip PRD v3:

1. **Bukan Slideshow Statis, Melainkan Sistem Puppet & Cutout Multi-Layer:**
   Jika video berdurasi 30 detik hanya menggunakan 5 gambar statis tanpa pemisahan layer, video akan terasa membosankan karena tiap gambar diam selama 6 detik. Namun dengan **11 layer terpisah (Background + Karakter Transparan + Foreground Meja + Anggota Tubuh Mandiri + Floating Props)**, video ini memiliki densitas micro-event setiap **0.8 – 1.5 detik**.
2. **Kombinasi 6 Pose Stop-Motion Karakter + 1 Anggota Tubuh Looping:**
   - 6 pose tubuh transparan berganti mengikuti 5 babak (_Act 1 s/d Act 5_).
   - Tangan mengipas (`layer_limb_hand_fanning.png`) dapat di-loop rotasinya via GSAP bolak-balik $\pm 12^\circ$ (3–4 fps) selama 4 detik di Scene 1–2, menciptakan ilusi animasi hidup tanpa perlu menggambar puluhan frame baru.
3. **Parallax Motion:**
   - Background (`layer_bg_kitchen_cinematic.png`) melakukan _slow push-in_ halus ($1.0 \to 1.08$).
   - Foreground meja & mangkuk mie (`layer_fg_table_noodles.png`) mengunci kedalaman dimensi di depan karakter.
   - Props mengambang (`prop_capsaicin` dan `prop_casein`) bergerak floating/hovering di layer atas.

---

## 3. Inventaris & Hierarki Layer PNG Terpisah

Seluruh aset disimpan dalam format **PNG transparan (RGBA)** di direktori:
📁 **`/home/farizrafiqi/Projects/naraclip/public/content/pedas-capsaicin/`**

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        HIERARKI LAYER (Z-INDEX)                        │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4 (Z: 40): Kinetic Captions (Teks Bold + Outline Hitam)          │
│ Layer 3 (Z: 30): Floating Explainer Props (Capsaicin / Casein + Panah) │
│ Layer 2 (Z: 20): Foreground Table & Steaming Noodles Bowl              │
│ Layer 1 (Z: 10): Character Cutout (Pose 1-6) + Movable Limbs (Tangan)  │
│ Layer 0 (Z: 00): Background Plate (Cinematic Moody Kitchen)            │
└────────────────────────────────────────────────────────────────────────┘
```

### Rincian File Layer:

| Kategori Layer                    | Nama File                            | Resolusi  | Karakteristik / Animasi                                                                                   |
| --------------------------------- | ------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- |
| **Layer 0: Background**           | `layer_bg_kitchen_cinematic.png`     | 768×1376  | Ruang dapur gelap sinematik + meja kayu bersih. Bergerak _slow push-in_ via GSAP.                         |
| **Layer 1: Karakter (Pose 1)**    | `layer_char_pose1_shock.png`         | 768×1376  | PNG Transparan Murni. Pria kaget melihat mie pedas. Masuk di `00:00 - 00:03`.                             |
| **Layer 1: Karakter (Pose 2)**    | `layer_char_pose2_fan_mouth.png`     | 768×1376  | PNG Transparan Murni. Lidah menjulur keluar, mulut terbakar. Masuk di `00:03 - 00:15`.                    |
| **Layer 1: Anggota Tubuh (Limb)** | `layer_limb_hand_fanning.png`        | 310×180   | PNG Transparan Murni. Tangan kanan mengipas dengan _feathered wrist_, di-loop rotasi $\pm 12^\circ$.      |
| **Layer 1: Karakter (Pose 3)**    | `layer_char_pose3_drink_water.png`   | 768×1376  | PNG Transparan Murni. Menenggak air putih terburu-buru. Masuk di `00:15 - 00:19`.                         |
| **Layer 1: Karakter (Pose 4)**    | `layer_char_pose4_water_regret.png`  | 768×1376  | PNG Transparan Murni. Kedua tangan meremas kepala syok/panik. Masuk di `00:19 - 00:24`.                   |
| **Layer 1: Karakter (Pose 5)**    | `layer_char_pose5_drink_milk.png`    | 768×1376  | PNG Transparan Murni. Menyeruput susu dengan sedotan. Masuk di `00:24 - 00:29`.                           |
| **Layer 1: Karakter (Pose 6)**    | `layer_char_pose6_deadpan_outro.png` | 768×1376  | PNG Transparan Murni. Pose deadpan santai + acungan jempol (bebas teks FINISH). Masuk di `00:29 - 00:34`. |
| **Layer 2: Floating Prop 1**      | `layer_prop_capsaicin_cutout.png`    | 1024×1024 | PNG Transparan Murni. Stiker cabai + minyak + panah putih melengkung `"CAPSAICIN"`.                       |
| **Layer 2: Floating Prop 2**      | `layer_prop_casein_cutout.png`       | 1024×1024 | PNG Transparan Murni. Stiker susu + molekul protein + panah melengkung `"KASEIN"`.                        |

---

## 4. Naskah Narasi Lengkap & Story Beat (32–34 Detik)

- **Topik:** _"Kenapa Minum Air Pas Kepedesan Malah Bikin Tambah Meledak?"_
- **Target Durasi:** 32–34 Detik | **Total Kata:** 81 Kata (~2.4 kata/detik).

| Scene & Beat                    | Timestamp            | Voice-Over Narasi                                                                                                                    | Komposisi Visual & Animasi Layer                                                                                                                                                                                          |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Act 1: Extreme Hook**         | `00:00 - 00:06` (6s) | _"Lagi kepedesan parah, terus refleks neguk segelas air dingin? Selamat, kamu baru aja bikin kesalahan fatal."_                      | **BG:** Slow push-in.<br>**Char:** `pose1` (00:00-00:03) berganti cepat (_cut_) ke `pose2` (00:03-00:06).<br>**Limb:** `layer_limb_hand_fanning` berayun cepat mengipas mulut.<br>**Teks:** Pop-in **"KESALAHAN FATAL!"** |
| **Act 2: Mechanical Breakdown** | `00:06 - 00:15` (9s) | _"Rasa kebakar dari cabai itu asalnya dari senyawa Capsaicin. Masalahnya, capsaicin ini zat minyak, sedangkan air itu... ya air."_   | **Char:** Tetap di `pose2` dengan getaran mikro (_shake_).<br>**Prop:** `layer_prop_capsaicin_cutout` muncul di kanan atas dengan animasi `scale: 0 -> 1` + pantulan _back.out_ dan _hover float_.                        |
| **Act 3: Data & Escalation**    | `00:15 - 00:23` (8s) | _"Air sama sekali gak bisa larutin minyak. Pas kamu minum, airnya cuma ngebilas dan nyebarin minyak pedas ke seluruh rongga mulut!"_ | **Char:** `pose3` (minum air, 00:15-00:19) berganti dramatis ke `pose4` (meremas kepala syok, 00:19-00:23) dengan punch-zoom cepat.<br>**SFX:** Gulping $\to$ Bass drop thud.                                             |
| **Act 4: The Twist / Penawar**  | `00:23 - 00:29` (6s) | _"Penawar aslinya itu susu. Susu punya protein Kasein yang kerjanya persis deterjen pencuci minyak."_                                | **Char:** Berganti ke `pose5` (menyeruput susu dengan sedotan, mata rileks).<br>**Prop:** `layer_prop_casein_cutout` muncul di atas dengan cahaya putih lembut.                                                           |
| **Act 5: Deadpan Outro**        | `00:29 - 00:34` (5s) | _"Jadi jangan cari galon... siapin susu dingin."_                                                                                    | **Char:** Berganti ke `pose6` (deadpan poker-face santai + jempol acung).<br>**Teks:** **"PAHAM KAN?"**                                                                                                                   |

---

## 5. Panduan Eksekusi untuk Opus 5.5 (HyperFrames Composition)

Untuk merender video final di workspace HyperFrames (`renderer/`):

1. **Canvas Resolution:** `1080 x 1920` px (Portrait 9:16, 30 FPS).
2. **GSAP Timeline Structure:**
   ```javascript
   const tl = gsap.timeline({ paused: true })

   // 1. Background Camera Drift
   tl.to('#bg-kitchen', { scale: 1.08, duration: 34, ease: 'none' }, 0)

   // 2. Character Stop-Motion Pose Switching
   tl.set('#char-pose1', { display: 'block' }, 0)
   tl.set('#char-pose1', { display: 'none' }, 3.0)
   tl.set('#char-pose2', { display: 'block' }, 3.0)

   // 3. Fanning Hand Motion Loop (Act 1-2)
   gsap.to('#limb-fanning', {
     rotation: 14,
     transformOrigin: 'bottom left',
     duration: 0.15,
     yoyo: true,
     repeat: 26,
     ease: 'power1.inOut',
   })

   // 4. Floating Props Pop-in
   tl.from('#prop-capsaicin', { scale: 0, rotation: -20, duration: 0.5, ease: 'back.out(2)' }, 6.5)
   tl.from('#prop-casein', { scale: 0, rotation: 15, duration: 0.5, ease: 'back.out(2)' }, 23.2)

   // 5. Climax Punch-Zoom on Pose 4 (Regret)
   tl.fromTo('#root', { scale: 1 }, { scale: 1.12, duration: 0.3, ease: 'power2.out' }, 19.2)
   ```
3. **Audio Tracks:**
   - Voice-over audio track utama (durasi 34.0s).
   - SFX track: Whoosh (`00:00`), Cartoon Sizzle (`00:03`), Sticker Pop (`00:06.5`), Water Gulp (`00:15.5`), Bass Drop Thud (`00:19.2`), Ding Chime (`00:23.2`), Camera Shutter Click (`00:29.5`).
