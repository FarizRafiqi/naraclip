# NaraClip — Product Requirements Document

**Version:** 3.0  
**Status:** MVP / Technical Product Specification / Dataset-Audited  
**Primary Market:** Indonesia  
**Expansion:** Global  
**Primary Output:** Vertical short-form informational animation  
**Video Engine:** HyperFrames (HTML/CSS/GSAP → MP4)  
**Target Duration:** 43–60 seconds  
**Primary Format:** 1080×1920, 9:16, 30 fps

---

## 1. Executive Summary

NaraClip adalah platform AI untuk mengubah satu ide menjadi video short informatif yang terasa dirancang, bukan sekadar slideshow AI.

Pengguna cukup memberikan satu prompt seperti:

> "Kenapa manusia tidak bisa menggelitik dirinya sendiri?"

NaraClip menangani:

1. topic planning,
2. research/fact planning,
3. script writing,
4. story beat segmentation,
5. visual archetype selection,
6. asset generation,
7. TTS,
8. word/caption timing,
9. motion planning,
10. sound-effect planning,
11. HyperFrames composition compilation,
12. automated visual QA,
13. preview,
14. partial regeneration,
15. final MP4 rendering.

Core product promise:

> **Satu ide → satu animated short yang layak ditonton.**

NaraClip bukan text-to-video generator penuh. Pendekatannya adalah:

> **AI-generated assets + deterministic 2D motion + strong storytelling + sound design.**

Pendekatan ini dipilih karena lebih murah, lebih editable, lebih mudah distandardisasi, dan lebih mudah di-scale dibanding generative video end-to-end.

---

# 2. Product Vision

NaraClip ingin memberikan pengalaman seperti memiliki:

- researcher,
- scriptwriter,
- illustrator,
- motion designer,
- subtitle editor,
- sound designer,
- dan video editor

dalam satu workflow.

Tetapi produk tidak boleh menghasilkan video yang terasa sebagai:

> voice-over + beberapa gambar AI yang diganti tiap beberapa detik.

Setiap scene harus memiliki choreography visual.

Visual boleh sederhana. Namun pacing, framing, motion, text emphasis, transitions, dan SFX harus membuat video terasa hidup.

---

# 3. Creative Inspiration vs Product Identity

Dataset internal yang dianalisis dari video Vinconium digunakan sebagai **reference dataset untuk memahami pola produksi** short-form informational animation.

NaraClip **tidak boleh menyalin identitas visual, karakter, wording, atau signature style kreator tertentu secara literal**.

Yang dipelajari adalah prinsip yang dapat digeneralisasi:

- counter-intuitive hooks,
- explanatory visual storytelling,
- cutout asset animation,
- diagrammatic animation,
- comedic timing,
- deadpan payoff,
- scene-level sound design,
- dense micro-events inside a small number of large story beats.

NaraClip harus mengembangkan **visual grammar dan linguistic presets miliknya sendiri**.

---

# 4. Dataset Findings

## 4.1 Dataset Integrity Audit

Dataset terbaru benar-benar memiliki:

- `total_videos_recorded = 50`,
- `videos.length = 50`,
- 50 record dengan ID/title/category/archetype/scene payload.

Namun **jumlah record tidak sama dengan kualitas evidence**.

Audit isi menunjukkan dataset memiliki dua confidence tier.

### Tier A — High-detail examples

**3 record** memiliki:

- script spesifik dan panjang,
- scene-specific captions,
- assets yang spesifik terhadap topik,
- animation actions yang berbeda antar scene,
- real-case/data exposition yang konkret,
- SFX yang disesuaikan dengan visual event.

Tier A adalah sumber terbaik untuk memahami bagaimana video yang kaya terasa di level scene.

### Tier B — Templated / low-detail records

**47 record** memakai scaffold yang sangat seragam.

Di antaranya:

- **47/50** memakai hook label `Question / Contrarian Hook`,
- **47/50** memakai struktur beat yang sama:
  `Extreme Hook → Mechanical Breakdown → Data & Case Studies → Twist & Deadpan Outro`,
- **47/50** memakai timing scene yang sama:
  `00:00–00:08 → 00:08–00:22 → 00:22–00:36 → 00:36–00:46`,
- **47/50** memakai paragraf explanatory generik yang sama,
- **47/50** memakai caption generik:
  `data riset dan parameter statistik terverifikasi`,
- **47/50** memakai outro generik:
  `fakta lanjutan yang mengejutkan, tinggal teknologinya aja nih`,
- **47/50** memakai sequence animation-action yang sama.

Implikasi:

> Dataset ini valid sebagai corpus 50 record untuk taxonomy/topical coverage, tetapi tidak boleh dianggap sebagai 50 contoh independen dengan fidelity yang sama.

NaraClip harus memakai **confidence-weighted learning**, bukan menghitung semua record sebagai evidence setara.

---

## 4.2 Metadata Consistency Audit

Dataset metadata menyatakan rata-rata word count sekitar:

**105.18 kata/video**

Tetapi ketika `full_script` dihitung ulang dari teks aktual, rata-ratanya hanya:

**41.90 token-kata/video**

Perbedaan ini terjadi karena mayoritas Tier B memiliki `word_count = 105`, tetapi `full_script` aktualnya jauh lebih pendek.

Tier A:

- declared word count mean: **108.0**
- recomputed script length mean: **119.7**

Tier B:

- declared word count mean: **105.0**
- recomputed script length mean: **36.9**

Karena itu, analytics NaraClip **tidak boleh mempercayai metadata turunan tanpa recomputation**.

Sebelum sebuah dataset digunakan untuk tuning/prompt rules, lakukan:

```text
schema validation
→ count actual records
→ recompute text length
→ validate scene timestamps
→ detect duplicated scaffolds
→ detect placeholder captions
→ compute completeness score
→ assign confidence tier
```

---

## 4.3 Observed Aggregate Metrics

Across all 50 records:

| Metric                             |  Result |
| ---------------------------------- | ------: |
| Records                            |      50 |
| Mean declared duration             | 46.08 s |
| Median duration                    |  46.0 s |
| Duration range                     | 45–50 s |
| Mean declared word count           |  105.18 |
| Mean recomputed full-script length |   41.90 |
| Mean macro scenes                  |    4.02 |
| Scene-count mode                   |       4 |
| Mean SFX cues/video                |    8.22 |
| Mean declared scene elements/video |    8.46 |
| High-detail records                |       3 |
| Templated records                  |      47 |

Important:

> Aggregate metrics that are dominated by the 47 templated records must be treated as dataset-construction statistics, not necessarily creator-behavior statistics.

---

## 4.4 Visual Archetype Distribution

The 50 records cover all six archetypes:

| Archetype                | Count | Share |
| ------------------------ | ----: | ----: |
| CHARACTER_HUMAN_ANIMAL   |    18 |   36% |
| GEOGRAPHY_GIS_SATELLITE  |     9 |   18% |
| CYBER_UI_FLOWCHART       |     7 |   14% |
| CHEMICAL_MATERIAL_FOOD   |     6 |   12% |
| ASTRONOMY_MICROSCOPIC    |     5 |   10% |
| MACHINE_TEARDOWN_PHYSICS |     5 |   10% |

The dataset spans **13 topic categories**.

This is useful evidence that a NaraClip visual router should be **semantic**, not one-style-fits-all.

---

## 4.5 Scene Structure Finding

The raw distribution is:

- **49 videos:** 4 macro scenes
- **1 video:** 5 macro scenes

However, because 47 records share the same 4-scene scaffold, NaraClip should **not hardcode exactly 4 scenes**.

The product rule remains:

> Use the minimum number of macro scenes needed to preserve narrative clarity, while creating density through micro-events.

Recommended MVP planner range:

**4–7 macro scenes for a 43–60 second short.**

The stronger insight is not "four scenes".

The stronger insight is:

> **macro scenes should be semantically meaningful, while engagement comes from visual evolution inside them.**

---

## 4.6 High-Detail Example Signal

The three Tier A examples average:

- duration: **47.33 s**
- macro scenes: **4.33**
- SFX cues: **11.67**
- declared elements: **15.67**

Compared with Tier B:

- duration: **46.00 s**
- macro scenes: **4.00**
- SFX cues: **8.00**
- declared elements: **8.00**

This suggests a useful product heuristic:

> richness is better modeled as **event density and asset interaction**, not scene count alone.

---

## 4.7 Dataset Confidence Policy

Every training/reference item used by NaraClip should receive:

```ts
type DatasetConfidence = {
  structuralCompleteness: number
  scriptSpecificity: number
  visualSpecificity: number
  motionSpecificity: number
  metadataConsistency: number
  duplicateSimilarity: number
  confidenceTier: 'A' | 'B' | 'C'
}
```

Tier A:

- suitable for deriving detailed production grammar.

Tier B:

- suitable for taxonomy coverage and weak priors.

Tier C:

- incomplete, contradictory, or placeholder-heavy;
- not used for automatic rule extraction.

---

## 4.8 What NaraClip Should Learn from This Dataset

Use it for:

- visual archetype taxonomy,
- macro-beat vocabulary,
- asset interaction ideas,
- motion primitive ideas,
- SFX-event relationships,
- short-form pacing hypotheses.

Do **not** blindly learn:

- exact wording,
- mandatory pronouns,
- one fixed scene count,
- generic filler scripts,
- repeated captions,
- repeated motion sequences,
- claimed word counts without recomputation.

This distinction prevents NaraClip from reproducing dataset artifacts as product behavior.

---

# 5. Target User

## Primary Persona — Indonesian Short-Form Creator

Karakteristik:

- membuat TikTok, Reels, atau YouTube Shorts,
- ingin produksi konten secara konsisten,
- punya ide tetapi tidak ingin mengedit manual,
- membuat faceless content,
- menggunakan Canva/CapCut saat ini,
- menginginkan output yang lebih hidup daripada template slideshow.

Initial content categories:

- fakta unik,
- science,
- biology,
- technology,
- psychology,
- history,
- cybersecurity,
- geography,
- finance education,
- productivity,
- informational storytelling.

---

# 6. Product Positioning

NaraClip bukan:

> "AI video generator"

Positioning utama:

> **AI short-form storytelling engine.**

Differentiator:

1. story-first generation,
2. asset-level animation,
3. visual archetype selection,
4. dense micro-motion,
5. deterministic rendering,
6. editable scenes,
7. partial regeneration,
8. low cost compared with full generative video.

---

# 7. Core User Flow

```text
Prompt
  ↓
Story Plan
  ↓
Script
  ↓
Macro Story Beats
  ↓
Visual Archetype Routing
  ↓
Scene Spec
  ↓
Asset Generation
  ↓
TTS + Timing
  ↓
Micro Motion Events
  ↓
Sound Design
  ↓
HyperFrames Compilation
  ↓
QA
  ↓
Preview
  ↓
Quick Edit
  ↓
Final Render
```

User-facing flow:

**Create → Generate → Preview → Edit → Export**

---

# 8. Story Engine

## 8.1 Default Indonesian Short Structure

Dataset/rulebook menunjukkan struktur 5 babak yang cocok sebagai salah satu narrative preset.

### Act 1 — Counter-Intuitive Hook

Target: 0–6 detik.

Tujuan:

- mematahkan asumsi,
- mengajukan skenario ekstrem,
- menimbulkan curiosity gap.

Contoh bentuk:

- "Gimana kalau...?"
- "Sadar gak...?"
- "Kenapa sebenarnya...?"
- "Ngaku, siapa yang...?"

NaraClip harus menghasilkan wording original.

---

### Act 2 — Mechanism / Breakdown

Target: 6–20 detik.

Menjelaskan:

- mekanisme,
- penyebab,
- proses tersembunyi,
- hubungan sebab-akibat.

Conversational connectors dapat menggunakan natural Indonesian speech seperti:

- "Tapi logikanya..."
- "Soalnya..."
- "Nah bedanya..."
- "Masalahnya..."

Tetapi wording tidak boleh menjadi copy pattern literal di setiap video.

---

### Act 3 — Data Escalation / Real Case

Target: 20–35 detik.

Masukkan salah satu:

- angka konkret,
- perbandingan,
- eksperimen,
- studi kasus,
- historical case,
- unexpected scale.

Tujuan:

menaikkan stakes.

---

### Act 4 — Twist / Paradox

Target: 35–43 detik.

Berikan:

- anomaly,
- ironic consequence,
- surprising exception,
- reversal.

---

### Act 5 — Payoff / Deadpan Outro

Target: 43–50+ detik.

Ending singkat.

Boleh:

- satirical,
- deadpan,
- understated,
- curious,
- ironic.

Tidak wajib memakai frasa tertentu.

---

# 9. Script Metrics

Untuk preset **Informative Punchy ID**:

Target awal:

- duration: 43–55 s,
- word count: 95–125 kata,
- target speech density: sekitar 2.2–2.6 kata/detik.

Ini merupakan starting heuristic, bukan hard rule.

NaraClip harus mengukur durasi dari audio TTS aktual.

Jika audio terlalu panjang:

1. script compressor,
2. regenerate TTS,
3. re-align timeline.

Jika audio terlalu pendek:

1. allow breathing holds,
2. extend visual beat,
3. jangan otomatis menambah filler words.

---

# 10. Linguistic Style System

NaraClip harus mendukung **style presets**, bukan satu gaya bahasa permanen.

Contoh:

### Informative Punchy

Casual, cepat, conversational.

### Clean Educational

Lebih tenang dan jelas.

### Playful Weird Facts

Sedikit absurd/comedic.

### Dramatic Curiosity

Lebih cinematic.

Dataset menunjukkan penggunaan:

- colloquial particles,
- short connectors,
- conversational phrasing,
- direct audience address.

Tetapi rules seperti "`kalian` wajib 100%" tidak boleh menjadi hardcoded global rule.

Sebaliknya:

```ts
type AudienceAddress = 'kalian' | 'kamu' | 'neutral' | 'none'
```

Style preset menentukan pilihan tersebut.

---

# 11. Macro Scene Architecture

Berdasarkan dataset audit, raw corpus sangat berat ke 4-scene scaffold, tetapi 47/50 record menggunakan template yang sama. Karena itu default planner **tidak boleh menganggap 4 scene sebagai ground truth**.

MVP planner menargetkan:

**4–7 macro scenes untuk video 43–60 detik.**

Scene count dipilih berdasarkan semantic story beats, bukan meniru distribusi dataset mentah.

Contoh:

```text
Scene 1 — Hook
Scene 2 — Mechanism
Scene 3 — Data / Escalation
Scene 4 — Twist
Scene 5 — Payoff
```

Satu scene dapat berlangsung 6–15 detik selama scene tersebut memiliki cukup visual evolution.

---

# 12. Micro Event Timeline

Inilah salah satu perubahan arsitektur terpenting.

Setiap macro scene memiliki event timeline.

```ts
type SceneEvent = {
  id: string
  at: number
  duration?: number

  type:
    | 'asset_enter'
    | 'asset_motion'
    | 'camera_motion'
    | 'text_emphasis'
    | 'diagram_draw'
    | 'counter'
    | 'object_reveal'
    | 'reaction'
    | 'sfx'
    | 'transition_trigger'

  target?: string
  primitive?: string
  params?: Record<string, unknown>
}
```

Contoh:

```json
[
  {
    "at": 0.2,
    "type": "asset_enter",
    "target": "octopus",
    "primitive": "pop"
  },
  {
    "at": 1.1,
    "type": "object_reveal",
    "target": "heart-1",
    "primitive": "bounce"
  },
  {
    "at": 1.25,
    "type": "sfx",
    "primitive": "soft-pop"
  },
  {
    "at": 2.3,
    "type": "camera_motion",
    "primitive": "punch-zoom"
  }
]
```

---

# 13. Visual Archetype Router

Dataset/rulebook mengidentifikasi enam archetype berguna.

NaraClip mengadaptasinya menjadi router generik.

## 13.1 CHARACTER / HUMAN / ANIMAL

Best for:

- biology,
- social scenario,
- animals,
- human behavior,
- historical characters.

Visual grammar:

- cutout subject,
- face/eye expression,
- wobble movement,
- physical interaction,
- object props.

---

## 13.2 MACHINE / PHYSICS / TEARDOWN

Best for:

- machines,
- engineering,
- electricity,
- physics,
- device explanations.

Visual grammar:

- exploded view,
- cutaway,
- arrows,
- force lines,
- energy flow,
- component separation.

---

## 13.3 CHEMICAL / MATERIAL / FOOD

Best for:

- chemistry,
- digestion,
- materials,
- food science,
- medicine.

Visual grammar:

- cross section,
- molecules,
- scales,
- meters,
- labels,
- reaction arrows.

---

## 13.4 GEOGRAPHY / GIS / SATELLITE

Best for:

- places,
- maps,
- logistics,
- geology,
- global comparisons.

Visual grammar:

- map zoom,
- location marker,
- radar ring,
- route animation,
- depth gauge,
- coordinate HUD.

---

## 13.5 CYBER / UI / FLOWCHART

Best for:

- cybersecurity,
- internet,
- software,
- digital privacy,
- data flows.

Visual grammar:

- browser/UI mockup,
- routing lines,
- server nodes,
- data packets,
- evidence cards,
- shields,
- warning states.

---

## 13.6 ASTRONOMY / MICROSCOPIC

Best for:

- space,
- cells,
- microscopic systems,
- particles,
- scales beyond normal perception.

Visual grammar:

- particle systems,
- orbit,
- cell division,
- gravity deformation,
- zoom transitions,
- scale comparison.

---

# 14. Archetype Composition

Video tidak harus memakai satu archetype saja.

Example:

```text
Hook           → CHARACTER
Mechanism      → MACHINE
Data           → INFOGRAPHIC
Twist          → CHARACTER
Outro          → TYPOGRAPHIC
```

Router menentukan archetype **per scene**, sedangkan video-level design system menjaga visual consistency.

---

# 15. Visual Identity

Sebelum composition dibuat, NaraClip menghasilkan internal `DESIGN.md`.

Minimal fields:

```text
Mood
Canvas
Palette
Typography
Illustration treatment
Cutout treatment
Motion personality
Caption personality
Forbidden visual patterns
```

Example:

```text
Mood:
Playful science explainer

Canvas:
Warm light

Palette:
Cream / navy / coral

Typography:
Bold geometric sans

Illustration:
2D editorial cutout

Motion:
Fast, bouncy, controlled

Avoid:
Photorealistic inconsistency
Corporate dashboard aesthetic
Heavy full-screen gradients
```

Setiap composition harus mengikuti video-level visual identity.

---

# 16. Asset Strategy

Jenis asset:

```ts
type AssetType =
  | 'subject'
  | 'background'
  | 'prop'
  | 'diagram'
  | 'icon'
  | 'texture'
  | 'map'
  | 'ui'
  | 'shape'
  | 'text'
```

NaraClip tidak boleh menganggap:

`1 scene = 1 generated image`.

Satu scene dapat memiliki:

- background,
- character,
- eyes,
- label,
- diagram,
- prop,
- particle layer,
- annotation.

Asset dapat digunakan kembali antar scene.

---

# 17. Background Removal

Background removal dilakukan secara conditional.

```ts
removeBackground: boolean
```

Use when:

- object perlu bergerak independen,
- character perlu overlap dengan layer lain,
- prop perlu masuk/keluar frame.

Do not use when:

- full-background illustration,
- texture,
- environment frame,
- map plate.

Ini menekan biaya.

---

# 18. Motion Grammar Library

AI tidak menulis arbitrary GSAP sebagai primary control layer.

AI memilih primitive dari Motion Grammar.

## Entrance

- pop
- slide-left
- slide-right
- rise
- drop
- scale-in
- spin-in
- elastic-enter

## Emphasis

- bounce
- shake
- pulse
- wiggle
- punch-scale
- tilt
- flash
- tiny-hop

## Camera

- push-in
- punch-zoom
- pull-out
- pan
- micro-drift

## Diagram

- draw-path
- trace-route
- explode-parts
- label-attach
- arrow-reveal

## Relationship

- object-swap
- comparison-split
- follow-target
- point-at
- nudge
- collide

## Comedy

- awkward-zoom
- delayed-reaction
- sudden-scale
- tiny-bounce
- freeze-beat
- visual-understatement

---

# 19. Character Motion Primitives

Dataset menunjukkan beberapa primitive karakter yang engaging.

## Wayang Wobble Walk

Konsep:

- translation X,
- small shoulder rotation,
- small Y hop,
- finite repeat count,
- deterministic timing.

NaraClip harus membuat implementasi yang compatible dengan HyperFrames.

Pseudo-contract:

```ts
wayangWalk({
  target,
  distanceX,
  duration,
  wobbleDeg,
  hopPx,
  seed,
})
```

---

## Eye Rig

Optional for character-style presets.

Components:

- sclera,
- pupil,
- blink,
- target-aware pupil saccade.

Eye animation tidak wajib dipakai setiap karakter.

---

# 20. Important HyperFrames Compatibility Rule

Reference rulebook memiliki contoh GSAP:

```js
repeat: -1
```

HyperFrames production rules melarang infinite repeat.

Karena itu NaraClip **harus mengubah setiap infinite loop menjadi finite repeat** berdasarkan scene duration.

Example:

```js
const repeatCount = Math.ceil(sceneDuration / cycleDuration) - 1
```

Tidak boleh ada:

```js
repeat: -1
```

dalam final composition.

---

# 21. HyperFrames Architecture

HyperFrames menggunakan HTML sebagai source of truth.

Architecture:

```text
NaraClip Project Spec
        ↓
Composition Compiler
        ↓
HTML + CSS + GSAP
        ↓
HyperFrames
        ↓
Headless Chrome Capture
        ↓
FFmpeg
        ↓
MP4
```

HyperFrames renderer bukan tempat AI mengambil creative decision.

Creative decisions harus sudah selesai di project spec.

---

# 22. Hybrid Project Architecture

Dataset/rulebook mengusulkan tiga lapis yang sangat cocok untuk NaraClip.

## 22.1 Rulebook / Skills

Internal knowledge base:

```text
skills/
  storytelling.md
  visual-archetypes.md
  motion-grammar.md
  sound-design.md
  captions.md
```

Ini membantu AI planner.

---

## 22.2 project_spec.json

Project spec adalah state utama satu video.

Berisi:

- metadata,
- script,
- story beats,
- audio timing,
- assets,
- scenes,
- micro events,
- captions,
- SFX,
- transitions,
- visual identity.

---

## 22.3 HyperFrames Output

Compiler menghasilkan:

```text
index.html
compositions/*.html
assets/*
DESIGN.md
```

HyperFrames merender output secara deterministic.

---

# 23. NaraClip Project Spec

```ts
type NaraClipProject = {
  id: string
  version: string
  seed: string

  metadata: {
    title: string
    language: string
    durationTarget: number
    format: '9:16'
    fps: 30
  }

  narrative: {
    premise: string
    hook: string
    acts: NarrativeAct[]
    fullScript: string
  }

  visualIdentity: VisualIdentity

  assets: AssetSpec[]

  audio: {
    narrationUrl: string
    wordTimings: WordTiming[]
    music?: AudioCue
  }

  scenes: SceneSpec[]
}
```

---

# 24. Scene Spec

```ts
type SceneSpec = {
  id: string

  start: number
  duration: number

  storyBeat: 'hook' | 'mechanism' | 'data' | 'case' | 'twist' | 'payoff'

  archetype: VisualArchetype

  narration: string

  captionGroups: CaptionGroup[]

  background: AssetRef

  elements: SceneElement[]

  events: SceneEvent[]

  sfx: SfxCue[]

  transition: TransitionSpec
}
```

---

# 25. Compiler Principle

Critical architecture:

```text
LLM
 ↓
Validated NaraClip Project Spec
 ↓
Deterministic Compiler
 ↓
HyperFrames HTML/GSAP
```

Not:

```text
LLM
 ↓
arbitrary HTML and JS
 ↓
hope it renders
```

AI memilih:

- story,
- layout intent,
- archetype,
- assets,
- motion primitive,
- timing intent.

Compiler memilih:

- exact DOM structure,
- safe GSAP implementation,
- timing registration,
- data attributes,
- finite repeats,
- valid HyperFrames structure.

---

# 26. Scene Density Requirement

Setiap scene harus memiliki visual evolution.

Minimum guideline:

For scene duration > 5 seconds:

- minimum 2 meaningful visual events,
- preferably 3–6 micro events.

For hook scene:

- visual event within first 0.3–0.7 seconds.

For data scene:

- number/stat must have visual emphasis.

For twist:

- use contrast, framing change, or audio punctuation.

Static visual hold > 3 seconds harus disengaja.

---

# 27. Sound Design System

Dataset-wide mean adalah **8.22 SFX cues/video**, tetapi angka ini didominasi scaffold Tier B. Tiga high-detail examples rata-rata **11.67 SFX cues/video**.

Ini bukan hard requirement. Insight yang lebih aman adalah bahwa **SFX harus mengikuti meaningful visual events**, bukan mengejar quota.

NaraClip memiliki semantic SFX catalog:

```text
whoosh
pop
soft-pop
impact
click
sparkle
riser
glitch
thud
counter
switch
zip
bell
boing
paper
static
mechanical
UI
```

AI memilih semantic cue.

Compiler/audio layer memilih actual file.

---

# 28. SFX Rules

SFX harus mengikuti event.

Example:

```json
{
  "event": "counter reaches 5000",
  "sfx": "counter-hit",
  "volume": 0.5
}
```

Rules:

- SFX tidak boleh menutupi narration,
- high-frequency SFX jangan terlalu rapat,
- comedic SFX digunakan secara selektif,
- SFX harus sinkron dengan visual event,
- repeated cue dapat divariasikan pitch/variant jika library mendukung.

---

# 29. Caption System

Caption timing berasal dari narration audio.

Styles:

### Dynamic Bold

2–5 kata per group.

### Keyword Punch

Satu kata penting dibesarkan.

### Clean Informational

Lebih sedikit animation.

Caption engine harus mendukung:

- grouped word timings,
- keyword emphasis,
- max-width,
- overflow safety,
- safe bottom margin.

---

# 30. TTS

MVP abstraction:

```ts
interface TTSProvider {
  synthesize(input): Promise<{
    audioUrl: string
    wordTimings: WordTiming[]
    duration: number
  }>
}
```

Initial candidates:

- Edge TTS,
- Azure fallback,
- HyperFrames/Kokoro evaluation.

Provider tidak boleh hardcoded ke rendering engine.

---

# 31. Image Generation

Image generation layer harus provider-independent.

```ts
interface ImageGenerator {
  generate(input: ImagePrompt): Promise<Asset>
}
```

Criteria:

- production API,
- commercial usage clarity,
- low cost,
- fast latency,
- stable output.

Image provider dapat diganti tanpa mengubah scene spec.

---

# 32. Research / Fact Reliability

Karena NaraClip menghasilkan informational content, hallucination adalah product risk.

Before script finalization:

1. fact planner membuat list claim,
2. claim classifier menentukan mana yang perlu verification,
3. factual-confidence score disimpan,
4. high-risk claim dapat memerlukan citation/source metadata.

MVP minimum:

```ts
type FactClaim = {
  text: string
  confidence: number
  verificationRequired: boolean
}
```

NaraClip tidak boleh mengubah speculative claim menjadi fakta pasti hanya karena terdengar menarik.

---

# 33. Layout Planning

HyperFrames composition dibuat dengan prinsip:

**Layout first, animation second.**

For every scene:

1. tentukan hero frame,
2. place assets in final visible position,
3. validate layout,
4. add entrance/motion,
5. validate again.

Ini mencegah:

- caption clipping,
- subject overlap,
- assets keluar canvas,
- dynamic text overflow.

---

# 34. HyperFrames Scene Rules

Generated composition harus:

- deterministic,
- register timeline,
- use paused GSAP timelines,
- avoid `Math.random()`,
- avoid `Date.now()`,
- avoid async timeline creation,
- avoid infinite repeat,
- keep media timing under framework control.

Pseudo randomness harus seeded menggunakan:

```text
projectSeed + sceneId + eventId
```

---

# 35. Scene Transitions

Setiap multi-scene video memiliki transition.

NaraClip harus mengikuti rule:

- every scene has entrance choreography,
- transition menangani exit scene,
- jangan fade-out seluruh scene sebelum transition,
- final scene boleh memiliki explicit exit/fade.

Transition library:

- wipe,
- reveal,
- directional push,
- crossfade,
- object-mask reveal,
- scale transition.

AI memilih berdasarkan energy beat.

---

# 36. Automated QA Loop

Pipeline:

```text
Compile
  ↓
hyperframes lint
  ↓
hyperframes validate
  ↓
hyperframes inspect
  ↓
Pass?
 ├─ Yes → Preview/Render
 └─ No
      ↓
  Repair Agent
      ↓
  Recompile
```

Maximum automated repair attempts:

**3**

If still invalid:

```text
generation_failed
```

User credit dikembalikan bila kegagalan berasal dari sistem.

---

# 37. QA Dimensions

Validate:

### Structural

- composition registration,
- track overlap,
- invalid duration,
- missing assets.

### Layout

- text overflow,
- canvas overflow,
- caption collision,
- clipped subject.

### Contrast

- readable captions,
- readable labels.

### Animation

- dead zones,
- unintended invisible elements,
- offscreen elements,
- overly fast/slow animation.

### Audio

- narration duration,
- missing SFX,
- loudness sanity.

---

# 38. Render Pipeline

Development:

```bash
npx hyperframes render --quality draft
```

Final:

```bash
npx hyperframes render \
  --fps 30 \
  --quality high \
  --output final.mp4
```

Target MVP:

- 1080×1920,
- 30 fps,
- MP4,
- maximum 60 seconds.

---

# 39. Rendering Infrastructure

Architecture:

```text
API
 ↓
BullMQ
 ↓
Render Queue
 ↓
Render Worker
 ↓
HyperFrames CLI
 ↓
R2
```

API server tidak merender video.

Worker requirements:

- Node.js 22+,
- Chrome/Chromium,
- FFmpeg,
- CPU,
- enough RAM.

---

# 40. Concurrency

Scale berdasarkan render jobs, bukan total users.

Initial MVP:

```text
1–2 concurrent renders per worker
```

Requests lain masuk queue.

Observe:

- render duration,
- queue depth,
- CPU,
- memory,
- failure rate.

Setelah benchmark nyata, concurrency dapat dinaikkan.

---

# 41. Backend Stack

## Frontend

Next.js

## API

AdonisJS v6

## Database

PostgreSQL

## Queue

Redis + BullMQ

## Storage

Cloudflare R2

## Renderer

HyperFrames

## Animation Runtime

GSAP

---

# 42. Core Database Entities

```text
users
projects
videos
project_versions
scenes
assets
generation_jobs
render_jobs
credit_transactions
subscriptions
payments
```

Project version penting karena user dapat regenerate/edit satu scene.

---

# 43. Queue Design

Logical stages:

```text
story-generation
fact-processing
asset-generation
tts-generation
motion-planning
composition-generation
validation
video-render
```

MVP boleh menggabungkan worker queues.

Tetapi internal job state harus mempertahankan stage boundary.

---

# 44. Partial Regeneration

Jika user mengganti Scene 3 image:

Do not rerun:

- story,
- script,
- unrelated assets,
- TTS if narration unchanged.

Flow:

```text
regenerate asset
 ↓
recompile affected composition
 ↓
validate
 ↓
render
```

Jika user edit narration:

```text
regenerate TTS
 ↓
recompute timings
 ↓
update affected captions/events
 ↓
compile
 ↓
render
```

---

# 45. Quick Edit MVP

Tidak ada timeline editor ala Premiere.

User dapat:

- edit script,
- edit caption,
- regenerate image,
- replace image,
- change narrator voice,
- regenerate scene,
- select visual style,
- regenerate whole video.

---

# 46. Preview

Preview harus sedekat mungkin dengan final composition.

Tujuan:

> preview ≈ rendered output.

User dapat:

- play/pause,
- seek,
- inspect scenes,
- switch scene,
- edit,
- regenerate.

---

# 47. Live Progress

Frontend receives SSE states:

```text
Understanding your idea...
Writing story...
Planning visuals...
Creating assets...
Generating voice...
Designing motion...
Building scenes...
Checking layout...
Rendering...
Ready.
```

Jangan expose raw queue names ke user.

---

# 48. Watermark / Credits

MVP:

- free output → watermark,
- paid export → no watermark,
- generation actions consume credits.

Regeneration dapat memiliki differentiated credit cost.

Example concept:

- full generation = X credits,
- regenerate scene = fractional X,
- asset replacement = smaller cost.

Final pricing ditentukan setelah COGS benchmark.

---

# 49. Cost Model

Old estimate Rp832/video tidak boleh dianggap final.

Recalculate:

```text
LLM
+ fact/research calls
+ image generation
+ background removal
+ TTS
+ HyperFrames CPU rendering
+ storage
+ bandwidth
```

Target:

```text
COGS < $0.10 per ~60 second video
```

Tetapi benchmark nyata lebih penting daripada theoretical estimate.

Use:

```bash
npx hyperframes benchmark .
```

untuk mengukur render performance.

---

# 50. MVP Scope

## MUST HAVE

- [ ] authentication
- [ ] one-prompt generation
- [ ] Indonesian first
- [ ] English support
- [ ] story planner
- [ ] factual-claim layer
- [ ] 4–7 macro scene planner
- [ ] visual archetype router
- [ ] AI asset generation
- [ ] conditional background removal
- [ ] TTS + timings
- [ ] caption engine
- [ ] visual identity generation
- [ ] motion primitive library
- [ ] micro-event planner
- [ ] SFX planner
- [ ] HyperFrames compiler
- [ ] automated QA loop
- [ ] browser preview
- [ ] quick edit
- [ ] per-scene regeneration
- [ ] final MP4 export
- [ ] BullMQ render queue
- [ ] live generation progress
- [ ] credits
- [ ] watermark

---

# 51. NOT MVP

- advanced timeline editor,
- manual keyframes,
- full AI avatar,
- voice cloning,
- text-to-video generation,
- auto-posting,
- brand kits,
- custom fonts,
- team collaboration,
- 4K,
- landscape video,
- long-form,
- multilingual dubbing,
- public API.

---

# 52. Four-Week Build Plan

## Week 1 — Creative Engine Spike

Goal:

prove NaraClip can produce one strong video.

Build:

- HyperFrames vertical project,
- 5 macro scenes,
- 15–25 micro events,
- TTS,
- captions,
- 8–12 SFX cues,
- 10+ motion primitives,
- 2 visual archetypes,
- final MP4.

No billing.

No full dashboard.

Success criterion:

> hasilnya terasa seperti animated short, bukan slideshow.

---

## Week 2 — Structured AI Pipeline

Build:

```text
prompt
→ story
→ claims
→ script
→ scenes
→ archetypes
→ assets
→ audio
→ micro events
→ project_spec.json
→ HyperFrames
```

Add:

- schema validation,
- deterministic seed,
- repair loop,
- visual identity.

Test with at least 10 diverse prompts.

---

## Week 3 — Product UI

Build:

- dashboard,
- create flow,
- project detail,
- progress,
- preview,
- script edit,
- image regeneration,
- scene regeneration,
- export.

---

## Week 4 — Beta

Build:

- auth polish,
- credits,
- billing,
- watermark,
- metrics,
- storage lifecycle,
- failure recovery,
- onboarding.

Target:

20–50 beta users.

---

# 53. Critical Spike Test

Use a topic such as:

> "Kenapa gurita punya tiga jantung?"

Target output:

- 43–55 seconds,
- 95–125 words,
- 4–6 macro scenes,
- 15+ micro motion events,
- 5+ independent visual assets,
- captions,
- narration,
- 8+ SFX cues,
- 3+ transition variations,
- at least one visual twist,
- at least one comedic beat.

If this still feels like an AI slideshow:

**stop SaaS development and improve the creative engine.**

---

# 54. Success Metrics

## Reliability

Render success ≥ 95%.

## Generation

≥ 70% jobs finish without manual intervention.

## Product Quality

≥ 50% generated previews are exported.

## Latency

Median prompt → preview ≤ 5 minutes.

## Engagement

Beta users create average ≥ 3 videos.

## Edit Signal

Track regeneration rate by scene.

A high per-scene regeneration rate identifies weak planner/archetype behavior.

---

# 55. Observability

Track:

```text
generation_duration
story_generation_duration
asset_generation_duration
tts_duration
composition_duration
validation_duration
render_duration

asset_cost
llm_cost
render_cost
storage_cost

queue_wait_time
render_failure_rate
validation_failure_rate
repair_attempt_count

scene_regeneration_rate
asset_regeneration_rate
preview_to_export_rate
videos_per_user
```

---

# 56. Main Technical Risks

## Risk 1 — Output feels generic

Mitigation:

- story-first pipeline,
- archetype routing,
- micro-event density,
- sound choreography,
- video-level visual identity.

---

## Risk 2 — AI motion becomes chaotic

Mitigation:

- constrained motion vocabulary,
- validated parameters,
- deterministic compiler,
- no arbitrary GSAP.

---

## Risk 3 — Layout breaks

Mitigation:

```text
layout
→ lint
→ validate
→ inspect
→ repair
```

---

## Risk 4 — Factual hallucination

Mitigation:

- claim extraction,
- verification flag,
- explicit uncertainty handling.

---

## Risk 5 — Render cost becomes high

Mitigation:

- 30 fps,
- maximum 60 seconds,
- CPU benchmark,
- asset reuse,
- controlled concurrency,
- no unnecessary generative video.

---

## Risk 6 — Dataset overfitting

Mitigation:

Dataset terbaru memang memiliki 50 records, tetapi audit menemukan **47 templated/low-detail records dan 3 high-detail records**.

Therefore:

- weight examples by confidence tier,
- recompute metadata instead of trusting declared counts,
- detect placeholder captions/scripts,
- detect high duplicate similarity,
- do not hardcode one creator's linguistic habits,
- do not infer a universal 4-scene rule,
- expand reference corpora with diverse creators and content classes later.

---

# 57. Data Flywheel

Long-term moat is not provider choice.

Moat:

```text
Story Grammar
+
Visual Archetype Router
+
Motion Grammar
+
Scene/Event Dataset
+
User Edit Feedback
+
Performance Data
```

Capture anonymized product signals such as:

- which scene users regenerate,
- which hooks are exported,
- which archetypes fail,
- which motion combinations correlate with export,
- which SFX density feels excessive.

Do not require publishing analytics for MVP.

---

# 58. Repository Structure

```text
naraclip/
├── apps/
│   ├── web/
│   ├── api/
│   └── renderer/
│
├── packages/
│   ├── ai/
│   ├── project-schema/
│   ├── story-engine/
│   ├── fact-engine/
│   ├── archetype-router/
│   ├── motion-grammar/
│   ├── visual-system/
│   ├── sfx-library/
│   └── shared/
│
├── workers/
│   ├── generation/
│   └── rendering/
│
├── knowledge/
│   ├── storytelling.md
│   ├── visual-archetypes.md
│   ├── motion-grammar.md
│   └── sound-design.md
│
├── infra/
│   ├── docker/
│   └── deployment/
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── PROJECT_SPEC.md
│
└── package.json
```

---

# 59. Renderer Package

```text
apps/renderer/
├── compiler/
├── compositions/
├── runtime/
├── primitives/
├── validators/
└── cli/
```

Primitive examples:

```text
character
cutout
eyes
caption
counter
map
diagram
arrow
comparison
callout
camera
transition
```

These are not full video templates.

They are **visual vocabulary**.

---

# 60. Final MVP Definition

NaraClip MVP is complete when a user can:

1. open the website,
2. enter one idea,
3. press Generate,
4. receive a 9:16 informational animated short,
5. preview it,
6. edit text or replace/regenerate one asset,
7. regenerate one scene,
8. export MP4,

without understanding motion design.

The output should feel:

> intentionally animated, narratively paced, and visually choreographed.

Not:

> generated images placed one after another under a voice-over.

---

# 61. Core Product Principle

**Unique story. Reusable grammar. Deterministic execution.**

AI decides:

- what the story is,
- what the scene means,
- what visual vocabulary fits,
- what should happen when.

NaraClip engine decides:

- how the DOM is built,
- how the animation primitive is implemented,
- how timing remains valid,
- how HyperFrames rules are respected,
- how the final render remains deterministic.

---

# 62. Core Product Statement

### English

**NaraClip transforms one idea into an animated short worth watching.**

### Indonesian

**Satu ide. Jadi video yang layak ditonton.**

---

# Appendix A — 50-Record Dataset Audit

## A.1 Record Count

- metadata-declared records: **50**
- actual `videos` array length: **50**

The dataset is structurally 50 records.

## A.2 Confidence Split

- Tier A / high-detail: **3**
- Tier B / templated: **47**

The 47 Tier B records share the same generic explanatory paragraph and largely the same 4-scene structure.

## A.3 Aggregate Metrics

| Metric                        | All 50 | Tier A (3) | Tier B (47) |
| ----------------------------- | -----: | ---------: | ----------: |
| Mean duration (s)             |  46.08 |      47.33 |       46.00 |
| Mean declared word count      | 105.18 |     108.00 |      105.00 |
| Mean recomputed script length |  41.90 |     119.67 |       36.94 |
| Mean macro scenes             |   4.02 |       4.33 |        4.00 |
| Mean SFX cues                 |   8.22 |      11.67 |        8.00 |
| Mean declared elements        |   8.46 |      15.67 |        8.00 |

## A.4 Archetype Coverage

- `CHARACTER_HUMAN_ANIMAL`: **18**
- `GEOGRAPHY_GIS_SATELLITE`: **9**
- `CYBER_UI_FLOWCHART`: **7**
- `CHEMICAL_MATERIAL_FOOD`: **6**
- `ASTRONOMY_MICROSCOPIC`: **5**
- `MACHINE_TEARDOWN_PHYSICS`: **5**

## A.5 Category Coverage

The dataset contains **13 category labels**.

- Biology & Genetics: **9**
- Historical Anomalies & Declassification: **7**
- Physics & Machine Teardown: **7**
- Zoology & Evolution: **5**
- Chemical & Material Science: **4**
- Cybersecurity & Digital Forensics: **3**
- Societal & Everyday Science: **3**
- Earth Sciences & Geology: **3**
- Astronomy & Deep Space: **3**
- Microbiology & Dermatology: **2**
- Archaeology & Forensics: **2**
- Biotechnology & Ethics: **1**
- Zoology & Animal Welfare: **1**

## A.6 Product Interpretation

The dataset is best treated as:

1. a useful **taxonomy corpus**,
2. a useful **motion/scene idea library**,
3. a weak source for global statistics,
4. a strong warning that automatic dataset QA is necessary.

NaraClip must never assume that record count equals independent evidence count.

---

# Appendix B — Source Inputs

This PRD was revised using:

- NaraClip product discussion and earlier PRD,
- HyperFrames production constraints,
- `Dataset_Vinconium_50_Videos_Hyperframes_Full.json`,
- `Panduan_Produksi_Animasi_2D_Vinconium_Hyperframes.md`.

The 50-record dataset has now been audited. Future revisions should recalculate these statistics whenever the source dataset changes.

---

# Appendix C — Dataset Ingestion Quality Gate

Before any external reference dataset influences prompts, routing, or heuristics, run:

```text
1. schema.validate()
2. actualRecordCount = records.length
3. recompute textual metrics
4. validate timestamps
5. validate required scene fields
6. detect exact duplicates
7. detect near-duplicate scripts
8. detect repeated captions
9. detect repeated scene-action sequences
10. detect placeholder/generic text
11. assign confidence score
12. generate audit report
```

Recommended duplicate signals:

```text
script_similarity
beat_sequence_similarity
caption_similarity
animation_action_similarity
asset_pattern_similarity
timing_pattern_similarity
```

High duplicate similarity should lower evidence weight.

The creative engine may still use low-confidence records as **idea vocabulary**, but they must not dominate learned production rules.
