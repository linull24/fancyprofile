// The GitHub-rendering experiment set, built in memory.
//
// Each file isolates one capability, so a failure in the README points at a
// single cause rather than "the SVG didn't work":
//
//   01  baseline             — can GitHub render a repo SVG at all?
//   02  SMIL animation       — do declarative animations survive?
//   03  CSS animation        — does an in-document <style> block survive?
//   04  filter, no feImage   — are filter primitives allowed?
//   05  filter + feImage     — the svg-shaders technique, href flavour
//   06  filter + feImage     — same, xlink:href flavour (liquid-glass uses this)
//
// The build is split from the writing so verify.mjs can rebuild without
// touching the working tree.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDisplacementMap, displacementFilter } from './displacement.mjs'
import { H, W, sceneBody, sceneDefs, svgDocument } from './scene.mjs'

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'experiments')

/**
 * @returns {{files: {name: string, contents: string}[], notes: string[]}}
 */
export function buildExperiments() {
  const files = []
  const notes = []
  const emit = (name, contents) => files.push({ name, contents })

  // -------------------------------------------------------------- 01 baseline
  emit('01-baseline.svg', svgDocument({ defs: sceneDefs(), body: sceneBody() }))

  // ---------------------------------------------------------- 02 SMIL animate
  emit(
    '02-smil.svg',
    svgDocument({
      defs: sceneDefs(),
      body: sceneBody({
        sunExtra: `<circle cx="${W / 2}" cy="250" r="104" fill="none" stroke="#ffd319" stroke-width="2" opacity="0.5">
      <animate attributeName="r" values="104;118;104" dur="4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0.05;0.5" dur="4s" repeatCount="indefinite"/>
    </circle>`,
        gridAttrs: 'opacity="1"',
      }),
    })
  )

  // ----------------------------------------------------------- 03 CSS animate
  emit(
    '03-css.svg',
    svgDocument({
      style: `
    @keyframes pulse { 0%,100% { opacity: .25 } 50% { opacity: .75 } }
    @keyframes sweep { from { transform: translateY(0) } to { transform: translateY(24px) } }
    .glow { animation: pulse 4s ease-in-out infinite }
    .grid { animation: sweep 3s linear infinite }
  `,
      defs: sceneDefs(),
      body: sceneBody({
        sunExtra: `<circle class="glow" cx="${W / 2}" cy="250" r="118" fill="none" stroke="#ffd319" stroke-width="3"/>`,
        gridAttrs: 'class="grid"',
      }),
    })
  )

  // ----------------------------------------- 04 feTurbulence + feDisplacementMap
  // No external image involved: if 05 fails and this one renders, feImage is the
  // culprit rather than filters as a class.
  emit(
    '04-turbulence.svg',
    svgDocument({
      defs: sceneDefs({
        extra: `<filter id="turb" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" xChannelSelector="R" yChannelSelector="G" scale="34"/>
    </filter>`,
      }),
      body: `<g filter="url(#turb)">${sceneBody()}</g>`,
    })
  )

  // ----------------------------------------------- 05/06 feImage displacement
  // A CRT-ish barrel warp, the shape a synthwave frame actually wants.
  const fragment = (uv) => {
    const dx = uv.x - 0.5
    const dy = uv.y - 0.5
    const warp = 1 + 0.22 * (dx * dx + dy * dy)
    return {
      x: 0.5 + dx * warp + Math.sin(uv.y * Math.PI * 6) * 0.006,
      y: 0.5 + dy * warp,
    }
  }

  const map = buildDisplacementMap({ width: W, height: H, fragment })
  notes.push(
    `displacement map: peak ${map.peak.toFixed(2)}px -> scale ${map.scale.toFixed(2)}, ` +
      `${(map.dataURI.length / 1024).toFixed(0)}kB as base64`
  )

  const filtered = (id, hrefAttr) =>
    svgDocument({
      defs: sceneDefs({
        extra: displacementFilter({ id, map: map.dataURI, width: W, height: H, scale: map.scale }).replace(
          'href=',
          `${hrefAttr}=`
        ),
      }),
      body: `<g filter="url(#${id})">${sceneBody()}</g>`,
    })

  emit('05-feimage.svg', filtered('crt', 'href'))
  emit('06-feimage-xlink.svg', filtered('crt', 'xlink:href'))

  return { files, notes }
}
