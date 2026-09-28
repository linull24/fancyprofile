// Pushes the resolution question to a human eye on GitHub.
//
// The pixel metric can't settle it: it reports 3-10% for differences that the
// amplified difference image shows are sub-pixel edge shifts on 1.2px lines.
// Whether that is visible depends on the display size, which only a real
// README can provide.
//
// Each file stacks two views of the same scene, sharing one embedded map:
//   top    — the frame at native 800x400, i.e. what GitHub scales to ~760px
//   bottom — a 4x magnifier over the busiest region (sun edge, horizon,
//            converging grid), where any smoothing would show first
//
// The layout is chosen so the file answers its own question: if the top halves
// look alike and only the bottom halves differ, the map is small enough.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap, displacementFilter } from './displacement.mjs'
import { OUT_DIR } from './experiments.mjs'
import { H, W, sceneBody, sceneDefs, svgDocument } from './scene.mjs'

const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const warp = 1 + 0.22 * (dx * dx + dy * dy)
  return {
    x: 0.5 + dx * warp + Math.sin(uv.y * Math.PI * 6) * 0.006,
    y: 0.5 + dy * warp,
  }
}

const CANDIDATES = [
  { id: '800x400', mw: 800, mh: 400, note: 'current, 132kB' },
  { id: '200x100', mw: 200, mh: 100, note: 'conservative, 37kB' },
  { id: '100x50', mw: 100, mh: 50, note: 'aggressive, 18kB' },
]

const ZOOM = { x: 300, y: 180, w: 200, h: 100 } // sun edge + horizon + dense grid
const PANEL_H = 400

const dir = join(OUT_DIR, 'review')
mkdirSync(dir, { recursive: true })

const rows = []
for (const c of CANDIDATES) {
  const map = buildDisplacementMap({
    width: c.mw,
    height: c.mh,
    fragment,
    userWidth: W,
    userHeight: H,
  })

  // One <defs> for both panels — the map is embedded once per file.
  const defs = sceneDefs({
    extra: displacementFilter({ id: 'crt', map: map.dataURI, width: W, height: H, scale: map.scale }),
  })
  const body = `<g filter="url(#crt)">${sceneBody()}</g>`

  // Nested <svg> with its own viewBox does the cropping and the magnification.
  // The filter stays in user space, so the map still lines up in both panels.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${PANEL_H * 2}" viewBox="0 0 ${W} ${PANEL_H * 2}">
  <defs>
    ${defs}
  </defs>
  <svg x="0" y="0" width="${W}" height="${PANEL_H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
    ${body}
  </svg>
  <svg x="0" y="${PANEL_H}" width="${W}" height="${PANEL_H}" viewBox="${ZOOM.x} ${ZOOM.y} ${ZOOM.w} ${ZOOM.h}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
    ${body}
  </svg>
</svg>
`
  writeFileSync(join(dir, `review-${c.id}.svg`), svg)
  rows.push({ ...c, svgKB: +(Buffer.byteLength(svg) / 1024).toFixed(1), mapKB: +(map.dataURI.length / 1024).toFixed(1) })
}

console.log('### resolution review\n')
console.log('candidate   map kB   svg kB   (top = 1x frame, bottom = 4x zoom of sun/horizon/grid)')
for (const r of rows) {
  console.log(`${r.id.padEnd(11)} ${String(r.mapKB).padStart(6)}   ${String(r.svgKB).padStart(6)}   ${r.note}`)
}
console.log(`\nwritten to experiments/review/ — reference them from the README and look on GitHub`)
