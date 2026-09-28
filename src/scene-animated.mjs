// The animated background: driving forward over the grid.
//
// The rungs cannot be scrolled with a transform. Under a forward-moving camera a
// ground point at distance z lands at y = HORIZON + K/z, so equal steps in z are
// wildly unequal steps in y — a rigid translateY would move the far rungs as
// fast as the near ones and read as a sliding texture, not as motion.
//
// So the rungs are animated the honest way: SMIL interpolating the path `d`
// across precomputed keyframes. Every keyframe carries the same number of rungs
// in the same command order, which is what `<animate attributeName="d">`
// requires, and the rung set is periodic, so the loop closes seamlessly.
//
// The rails (verticals) stay put, as they must: they converge on the vanishing
// point at any distance.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap } from './displacement.mjs'
import { H, HORIZON, W, gridPath, scene } from './scene.mjs'
import { el, svgDocument } from './svg.mjs'

// Camera geometry. y = HORIZON + K/z, so K is what the viewport spans: z = 1
// sits exactly at the bottom edge.
const K = 150
const Z_NEAR = 0.72 // y ≈ 458, below the frame — a rung exits unseen
const SPACING = 0.34
const RUNGS = 20
const FRAMES = 28
const LOOP_SECONDS = 1.8

// One loop advances the camera by exactly one spacing, at which point the rung
// set is congruent with where it started. That is what makes the repeat
// seamless instead of a visible jump.
const Z_FAR = Z_NEAR + RUNGS * SPACING

function rungs(phase) {
  const travelled = phase * SPACING
  const parts = []
  for (let n = 0; n < RUNGS; n++) {
    let z = Z_NEAR + n * SPACING - travelled
    while (z < Z_NEAR) z += RUNGS * SPACING
    parts.push(`M0,${(HORIZON + K / z).toFixed(2)}H${W}`)
  }
  return parts.join('')
}

const keyframes = Array.from({ length: FRAMES + 1 }, (_, i) => rungs(i / FRAMES))

const rungElement = gridPath({
  d: keyframes[0],
  children: el('animate', {
    attributeName: 'd',
    values: keyframes.join(';'),
    dur: `${LOOP_SECONDS}s`,
    repeatCount: 'indefinite',
    calcMode: 'linear',
  }),
})

const warp = buildDisplacementMap({
  width: 100,
  height: 50,
  fragment: (uv) => {
    const dx = uv.x - 0.5
    const dy = uv.y - 0.5
    const f = 1 + 0.06 * (dx * dx + dy * dy)
    return { x: 0.5 + dx * f, y: 0.5 + dy * f }
  },
  userWidth: W,
  userHeight: H,
})

const svg = svgDocument({
  width: W,
  height: H,
  ...scene({
    warp: { map: warp.dataURI, scale: warp.scale },
    rungs: rungElement,
  }),
})

const dir = join(import.meta.dirname, '..', 'scenes')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'night-drive.svg'), svg)

console.log(`scenes/night-drive.svg  ${(Buffer.byteLength(svg) / 1024).toFixed(1)}kB`)
console.log(`  ${RUNGS} rungs · ${FRAMES} keyframes · ${LOOP_SECONDS}s loop · z ${Z_NEAR}–${Z_FAR.toFixed(2)}`)
console.log(`  warp map ${(warp.dataURI.length / 1024).toFixed(1)}kB`)
