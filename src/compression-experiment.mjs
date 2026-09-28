// How small can the displacement map get before the warp visibly degrades?
//
// The map is 98% of the SVG's bytes, so this is the only lever that matters
// (svgo's preset buys 1.3% on the files that count). Two independent knobs:
//
//   resolution — the field is low-frequency, and feImage scales the PNG up to
//                the filter's user space, so the browser interpolates for free
//   channels   — 3 (RGB) instead of 4 (RGBA); the alpha channel is constant 255
//
// Quality is measured in the browser against the full-resolution reference,
// not eyeballed.
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

// The reference is the current committed pipeline output: full res, RGBA.
//
// One variable per group. The channel variant is deliberately kept out of the
// resolution sweep: RGB vs RGBA turns out to change Chrome's rasterisation by
// ~2.7% of pixels even though the decoded data is byte-identical (measured —
// see docs/findings-github-svg.md), which would otherwise be confounded with
// the resolution effect.
const VARIANTS = [
  { id: 'ref-800x400-rgba', mw: 800, mh: 400, channels: 4, reference: true },
  { id: 'res-400x200-rgba', mw: 400, mh: 200, channels: 4 },
  { id: 'res-200x100-rgba', mw: 200, mh: 100, channels: 4 },
  { id: 'res-100x50-rgba', mw: 100, mh: 50, channels: 4 },
  { id: 'res-50x25-rgba', mw: 50, mh: 25, channels: 4 },
  { id: 'res-25x13-rgba', mw: 25, mh: 13, channels: 4 },
  { id: 'chan-800x400-rgb', mw: 800, mh: 400, channels: 3, group: 'channels' },
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
    // Displacement is expressed in canvas px, so a coarser map produces a
    // blurrier warp rather than a weaker one.
    userWidth: W,
    userHeight: H,
  })

  // feImage is sized in the *filter's* user space, so a smaller PNG is scaled up
  // to cover the canvas. filterUnits/primitiveUnits stay in canvas pixels.
  const svg = svgDocument({
    defs: sceneDefs({
      extra: displacementFilter({ id: 'crt', map: map.dataURI, width: W, height: H, scale: map.scale }),
    }),
    body: `<g filter="url(#crt)">${sceneBody()}</g>`,
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

// A stacked comparison, because the pixel metric is hypersensitive on this
// scene: it is full of 1.2px grid lines, so a sub-pixel shift in the warp
// rewrites whole lines and reads as a large percentage while looking identical.
const compare = `<!doctype html>
<meta charset="utf-8">
<title>displacement map compression</title>
<style>
  body { margin:0; background:#111; color:#ddd; font:13px/1.5 ui-monospace,monospace }
  figure { margin:0; padding:12px 16px; border-bottom:1px solid #333 }
  figcaption { margin-bottom:6px; color:#8ab }
  img { display:block; width:800px; height:400px }
</style>
${rows
  .map(
    (r) => `<figure>
  <figcaption>${r.id} — map ${r.mapPx} ${r.channels}ch · ${r.mapKB}kB map / ${r.svgKB}kB svg</figcaption>
  <img src="./${r.id}.svg" width="800" height="400">
</figure>`
  )
  .join('\n')}
`
writeFileSync(join(dir, 'compare.html'), compare)

console.log('### displacement map size\n')
console.log('variant              map px      ch   map kB   svg kB   scale')
for (const r of rows) {
  console.log(
    `${r.id.padEnd(20)} ${r.mapPx.padEnd(11)} ${String(r.channels).padEnd(4)} ` +
      `${String(r.mapKB).padStart(6)}   ${String(r.svgKB).padStart(6)}   ${String(r.scale).padStart(6)}` +
      (r.reference ? '   <- reference' : '')
  )
}
console.log(`\nwritten under experiments/compression/ — now measure quality in the browser`)
