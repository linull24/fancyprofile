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
//
// The camera, the keyframes and the warp map are style-independent and built
// once here; `buildScene` is exported so that `verify` can rebuild every sun
// style without writing anything.
//
// One sun style carries a second, unrelated clock: the `mandala` turns once
// every 24s, declared with the rest of its paint in `scene.mjs`. The two are
// deliberately not in step — see the note there — and neither has to know about
// the other.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDisplacementMap } from './displacement.mjs'
import { H, HORIZON, SUN_STYLES, W, gridPath, scene } from './scene.mjs'
import { el, svgDocument } from './svg.mjs'

export const SCENE_DIR = join(import.meta.dirname, '..', 'scenes')

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

/**
 * The committed file name for a sun style. `bands` is the README banner; the
 * alternates are siblings so that rendering one can never overwrite the banner.
 * @param {typeof SUN_STYLES[number]} sunStyle
 */
export function sceneFileName(sunStyle) {
  return sunStyle === 'bands' ? 'night-drive.svg' : `night-drive-${sunStyle}.svg`
}

/** @returns {{name: string, contents: string}} */
export function buildScene({ sunStyle = 'bands' } = {}) {
  if (!SUN_STYLES.includes(sunStyle)) {
    throw new Error(`unknown sun style "${sunStyle}" — expected one of ${SUN_STYLES.join(', ')}`)
  }
  const contents = svgDocument({
    width: W,
    height: H,
    ...scene({
      warp: { map: warp.dataURI, scale: warp.scale },
      rungs: rungElement,
      sunStyle,
    }),
  })
  return { name: sceneFileName(sunStyle), contents }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  //   npm run scene -- --sun=eclipse   ->  scenes/night-drive-eclipse.svg
  const sunArg = process.argv.find((a) => a.startsWith('--sun='))
  const sunStyle = sunArg ? sunArg.slice('--sun='.length) : 'bands'
  if (!SUN_STYLES.includes(sunStyle)) {
    console.error(`--sun must be one of ${SUN_STYLES.join(', ')} (got "${sunStyle}")`)
    process.exit(2)
  }

  const { name, contents } = buildScene({ sunStyle })
  mkdirSync(SCENE_DIR, { recursive: true })
  writeFileSync(join(SCENE_DIR, name), contents)

  console.log(`scenes/${name}  ${(Buffer.byteLength(contents) / 1024).toFixed(1)}kB  [sun: ${sunStyle}]`)
  console.log(`  ${RUNGS} rungs · ${FRAMES} keyframes · ${LOOP_SECONDS}s loop · z ${Z_NEAR}–${Z_FAR.toFixed(2)}`)
  console.log(`  warp map ${(warp.dataURI.length / 1024).toFixed(1)}kB`)
}
