// Does svgo's preset-default actually break our output?
//
// The survey says several preset plugins are unsafe for filter- and
// animation-heavy SVG, but that was read off the source. This runs it and
// measures, across four configs that disable progressively more:
//
//   a-preset    preset-default, untouched
//   b-no-id     ...minus the three that touch <defs>/ids/hidden elements
//   c-no-anim   ...minus the four with no SMIL awareness
//   d-safe      c-no-anim plus removeScripts (the actual GitHub-safe plugin,
//               which is NOT in the preset)
//
// Two independent signals, because they catch different failures:
//   - dangling references: a url(#x) / in2="x" with no matching id or result.
//     Catches id rewriting without needing to render anything.
//   - rendered pixels: done separately in the browser, since a deleted
//     animation base state leaves references intact but changes behaviour.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { optimize } from 'svgo'

import { OUT_DIR } from './experiments.mjs'

const SAFE_OVERRIDES = {
  cleanupIds: false,
  removeUselessDefs: false,
  removeHiddenElems: false,
  convertShapeToPath: false,
  convertEllipseToCircle: false,
  convertTransform: false,
  cleanupNumericValues: false,
}

const CONFIGS = [
  { id: 'a-preset', plugins: ['preset-default'] },
  {
    id: 'b-no-id',
    plugins: [
      {
        name: 'preset-default',
        params: { overrides: { cleanupIds: false, removeUselessDefs: false, removeHiddenElems: false } },
      },
    ],
  },
  { id: 'c-no-anim', plugins: [{ name: 'preset-default', params: { overrides: SAFE_OVERRIDES } }] },
  {
    id: 'd-safe',
    plugins: [{ name: 'preset-default', params: { overrides: SAFE_OVERRIDES } }, 'removeScripts'],
  },
]

// Filter primitives that take a keyword rather than a reference.
const KEYWORDS = new Set([
  'SourceGraphic',
  'SourceAlpha',
  'BackgroundImage',
  'BackgroundAlpha',
  'FillPaint',
  'StrokePaint',
])

function analyze(svg) {
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
  const results = new Set([...svg.matchAll(/\sresult="([^"]+)"/g)].map((m) => m[1]))

  const refs = new Set()
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) refs.add(m[1])
  for (const m of svg.matchAll(/\s(?:in|in2)="([^"]+)"/g)) {
    if (!KEYWORDS.has(m[1])) refs.add(m[1])
  }

  const dangling = [...refs].filter((r) => !ids.has(r) && !results.has(r))

  return {
    ids,
    dangling,
    counts: {
      animate: (svg.match(/<animate/g) || []).length,
      feImage: (svg.match(/<feImage/g) || []).length,
      feDisplacementMap: (svg.match(/<feDisplacementMap/g) || []).length,
      feTurbulence: (svg.match(/<feTurbulence/g) || []).length,
      mask: (svg.match(/<mask/g) || []).length,
      styleTag: (svg.match(/<style/g) || []).length,
      keyframes: (svg.match(/@keyframes/g) || []).length,
      base64Chars: (svg.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] || '').length,
    },
  }
}

const sources = readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort()

const root = join(OUT_DIR, 'svgo')
const rows = []

for (const config of CONFIGS) {
  const dir = join(root, config.id)
  mkdirSync(dir, { recursive: true })

  for (const name of sources) {
    const original = readFileSync(join(OUT_DIR, name), 'utf8')
    const before = analyze(original)

    let optimized
    try {
      optimized = optimize(original, { path: name, plugins: config.plugins, js2svg: { pretty: false } }).data
    } catch (err) {
      rows.push({ config: config.id, name, error: err.message })
      continue
    }
    writeFileSync(join(dir, name), optimized)

    const after = analyze(optimized)
    rows.push({
      config: config.id,
      name,
      bytes: `${Buffer.byteLength(original)} -> ${Buffer.byteLength(optimized)}`,
      delta: `${(((Buffer.byteLength(optimized) - Buffer.byteLength(original)) / Buffer.byteLength(original)) * 100).toFixed(1)}%`,
      dangling: after.dangling,
      becameDangling: after.dangling.length > before.dangling.length,
      idsRenamed: [...before.ids].filter((i) => !after.ids.has(i)),
      lost: Object.entries(after.counts)
        .filter(([k, v]) => v < before.counts[k])
        .map(([k, v]) => `${k}:${before.counts[k]}->${v}`),
      base64Shrank: after.counts.base64Chars < before.counts.base64Chars,
    })
  }
}

console.log('### static analysis\n')
for (const r of rows) {
  if (r.error) {
    console.log(`${r.config.padEnd(10)} ${r.name.padEnd(24)} ERROR ${r.error}`)
    continue
  }
  const flags = []
  if (r.dangling.length) flags.push(`DANGLING(${r.dangling.join(',')})`)
  if (r.idsRenamed.length) flags.push(`ids-renamed(${r.idsRenamed.slice(0, 4).join(',')}${r.idsRenamed.length > 4 ? ',…' : ''})`)
  if (r.lost.length) flags.push(`lost(${r.lost.join(' ')})`)
  if (r.base64Shrank) flags.push('base64-shrank')
  console.log(
    `${r.config.padEnd(10)} ${r.name.padEnd(24)} ${r.bytes.padEnd(18)} ${r.delta.padStart(7)}  ${flags.join('  ') || 'clean'}`
  )
}

console.log(`\noptimized files written under experiments/svgo/`)
