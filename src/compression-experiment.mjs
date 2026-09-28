// How small can the displacement map get before the warp visibly degrades?
//
// The map dominates the file, so this is the only lever that matters (svgo's
// preset buys 1.3% on the frames that count). One knob, and its units matter:
// feDisplacementMap's scale is in the filter's user space, so displacement has
// to be expressed in canvas px or a coarser map comes out proportionally
// weaker instead of merely smoother.
//
// Quality is measured in the browser, not eyeballed — see
// docs/findings-github-svg.md for the numbers and for why the pixel metric
// overstates the difference on this scene.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap } from './displacement.mjs'
import { OUT_DIR } from './experiments.mjs'
import { H, W, scene } from './scene.mjs'
import { svgDocument } from './svg.mjs'

// The warp the experiments use — gentle enough not to tear the grid.
const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const f = 1 + 0.06 * (dx * dx + dy * dy)
  return { x: 0.5 + dx * f, y: 0.5 + dy * f }
}

// One variable per group. The channel variant is kept out of the resolution
// sweep: RGB vs RGBA changes Chrome's rasterisation by ~2.7% of pixels even
// though the decoded data is byte-identical, which would confound the result.
const VARIANTS = [
  { id: 'ref-800x400-rgba', mw: 800, mh: 400, channels: 4, reference: true },
  { id: 'res-400x200-rgba', mw: 400, mh: 200, channels: 4 },
  { id: 'res-200x100-rgba', mw: 200, mh: 100, channels: 4 },
  { id: 'res-100x50-rgba', mw: 100, mh: 50, channels: 4 },
  { id: 'res-50x25-rgba', mw: 50, mh: 25, channels: 4 },
  { id: 'res-25x13-rgba', mw: 25, mh: 13, channels: 4 },
  { id: 'chan-800x400-rgb', mw: 800, mh: 400, channels: 3 },
]

const dir = join(OUT_DIR, 'compression')
mkdirSync(dir, { recursive: true })

const rows = []
for (const v of VARIANTS) {
  const map = buildDisplacementMap({
    width: v.mw,
    height: v.mh,
    fragment,
    channels: v.channels,
    userWidth: W,
    userHeight: H,
  })

  const svg = svgDocument({
    width: W,
    height: H,
    ...scene({ warp: { map: map.dataURI, scale: map.scale } }),
  })

  writeFileSync(join(dir, `${v.id}.svg`), svg)
  rows.push({
    id: v.id,
    mapPx: `${v.mw}x${v.mh}`,
    channels: v.channels,
    mapKB: +(map.dataURI.length / 1024).toFixed(1),
    svgKB: +(Buffer.byteLength(svg) / 1024).toFixed(1),
    scale: +map.scale.toFixed(2),
    reference: !!v.reference,
  })
}

console.log('### displacement map size\n')
console.log('variant              map px      ch   map kB   svg kB   scale')
for (const r of rows) {
  console.log(
    `${r.id.padEnd(20)} ${r.mapPx.padEnd(11)} ${String(r.channels).padEnd(4)} ` +
      `${String(r.mapKB).padStart(6)}   ${String(r.svgKB).padStart(6)}   ${String(r.scale).padStart(6)}` +
      (r.reference ? '   <- reference' : '')
  )
}
console.log(`\nwritten under experiments/compression/ — measure in the browser`)
