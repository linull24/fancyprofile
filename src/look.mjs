// Art direction: how much ground warp is too much?
//
// The first experiment set used a barrel coefficient of 0.22, chosen to make the
// displacement *measurable* rather than to look good. It pushed edge pixels
// ~44px, which crossed grid lines over each other and read as a broken render.
//
// This sweep exists so that decision is made by looking, including k=0 so the
// composition can be judged on its own.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDisplacementMap } from './displacement.mjs'
import { OUT_DIR } from './experiments.mjs'
import { H, W, scene } from './scene.mjs'
import { svgDocument } from './svg.mjs'

const warpOf = (k) => (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const f = 1 + k * (dx * dx + dy * dy)
  return { x: 0.5 + dx * f, y: 0.5 + dy * f }
}

const STEPS = [
  { id: 'k000', k: 0, note: 'no warp — composition only' },
  { id: 'k020', k: 0.02, note: 'barely there' },
  { id: 'k060', k: 0.06, note: 'current default' },
  { id: 'k120', k: 0.12, note: 'heavy' },
]

const dir = join(OUT_DIR, 'look')
mkdirSync(dir, { recursive: true })

const rows = []
for (const s of STEPS) {
  const map =
    s.k === 0
      ? null
      : buildDisplacementMap({ width: 200, height: 100, fragment: warpOf(s.k), userWidth: W, userHeight: H })

  const svg = svgDocument({
    width: W,
    height: H,
    ...(map ? scene({ warp: { map: map.dataURI, scale: map.scale } }) : scene()),
  })

  writeFileSync(join(dir, `${s.id}.svg`), svg)
  rows.push({ ...s, svgKB: +(Buffer.byteLength(svg) / 1024).toFixed(1) })
}

// A short stack, so a full-page screenshot stays at native scale — a downscaled
// capture is exactly what made an earlier comparison misleading.
const page = `<!doctype html>
<meta charset="utf-8"><title>ground warp strength</title>
<style>
  body { margin:0; background:#111; color:#ddd; font:12px/1.4 ui-monospace,monospace }
  figure { margin:0; padding:6px 10px }
  figcaption { margin-bottom:4px; color:#8ab }
  img { display:block; width:800px; height:400px }
</style>
${rows
  .map((r) => `<figure><figcaption>${r.id}  k=${r.k}  — ${r.note} · ${r.svgKB}kB</figcaption><img src="./${r.id}.svg"></figure>`)
  .join('\n')}
`
writeFileSync(join(dir, 'index.html'), page)

console.log('### ground warp strength\n')
for (const r of rows) console.log(`  ${r.id}  k=${String(r.k).padEnd(6)} ${String(r.svgKB).padStart(6)}kB   ${r.note}`)
console.log(`\nopen experiments/look/index.html (${rows.length * 425}px tall, native scale in a tall viewport)`)
