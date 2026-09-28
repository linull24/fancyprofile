// Why does a coarser displacement map produce a *weaker* warp rather than a
// blurrier one?
//
// The compression sweep showed the grid distortion visibly relaxing as the map
// got smaller, which contradicts the model: `scale` is held constant, and the
// encoded value is the offset normalised by scale, so magnitude should survive
// resampling. The stacked comparison can't settle it — the scene is too busy.
//
// So measure the displacement directly: one vertical white line on black, run
// it through the filter, and find where it actually lands. A single line has an
// unambiguous centroid, and the expected offset is known in closed form.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap, displacementFilter } from './displacement.mjs'

const W = 800
const H = 400
const LINE_X = 100 // deliberately off-centre, where dx is large

const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const warp = 1 + 0.22 * (dx * dx + dy * dy)
  return { x: 0.5 + dx * warp + Math.sin(uv.y * Math.PI * 6) * 0.006, y: 0.5 + dy * warp }
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
    if (!best || err < best.err) best = { px, err, got }
  }
  return best
}

const landing = landingColumn()
console.log(`probe: line at x=${LINE_X}, centre row`)
console.log(
  `  expected landing column = ${landing.px}px (offset ${(landing.px - LINE_X).toFixed(1)}px, residual ${landing.err.toFixed(5)})\n`
)

for (const [mw, mh] of SIZES) {
  const map = buildDisplacementMap({
    width: mw,
    height: mh,
    fragment,
    userWidth: W,
    userHeight: H,
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${displacementFilter({ id: 'crt', map: map.dataURI, width: W, height: H, scale: map.scale })}
  </defs>
  <rect width="${W}" height="${H}" fill="#000"/>
  <g filter="url(#crt)">
    <rect x="${LINE_X - 1}" y="0" width="2" height="${H}" fill="#fff"/>
  </g>
</svg>
`
  writeFileSync(join(dir, `probe-${mw}x${mh}.svg`), svg)
  console.log(`  ${String(mw).padStart(4)}x${String(mh).padEnd(4)} scale=${map.scale.toFixed(2)}  written`)
}

console.log(`\nnow read the landing column of each in the browser`)
