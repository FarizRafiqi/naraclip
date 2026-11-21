import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Brief } from '@naraclip/contracts'
import { paths, REPO_ROOT } from './workspace.js'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapWords(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (!current) {
      current = w
    } else if (current.length + 1 + w.length <= maxCharsPerLine) {
      current += ' ' + w
    } else {
      lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)
  return lines
}

function buildDockerThumbnailSvg(width: number, height: number): string {
  const isVertical = height > width
  if (!isVertical) {
    // 1280x720 YouTube 16:9 High-Contrast Thumbnail
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#222C3A" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1280" height="720" fill="#121820"/>
  <rect width="1280" height="720" fill="url(#grid)"/>
  <circle cx="980" cy="360" r="320" fill="#1D63ED" opacity="0.16"/>
  <circle cx="280" cy="180" r="220" fill="#D94426" opacity="0.12"/>

  <!-- Top Pill -->
  <rect x="64" y="48" width="420" height="54" rx="27" fill="#1D63ED" stroke="#F4EFE6" stroke-width="3"/>
  <text x="274" y="83" text-anchor="middle" fill="#FFFFFF" font-family="Roboto, Liberation Sans, sans-serif" font-size="24" font-weight="700" letter-spacing="1">DEV EXPLAINER  •  60 DETIK</text>

  <!-- Main Headline -->
  <text x="64" y="198" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="88" font-weight="900">DOCKER</text>
  <text x="458" y="198" fill="#5EA8FF" font-family="Outfit, Liberation Sans, sans-serif" font-size="88" font-weight="900">60s</text>

  <!-- Split Conflict Cards -->
  <g transform="translate(64, 232)">
    <rect x="6" y="8" width="318" height="175" rx="14" fill="#090D12"/>
    <rect width="318" height="175" rx="14" fill="#128067" stroke="#34D399" stroke-width="4"/>
    <circle cx="52" cy="52" r="24" fill="#FFFFFF"/>
    <path d="M 41 52 L 49 60 L 64 43" fill="none" stroke="#128067" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="92" y="60" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">LAPTOPKU</text>
    <text x="28" y="128" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="52" font-weight="900">JALAN!</text>

    <g transform="translate(344, 0)">
      <rect x="6" y="8" width="318" height="175" rx="14" fill="#090D12"/>
      <rect width="318" height="175" rx="14" fill="#D94426" stroke="#F4EFE6" stroke-width="4"/>
      <circle cx="52" cy="52" r="24" fill="#FFFFFF"/>
      <path d="M 42 42 L 62 62 M 62 42 L 42 62" fill="none" stroke="#D94426" stroke-width="6" stroke-linecap="round"/>
      <text x="92" y="60" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">LAPTOPMU</text>
      <text x="28" y="128" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="52" font-weight="900">ERROR?!</text>
    </g>
  </g>

  <!-- Code Pill -->
  <g transform="translate(64, 444)">
    <rect width="662" height="82" rx="12" fill="#171F2A" stroke="#5EA8FF" stroke-width="3"/>
    <text x="28" y="51" fill="#5EA8FF" font-family="Noto Sans Mono, monospace" font-size="30" font-weight="700">$</text>
    <text x="64" y="51" fill="#F4EFE6" font-family="Noto Sans Mono, monospace" font-size="28" font-weight="700">docker run -p 8080:80 myapp</text>
  </g>

  <!-- Bottom Guarantee Tag -->
  <g transform="translate(64, 562)">
    <rect width="580" height="94" rx="47" fill="#F4EFE6" stroke="#1D63ED" stroke-width="5"/>
    <text x="290" y="60" text-anchor="middle" fill="#121820" font-family="Outfit, Liberation Sans, sans-serif" font-size="36" font-weight="900">1 IMAGE = SAMA SEMUA!</text>
  </g>

  <!-- Right Side Hero Container Whale -->
  <g transform="translate(765, 130)">
    <rect x="8" y="8" width="450" height="520" rx="28" fill="#090D12"/>
    <rect width="450" height="520" rx="28" fill="#171F2A" stroke="#2A3444" stroke-width="4"/>
    <!-- Container Grid on Top -->
    <g transform="translate(72, 70)">
      <rect x="0" y="70" width="96" height="62" rx="6" fill="#1D63ED" stroke="#F4EFE6" stroke-width="3"/>
      <text x="48" y="109" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">NODE</text>
      <rect x="108" y="70" width="96" height="62" rx="6" fill="#128067" stroke="#F4EFE6" stroke-width="3"/>
      <text x="156" y="109" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">APP</text>
      <rect x="216" y="70" width="96" height="62" rx="6" fill="#F59E0B" stroke="#121820" stroke-width="3"/>
      <text x="264" y="109" text-anchor="middle" fill="#121820" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">DB</text>

      <rect x="54" y="0" width="96" height="62" rx="6" fill="#D94426" stroke="#F4EFE6" stroke-width="3"/>
      <text x="102" y="39" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="20" font-weight="700">OS</text>
      <rect x="162" y="0" width="96" height="62" rx="6" fill="#5EA8FF" stroke="#F4EFE6" stroke-width="3"/>
      <text x="210" y="39" text-anchor="middle" fill="#121820" font-family="Noto Sans Mono, monospace" font-size="20" font-weight="700">DEPS</text>
    </g>
    <!-- Stylized Whale Hull -->
    <g transform="translate(46, 215)">
      <path d="M 10 32 H 310 C 310 148 220 198 128 198 C 46 198 10 128 10 32 Z" fill="#1D63ED" stroke="#F4EFE6" stroke-width="5"/>
      <path d="M 310 72 C 350 72 372 42 365 8 C 335 16 322 36 312 56" fill="#5EA8FF" stroke="#F4EFE6" stroke-width="4"/>
      <circle cx="88" cy="116" r="14" fill="#FFFFFF"/>
      <circle cx="88" cy="116" r="7" fill="#121820"/>
    </g>
    <text x="225" y="476" text-anchor="middle" fill="#34D399" font-family="Noto Sans Mono, monospace" font-size="24" font-weight="700">CONTAINER ISOLATION ✓</text>
  </g>
</svg>`
  }

  // 1080x1920 Shorts Vertical Cover
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#121820"/>
  <circle cx="540" cy="780" r="460" fill="#1D63ED" opacity="0.16"/>
  <rect x="240" y="140" width="600" height="68" rx="34" fill="#1D63ED" stroke="#F4EFE6" stroke-width="4"/>
  <text x="540" y="185" text-anchor="middle" fill="#FFFFFF" font-family="Roboto, Liberation Sans, sans-serif" font-size="30" font-weight="700">DEV EXPLAINER  •  60 DETIK</text>
  <text x="540" y="370" text-anchor="middle" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="136" font-weight="900">DOCKER?</text>
  <rect x="85" y="450" width="435" height="220" rx="20" fill="#128067" stroke="#34D399" stroke-width="5"/>
  <circle cx="150" cy="516" r="24" fill="#FFFFFF"/>
  <path d="M 138 516 L 147 525 L 163 506" fill="none" stroke="#128067" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="330" y="526" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="28" font-weight="700">DI LAPTOPKU</text>
  <text x="302" y="618" text-anchor="middle" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="68" font-weight="900">JALAN!</text>
  <rect x="560" y="450" width="435" height="220" rx="20" fill="#D94426" stroke="#F4EFE6" stroke-width="5"/>
  <circle cx="625" cy="516" r="24" fill="#FFFFFF"/>
  <path d="M 614 505 L 636 527 M 636 505 L 614 527" fill="none" stroke="#D94426" stroke-width="7" stroke-linecap="round"/>
  <text x="805" y="526" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Mono, monospace" font-size="28" font-weight="700">DI LAPTOPMU</text>
  <text x="777" y="618" text-anchor="middle" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="68" font-weight="900">ERROR?!</text>
  <g transform="translate(220, 810)">
    <rect x="110" y="80" width="130" height="82" rx="8" fill="#1D63ED" stroke="#F4EFE6" stroke-width="4"/>
    <rect x="255" y="80" width="130" height="82" rx="8" fill="#128067" stroke="#F4EFE6" stroke-width="4"/>
    <rect x="400" y="80" width="130" height="82" rx="8" fill="#F59E0B" stroke="#121820" stroke-width="4"/>
    <rect x="182" y="-15" width="130" height="82" rx="8" fill="#D94426" stroke="#F4EFE6" stroke-width="4"/>
    <rect x="328" y="-15" width="130" height="82" rx="8" fill="#5EA8FF" stroke="#F4EFE6" stroke-width="4"/>
    <path d="M 60 185 H 550 C 550 385 390 475 240 475 C 110 475 60 355 60 185 Z" fill="#1D63ED" stroke="#F4EFE6" stroke-width="7"/>
    <circle cx="170" cy="315" r="22" fill="#FFFFFF"/>
    <circle cx="170" cy="315" r="10" fill="#121820"/>
  </g>
  <rect x="110" y="1410" width="860" height="128" rx="64" fill="#F4EFE6" stroke="#1D63ED" stroke-width="6"/>
  <text x="540" y="1490" text-anchor="middle" fill="#121820" font-family="Outfit, Liberation Sans, sans-serif" font-size="50" font-weight="900">1 IMAGE • JALAN DI MANA SAJA</text>
</svg>`
}

function buildRedisThumbnailSvg(width: number, height: number): string {
  const isVertical = height > width
  if (!isVertical) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <pattern id="gridR" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#222C3A" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1280" height="720" fill="#121820"/>
  <rect width="1280" height="720" fill="url(#gridR)"/>
  <circle cx="960" cy="350" r="300" fill="#D94426" opacity="0.22"/>
  <circle cx="320" cy="460" r="240" fill="#128067" opacity="0.16"/>

  <!-- Top Pill -->
  <rect x="64" y="48" width="440" height="54" rx="27" fill="#D94426" stroke="#F4EFE6" stroke-width="3"/>
  <text x="284" y="83" text-anchor="middle" fill="#FFFFFF" font-family="Roboto, Liberation Sans, sans-serif" font-size="24" font-weight="700" letter-spacing="1">DEV EXPLAINER  •  60 DETIK</text>

  <!-- Main Headline -->
  <text x="64" y="198" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="80" font-weight="900">REDIS</text>
  <text x="348" y="198" fill="#F97352" font-family="Outfit, Liberation Sans, sans-serif" font-size="80" font-weight="900">NGEBUT</text>

  <!-- Sub-ms Banner -->
  <rect x="64" y="238" width="675" height="122" rx="18" fill="#128067" stroke="#34D399" stroke-width="5"/>
  <text x="401" y="318" text-anchor="middle" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="68" font-weight="900">RESPON &lt; 1 ms!</text>

  <!-- Comparison Pills -->
  <g transform="translate(64, 392)">
    <rect width="320" height="86" rx="12" fill="#1E2734" stroke="#D94426" stroke-width="4"/>
    <text x="160" y="38" text-anchor="middle" fill="#F97352" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">DISK DATABASE</text>
    <text x="160" y="70" text-anchor="middle" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="30" font-weight="900">10 - 50 ms</text>

    <g transform="translate(352, 0)">
      <rect width="322" height="86" rx="12" fill="#1E2734" stroke="#34D399" stroke-width="4"/>
      <text x="161" y="38" text-anchor="middle" fill="#34D399" font-family="Noto Sans Mono, monospace" font-size="22" font-weight="700">REDIS DI RAM</text>
      <text x="161" y="70" text-anchor="middle" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="30" font-weight="900">&lt; 1 ms ✓</text>
    </g>
  </g>

  <!-- Code Pill -->
  <g transform="translate(64, 514)">
    <rect width="675" height="82" rx="12" fill="#171F2A" stroke="#5EA8FF" stroke-width="3"/>
    <text x="28" y="51" fill="#5EA8FF" font-family="Noto Sans Mono, monospace" font-size="30" font-weight="700">$</text>
    <text x="64" y="51" fill="#F4EFE6" font-family="Noto Sans Mono, monospace" font-size="28" font-weight="700">redis-cli SET user:1 EX 60</text>
  </g>

  <text x="64" y="655" fill="#C7D0DC" font-family="Roboto, Liberation Sans, sans-serif" font-size="26" font-weight="700">Caching  •  Counter  •  Leaderboard  •  RDB / AOF</text>

  <!-- Right Hero: Redis Stacked Diamonds + <1ms Chronometer -->
  <g transform="translate(795, 75)">
    <rect x="8" y="8" width="420" height="570" rx="28" fill="#090D12"/>
    <rect width="420" height="570" rx="28" fill="#171F2A" stroke="#2A3444" stroke-width="4"/>
    <!-- Diamond Stack -->
    <g transform="translate(210, 145)">
      <polygon points="0,-24 125,30 0,84 -125,30" fill="#2A3444" stroke="#F4EFE6" stroke-width="4"/>
      <polygon points="0,-64 125,-10 0,44 -125,-10" fill="#F97352" stroke="#F4EFE6" stroke-width="4"/>
      <polygon points="0,-104 125,-50 0,4 -125,-50" fill="#D94426" stroke="#F4EFE6" stroke-width="4"/>
    </g>
    <!-- Dual-Needle Chronometer -->
    <g transform="translate(210, 395)">
      <circle cx="0" cy="0" r="128" fill="#F4EFE6" stroke="#FFFFFF" stroke-width="5"/>
      <path d="M -92 34 A 98 98 0 0 1 0 -98" fill="none" stroke="#128067" stroke-width="18" stroke-linecap="round"/>
      <path d="M 8 -98 A 98 98 0 0 1 92 34" fill="none" stroke="#D94426" stroke-width="18" stroke-linecap="round"/>
      <line x1="0" y1="0" x2="62" y2="-40" stroke="#D94426" stroke-width="7" stroke-linecap="round"/>
      <line x1="0" y1="0" x2="-68" y2="-42" stroke="#1D63ED" stroke-width="11" stroke-linecap="round"/>
      <circle cx="0" cy="0" r="14" fill="#1D63ED" stroke="#121820" stroke-width="4"/>
      <text x="0" y="64" text-anchor="middle" fill="#121820" font-family="Outfit, Liberation Sans, sans-serif" font-size="38" font-weight="900">&lt; 1 ms</text>
    </g>
  </g>
</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#121820"/>
  <circle cx="540" cy="760" r="460" fill="#D94426" opacity="0.2"/>
  <rect x="240" y="140" width="600" height="68" rx="34" fill="#D94426" stroke="#F4EFE6" stroke-width="4"/>
  <text x="540" y="185" text-anchor="middle" fill="#FFFFFF" font-family="Roboto, Liberation Sans, sans-serif" font-size="30" font-weight="700">DEV EXPLAINER  •  60 DETIK</text>
  <text x="540" y="360" text-anchor="middle" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="138" font-weight="900">REDIS</text>
  <rect x="140" y="425" width="800" height="150" rx="28" fill="#128067" stroke="#34D399" stroke-width="6"/>
  <text x="540" y="525" text-anchor="middle" fill="#FFFFFF" font-family="Outfit, Liberation Sans, sans-serif" font-size="88" font-weight="900">RESPON &lt; 1 ms!</text>
  <g transform="translate(540, 815)">
    <polygon points="0,-24 230,72 0,168 -230,72" fill="#2A3444" stroke="#F4EFE6" stroke-width="6"/>
    <polygon points="0,-94 230,2 0,98 -230,2" fill="#F97352" stroke="#F4EFE6" stroke-width="6"/>
    <polygon points="0,-164 230,-68 0,28 -230,-68" fill="#D94426" stroke="#F4EFE6" stroke-width="6"/>
  </g>
  <g transform="translate(540, 1260)">
    <circle cx="0" cy="0" r="215" fill="#F4EFE6" stroke="#FFFFFF" stroke-width="8"/>
    <path d="M -155 58 A 165 165 0 0 1 0 -165" fill="none" stroke="#128067" stroke-width="26" stroke-linecap="round"/>
    <path d="M 12 -165 A 165 165 0 0 1 155 58" fill="none" stroke="#D94426" stroke-width="26" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="105" y2="-65" stroke="#D94426" stroke-width="10" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="-115" y2="-70" stroke="#1D63ED" stroke-width="15" stroke-linecap="round"/>
    <circle cx="0" cy="0" r="22" fill="#1D63ED" stroke="#121820" stroke-width="5"/>
    <text x="0" y="108" text-anchor="middle" fill="#121820" font-family="Outfit, Liberation Sans, sans-serif" font-size="60" font-weight="900">&lt; 1 ms</text>
  </g>
</svg>`
}

function buildGenericThumbnailSvg(brief: Brief, width: number, height: number): string {
  const headlineLines = wrapWords(brief.title.toUpperCase(), width > height ? 22 : 16).slice(0, 3)
  const cx = width > height ? 72 : width / 2
  const anchor = width > height ? 'start' : 'middle'
  const fs = width > height ? 68 : 82
  const textEls = headlineLines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${(width > height ? 260 : 520) + i * (fs * 1.18)}" text-anchor="${anchor}" fill="#F4EFE6" font-family="Outfit, Liberation Sans, sans-serif" font-size="${fs}" font-weight="900">${escapeXml(line)}</text>`
    )
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#121820"/>
  <rect x="64" y="54" width="380" height="52" rx="26" fill="#1D63ED"/>
  <text x="254" y="88" text-anchor="middle" fill="#FFFFFF" font-family="Roboto, Liberation Sans, sans-serif" font-size="24" font-weight="700">NARACLIP  •  60 DETIK</text>
  ${textEls}
</svg>`
}

function buildThumbnailSvg(slug: string, brief: Brief, width: number, height: number): string {
  if (slug.includes('docker')) return buildDockerThumbnailSvg(width, height)
  if (slug.includes('redis')) return buildRedisThumbnailSvg(width, height)
  return buildGenericThumbnailSvg(brief, width, height)
}

function rasterizeSvgViaFastRenderer(
  svgFile: string,
  outPng: string,
  width: number,
  height: number,
  publicDir: string
): boolean {
  const fastBin = path.join(
    REPO_ROOT,
    'packages',
    'fast-renderer',
    'target',
    'release',
    'naraclip-fast-render'
  )
  if (!fs.existsSync(fastBin)) return false

  const res = spawnSync(
    fastBin,
    [
      '--svg',
      svgFile,
      '--width',
      String(width),
      '--height',
      String(height),
      '--public-dir',
      publicDir,
      '--ffmpeg',
      'ffmpeg',
      '--output',
      outPng,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000 }
  )
  return res.status === 0 && fs.existsSync(outPng)
}

export function generateThumbnails(
  slug: string,
  brief: Brief
): {
  thumbnailPng: string | null
  thumbnailShortsPng: string | null
  thumbnailSvg: string
} {
  const p = paths(slug)
  fs.mkdirSync(p.exports, { recursive: true })
  fs.mkdirSync(p.previews, { recursive: true })

  const svgLandscape = buildThumbnailSvg(slug, brief, 1280, 720)
  const svgPortrait = buildThumbnailSvg(slug, brief, 1080, 1920)
  const svgLandscapePath = path.join(p.previews, 'thumbnail-landscape.svg')
  const svgPortraitPath = path.join(p.previews, 'thumbnail-shorts.svg')
  fs.writeFileSync(svgLandscapePath, svgLandscape)
  fs.writeFileSync(svgPortraitPath, svgPortrait)

  const outLandscape = path.join(p.exports, 'thumbnail.png')
  const outPortrait = path.join(p.exports, 'thumbnail-shorts.png')
  const publicDir = path.join(p.render, 'public')

  const okLandscape = rasterizeSvgViaFastRenderer(svgLandscapePath, outLandscape, 1280, 720, publicDir)
  const okPortrait = rasterizeSvgViaFastRenderer(svgPortraitPath, outPortrait, 1080, 1920, publicDir)

  return {
    thumbnailPng: okLandscape ? outLandscape : null,
    thumbnailShortsPng: okPortrait ? outPortrait : null,
    thumbnailSvg: svgLandscapePath,
  }
}
