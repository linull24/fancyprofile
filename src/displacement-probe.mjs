// Measures the displacement directly, instead of inferring it from a picture.
//
// A full scene is a bad instrument: it is full of 1.2px lines, so any sub-pixel
// change rewrites whole lines and a pixel diff reports several percent for a
// difference nobody can see. One vertical white line on black has an
// unambiguous centroid, so "where did it land" is a real measurement.
//
// It settled an argument the pictures could not: whether a coarser map weakens
// the warp (it does not) or merely smooths it (it does).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap } from './displacement.mjs'
import { H, W, warpFilter } from './scene.mjs'
import { el, svgDocument } from './svg.mjs'

const LINE_X = 100 // deliberately off-centre, where dx is large

const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const f = 1 + 0.06 * (dx * dx + dy * dy)
  return { x: 0.5 + dx * f, y: 0.5 + dy * f }
}

const SIZES = [
  [800, 400],
  [400, 200],
  [200, 100],
  [100, 50],
  [50, 25],
  [25, 13],
]

const dir = join(import.meta.dirname, '..', 'experiments', 'probe')
mkdirSync(dir, { recursive: true })

// Where the source line lands in the output.
//
// Not `fragment(LINE_X/W).x * W`: the fragment gives, for each output pixel, the
// source position it samples. Landing is the inverse — the output pixel whose
// sample position is the line's own coordinate. The warp is not self-inverse
// (it scales by more than 1 away from centre), so the two differ by several px.
function landingColumn() {
  const want = LINE_X / W
  let best = null
  for (let px = 1; px < W; px++) {
    const got = fragment({ x: px / W, y: 0.5 }).x
    const err = Math.abs(got - want)
    if (!best || err < best.err) best = { px, err }
  }
  return best
}

const landing = landingColumn()
console.log(`probe: line at x=${LINE_X}, centre row`)
console.log(`  expected landing column = ${landing.px}px (offset ${landing.px - LINE_X}px)\n`)

for (const [mw, mh] of SIZES) {
  const map = buildDisplacementMap({ width: mw, height: mh, fragment, userWidth: W, userHeight: H })

  const svg = svgDocument({
    width: W,
    height: H,
    defs: warpFilter({ id: 'warp', map: map.dataURI, scale: map.scale }),
    body:
      el('rect', { width: W, height: H, fill: '#000' }) +
      el('g', { filter: 'url(#warp)' }, el('rect', { x: LINE_X - 1, y: 0, width: 2, height: H, fill: '#fff' })),
  })

  writeFileSync(join(dir, `probe-${mw}x${mh}.svg`), svg)
  console.log(`  ${String(mw).padStart(4)}x${String(mh).padEnd(4)} scale=${map.scale.toFixed(2)}  written`)
}

console.log(`\nread the landing column of each in the browser`)
