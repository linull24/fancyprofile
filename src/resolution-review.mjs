// Pushes the resolution question to a human eye on GitHub.
//
// The pixel metric can't settle it: it reports several percent for differences
// that the amplified difference image shows are sub-pixel edge shifts on 1.2px
// lines. Whether that is visible depends on display size, which only a real
// README can provide.
//
// Each file stacks two views of the same scene, sharing one embedded map:
//   top    — the frame at native size, i.e. what GitHub scales to ~760px
//   bottom — a 4x magnifier over the busiest region, where smoothing shows first
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap } from './displacement.mjs'
import { OUT_DIR } from './experiments.mjs'
import { H, W, scene } from './scene.mjs'
import { svgDocument } from './svg.mjs'

const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const f = 1 + 0.06 * (dx * dx + dy * dy)
  return { x: 0.5 + dx * f, y: 0.5 + dy * f }
}

const CANDIDATES = [
  { id: '800x400', mw: 800, mh: 400, note: 'full resolution' },
  { id: '200x100', mw: 200, mh: 100, note: 'conservative' },
  { id: '100x50', mw: 100, mh: 50, note: 'aggressive' },
]

const ZOOM = { x: 300, y: 190, w: 200, h: 100 } // ridge line + horizon + converging grid
const PANEL_H = 400

const dir = join(OUT_DIR, 'review')
mkdirSync(dir, { recursive: true })

const rows = []
for (const c of CANDIDATES) {
  const map = buildDisplacementMap({ width: c.mw, height: c.mh, fragment, userWidth: W, userHeight: H })
  const { defs, body } = scene({ warp: { map: map.dataURI, scale: map.scale } })

  // Nested <svg> with its own viewBox does the cropping and magnification. The
  // filter stays in user space, so the map lines up in both panels.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PANEL_H * 2}" viewBox="0 0 ${W} ${PANEL_H * 2}">
<defs>${defs}</defs>
<svg x="0" y="0" width="${W}" height="${PANEL_H}" viewBox="0 0 ${W} ${H}">${body}</svg>
<svg x="0" y="${PANEL_H}" width="${W}" height="${PANEL_H}" viewBox="${ZOOM.x} ${ZOOM.y} ${ZOOM.w} ${ZOOM.h}">${body}</svg>
</svg>`

  writeFileSync(join(dir, `review-${c.id}.svg`), svg)
  rows.push({
    ...c,
    svgKB: +(Buffer.byteLength(svg) / 1024).toFixed(1),
    mapKB: +(map.dataURI.length / 1024).toFixed(1),
  })
}

console.log('### resolution review\n')
console.log('candidate   map kB   svg kB')
for (const r of rows) console.log(`${r.id.padEnd(11)} ${String(r.mapKB).padStart(6)}   ${String(r.svgKB).padStart(6)}   ${r.note}`)
console.log(`\nwritten to experiments/review/ — reference from the README and look on GitHub`)
