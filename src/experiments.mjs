// The GitHub-rendering experiment set, built in memory.
//
// Each file isolates one capability, so a failure in the README points at a
// single cause rather than "the SVG didn't work":
//
//   01  baseline             — can GitHub render a repo SVG at all?
//   02  SMIL animation       — do declarative animations survive?
//   03  CSS animation        — does an in-document <style> block survive?
//   04  filter, no feImage   — are filter primitives allowed?
//   05  filter + feImage     — the displacement technique, href flavour
//   06  filter + feImage     — same, xlink:href flavour
//
// Every filter here lands on the ground group only. That is the scene's real
// structure and also a tighter experiment: the moon stays crisp in all six, so
// a broken filter reads as a wrong ground rather than a wrong picture.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDisplacementMap } from './displacement.mjs'
import { H, W, scene, warpFilter } from './scene.mjs'
import { el, feDisplacementMap, feTurbulence, filter, svgDocument } from './svg.mjs'

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'experiments')

// A gentle barrel: unmistakable in a pixel diff, nowhere near the 0.22 that
// tore the grid apart.
const fragment = (uv) => {
  const dx = uv.x - 0.5
  const dy = uv.y - 0.5
  const f = 1 + 0.06 * (dx * dx + dy * dy)
  return { x: 0.5 + dx * f, y: 0.5 + dy * f }
}

const doc = (parts) => svgDocument({ width: W, height: H, ...parts })

/**
 * @returns {{files: {name: string; contents: string}[], notes: string[]}}
 */
export function buildExperiments() {
  const files = []
  const notes = []
  const emit = (name, contents) => files.push({ name, contents })

  const map = buildDisplacementMap({ width: 200, height: 100, fragment, userWidth: W, userHeight: H })
  notes.push(
    `displacement map: peak ${map.peak.toFixed(2)}px -> scale ${map.scale.toFixed(2)}, ` +
      `${(map.dataURI.length / 1024).toFixed(1)}kB as base64`
  )

  // --------------------------------------------------------------- 01 baseline
  emit('01-baseline.svg', doc(scene()))

  // ----------------------------------------------------------- 02 SMIL animate
  // A halo pulsing around the moon — on the clean layer, so SMIL is tested
  // independently of the filter.
  const halo = (attrs, children = '') =>
    el('circle', { cx: W / 2, cy: 246, fill: 'none', stroke: '#ffe14d', ...attrs }, children)

  emit(
    '02-smil.svg',
    doc({
      ...scene(),
      body:
        scene().body +
        halo({ r: 130, 'stroke-width': 2, opacity: 0.5 }, [
          el('animate', { attributeName: 'r', values: '130;146;130', dur: '4s', repeatCount: 'indefinite' }),
          el('animate', { attributeName: 'opacity', values: '0.5;0.05;0.5', dur: '4s', repeatCount: 'indefinite' }),
        ].join('')),
    })
  )

  // ------------------------------------------------------------ 03 CSS animate
  emit(
    '03-css.svg',
    doc({
      ...scene({ groundAttrs: { class: 'grid' } }),
      style: `
    @keyframes pulse { 0%,100% { opacity: .3 } 50% { opacity: .85 } }
    @keyframes sweep { from { transform: translateY(0) } to { transform: translateY(26px) } }
    .halo { animation: pulse 4s ease-in-out infinite }
    .grid { animation: sweep 3s linear infinite }
  `,
      body: scene({ groundAttrs: { class: 'grid' } }).body + halo({ class: 'halo', r: 146, 'stroke-width': 3 }),
    })
  )

  // -------------------------------------- 04 feTurbulence + feDisplacementMap
  // No external image: if 05 fails and this renders, feImage is the culprit
  // rather than filters as a class.
  emit(
    '04-turbulence.svg',
    doc(
      scene({
        filterId: 'warp',
        filterDef: filter({
          id: 'warp',
          region: { x: 0, y: 0, width: W, height: H },
          primitives:
            feTurbulence({ baseFrequency: 0.012, numOctaves: 3, seed: 7, result: 'noise' }) +
            feDisplacementMap({ source: 'SourceGraphic', map: 'noise', scale: 26 }),
        }),
      })
    )
  )

  // -------------------------------------------------- 05/06 feImage displacement
  emit('05-feimage.svg', doc(scene({ warp: { map: map.dataURI, scale: map.scale } })))
  emit(
    '06-feimage-xlink.svg',
    doc({
      // 06 declares the legacy namespace its feImage needs.
      xlink: true,
      ...scene({
        filterId: 'warp',
        filterDef: warpFilter({ id: 'warp', map: map.dataURI, scale: map.scale, hrefAttr: 'xlink:href' }),
      }),
    })
  )

  return { files, notes }
}
