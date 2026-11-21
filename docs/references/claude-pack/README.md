# Claude Motion & SFX Reference Pack

Paket referensi reusable untuk produksi motion graphic dan audio FX berbasis kode di NaraClip.

## Isi Direktori

- [claude-motion-pack.html](file:///home/farizrafiqi/Projects/naraclip/docs/references/claude-pack/claude-motion-pack.html): Katalog interaktif berisi `38` preset animasi CSS/JS, token easing, dan prompt induk.
- [sfx-library.html](file:///home/farizrafiqi/Projects/naraclip/docs/references/claude-pack/sfx-library.html): Katalog interaktif `56` preset SFX berbasis Web Audio API murni (`tone()` & `noise()`) + contoh cue sheet.
- Koleksi WAV siap pakai (48 kHz mono PCM16) hasil export synth offline berada di [manifest.json](file:///home/farizrafiqi/Projects/naraclip/packages/pipeline/assets/sfx/claude/manifest.json).

## Catatan Palet Warna & Kebebasan Kreatif

> Palet pada prompt induk (`#FAF6EF`, `#2B2420`, `#C4572F`, `#E8825A`, `#D9C9B4`) adalah referensi gaya tenang/hangat, **bukan keharusan**. Tiap video tetap bebas bereksperimen memilih palet, komposisi, dan elemen visual sendiri yang sesuai topik dan identitas channel.

Yang diambil sebagai inti reusable dari pack ini adalah **disiplin motion curve, timing, struktur, dan tata letak SFX**:
- Kurva keluar-masuk halus (`cubic-bezier(.22, 1, .36, 1)` saat masuk `0.6-0.8s`, lebih cepat `0.3-0.4s` saat keluar).
- Gerak masuk terukur (`24-40px` slide + fade, scale subtle `0.94 -> 1.0`, overshoot pop maksimal `<= 8%`).
- Stagger `80-120ms`, line draw, counter up, masked text reveal, tanpa glitch/spin/kamera bergetar agresif.
- SFX tipis & tepat timing: soft whoosh pada transisi, pop ringan saat elemen muncul, tick ringan pada counter, `softHit + bell` pada penutup.

## Master Motion Prompt (Template Referensi)

```text
Create a motion graphic video in a calm, warm, minimalist "Claude-style".

PALETTE: background cream #FAF6EF (or dark #1D1916), text ink #2B2420, accent terracotta #C4572F, secondary coral #E8825A, lines sand #D9C9B4. No neon, no purple-blue gradients, no glossy 3D.
TYPE: serif headlines (Georgia-like), clean sans-serif body. Max 2 fonts. Generous whitespace, one idea per scene.
MOTION: soft and smooth. Enter = fade + slide 24-40px, 0.6-0.8s, ease-out expo cubic-bezier(.22,1,.36,1). Exit = faster (0.3-0.4s), ease-in. Stagger groups 80-120ms. Scale only 0.94 to 1. Small pop-in allowed (overshoot max 8%). Lines draw themselves. Numbers count up. Text reveals from behind a mask.
TRANSITIONS: crossfade, thin horizontal wipe, shared-element morph. No glitch, spin, shake or flashy zoom.
RHYTHM: hold each scene 2-4s so text is readable. 24-30 fps. No camera shake.
SFX: very quiet. Soft whoosh on transitions, tiny pop on element entrance, light tick on counters, one soft hit + bell on the final logo. No loud music.
STRUCTURE: problem, solution, result, call to action.
```

## Daftar 38 Preset Motion (`claude-motion-pack.html`)

- **Masuk (13):** `fade-up`, `fade-down`, `fade-left`, `fade-right`, `fade-in`, `scale-in`, `pop-in`, `blur-in`, `flip-in`, `drop-in`, `zoom-soft`, `stagger-up`, `mask-reveal`
- **Keluar (4):** `fade-out-down`, `scale-out`, `slide-out-left`, `blur-out`
- **Penekanan (9):** `pulse`, `float`, `wiggle`, `shake-soft`, `breathe`, `spin-slow`, `highlight-sweep`, `underline-draw`, `shimmer-text`
- **Data (5):** `typewriter`, `line-draw`, `ring-progress`, `bar-grow`, `counter-up`
- **Transisi (4):** `wipe-right`, `circle-reveal`, `push-left`, `crossfade`
- **Latar (3):** `gradient-drift`, `dot-grid-pan`, `orbit`

## Daftar 56 Preset SFX (`sfx-library.html` & `packages/pipeline/assets/sfx/claude/`)

Semua preset terhubung langsung di `SfxSchema` (`packages/contracts/src/pipeline.ts`) dan dirender offline 48 kHz lewat `packages/pipeline/src/audio.ts`:

- **Transisi (8):** `whoosh`, `whooshUp`, `whooshDown`, `swipe`, `slideIn`, `riser`, `reverseSwell`, `sweepHigh`
- **UI (10):** `pop`, `click`, `tick`, `tap`, `toggleOn`, `toggleOff`, `bubble`, `hover`, `select`, `swish`
- **Impact (7):** `hit`, `softHit`, `boom`, `slam`, `punch`, `stamp`, `cymbal`
- **Notifikasi (10):** `ding`, `bell`, `chime`, `success`, `error`, `warning`, `notify`, `coin`, `levelUp`, `okay`
- **Teks & Data (6):** `typewriter`, `keyClick`, `counter`, `blip`, `dataStream`, `barGrow`
- **Sci-fi & Glitch (9):** `glitch`, `laser`, `zap`, `powerUp`, `powerDown`, `scan`, `beep`, `sonar`, `alarm`
- **Lain-lain (6):** `shutter`, `sparkle`, `drip`, `heartbeat`, `shimmer`, `wind`
