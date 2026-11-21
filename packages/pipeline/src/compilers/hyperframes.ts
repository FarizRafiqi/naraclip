import fs from 'node:fs'
import path from 'node:path'
import type { Brief, Storyboard, Timing } from '@naraclip/contracts'
import { paths } from '../workspace.js'

export function compileHyperframes(
  slug: string,
  brief: Brief,
  storyboard: Storyboard,
  timing: Timing,
  fps = 30
): string {
  const p = paths(slug)
  const timingMap = new Map(timing.shots.map((s) => [s.shotId, s]))
  const totalDurationSec = (timing.durationMs / 1000).toFixed(2)

  const shotElements: string[] = []
  const gsapAnimations: string[] = []

  for (const shot of storyboard.shots) {
    const t = timingMap.get(shot.id)
    if (!t) continue

    const startSec = (t.startMs / 1000).toFixed(2)
    const durSec = ((t.endMs - t.startMs) / 1000).toFixed(2)

    let innerContent = ''

    if (shot.recipe === 'char-pose' || shot.recipe === 'prop-popin') {
      const assetSrc = shot.assetId ? `../assets/generated/${shot.assetId}.png` : ''
      innerContent = `
        <div class="cam" id="${shot.id}-cam">
          <div class="prop-wrapper">
            ${assetSrc ? `<img class="prop" src="${assetSrc}" alt="${shot.id}"/>` : ''}
            ${shot.headline ? `<div class="label"><span class="highlight">${shot.headline}</span></div>` : ''}
          </div>
        </div>`

      gsapAnimations.push(`
        // Shot ${shot.id} Motion
        gsap.fromTo('#${shot.id}-cam', 
          { scale: ${shot.motion === 'push-in' ? 1.0 : 1.1}, opacity: 0 }, 
          { scale: ${shot.motion === 'push-in' ? 1.15 : 1.0}, opacity: 1, duration: ${durSec}, ease: 'power2.out' }
        );`)
    } else if (shot.recipe === 'kinetic-title') {
      innerContent = `
        <div class="title-card">
          <h1>${shot.headline || brief.title}</h1>
          ${shot.body ? `<p>${shot.body}</p>` : ''}
        </div>`
    } else if (shot.recipe === 'evidence-card') {
      innerContent = `
        <div class="evidence-card">
          <div class="evidence-header">📌 Bukti & Riset Otentik</div>
          <h2>${shot.headline || ''}</h2>
          <p>${shot.body || ''}</p>
        </div>`
    } else {
      innerContent = `
        <div class="stat-callout">
          <h2>${shot.headline || ''}</h2>
          <p>${shot.body || ''}</p>
        </div>`
    }

    shotElements.push(`
      <div id="${shot.id}" class="clip shot" data-start="${startSec}" data-duration="${durSec}" data-track-index="1">
        ${innerContent}
      </div>`)
  }

  // Beat Captions
  const captionElements: string[] = []
  for (const beat of timing.beats) {
    const bStart = (beat.startMs / 1000).toFixed(2)
    const bDur = ((beat.endMs - beat.startMs) / 1000).toFixed(2)
    captionElements.push(`
      <div class="clip caption-clip" data-start="${bStart}" data-duration="${bDur}" data-track-index="2">
        <div class="caption-box">
          <p id="cap-${beat.beatId}">${brief.title}</p>
        </div>
      </div>`)
  }

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080,height=1920">
  <title>${brief.title}</title>
  <script src="/packages/hyperframes/assets/vendor/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0f172a; font-family: system-ui, sans-serif; color: #fff; }
    #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
    .shot { position: absolute; inset: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .cam { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .prop-wrapper { position: relative; display: flex; flex-direction: column; align-items: center; gap: 30px; }
    .prop { max-width: 800px; max-height: 900px; object-fit: contain; filter: drop-shadow(0 20px 30px rgba(0,0,0,0.7)); }
    .label { padding: 12px 28px; background: #e11d48; color: #fff; font-size: 42px; font-weight: 800; border-radius: 12px; }
    .title-card { text-align: center; max-width: 900px; padding: 40px; background: rgba(0,0,0,0.6); border-radius: 24px; }
    .title-card h1 { font-size: 64px; font-weight: 800; color: #f8fafc; line-height: 1.2; margin-bottom: 20px; }
    .title-card p { font-size: 32px; color: #94a3b8; }
    .evidence-card { max-width: 860px; padding: 40px; background: #1e293b; border: 2px solid #38bdf8; border-radius: 20px; }
    .evidence-header { font-size: 24px; font-weight: 700; color: #38bdf8; text-transform: uppercase; margin-bottom: 16px; }
    .stat-callout { text-align: center; padding: 50px; background: #1e1b4b; border-radius: 24px; border: 2px solid #818cf8; }
    .stat-callout h2 { font-size: 68px; color: #38bdf8; }
    .stat-callout p { font-size: 32px; color: #cbd5e1; margin-top: 16px; }
    .caption-box { position: absolute; bottom: 160px; width: 100%; text-align: center; }
    .caption-box p { display: inline-block; padding: 10px 24px; background: rgba(0,0,0,0.85); font-size: 40px; font-weight: 700; border-radius: 8px; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-duration="${totalDurationSec}" data-width="1080" data-height="1920" data-fps="${fps}">
    ${shotElements.join('\n')}
    ${captionElements.join('\n')}
  </div>
  <script>
    // HyperFrames GSAP Composition Initializer
    document.addEventListener('DOMContentLoaded', () => {
      ${gsapAnimations.join('\n')}
    });
  </script>
</body>
</html>`

  const outHtmlFile = path.join(p.render, 'composition.html')
  fs.mkdirSync(p.render, { recursive: true })
  fs.writeFileSync(outHtmlFile, html)

  return html
}
