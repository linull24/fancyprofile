// The background, composed as layers.
//
// Layering is the point, not an implementation detail. An earlier revision put
// one filter over the whole canvas, which meant the moon could not be exempt
// from the displacement — it warped with everything else. The scene is now
// built so a filter can be applied to a subset:
//
//   sky ─ stars ─ moon ─ ridge ─ [ ground: floor + grid ]
//                                     ^ only this group can take a filter
//
// The moon, ridge and sky always render clean. That also makes the warp read as
// what it physically is — a distortion of the ground plane — rather than as a
// lens over the whole image.
import {
  el,
  feDisplacementMap,
  feImage,
  filter,
  linearGradient,
  path,
  radialGradient,
  ridgePath,
} from './svg.mjs'

export const W = 800
export const H = 400
export const HORIZON = 250

// Sits just above the horizon so a wide cap clears the ridge line — the ridge
// peaks reach roughly y=226, and anything of the disc below that is hidden.
const MOON = { x: W / 2, y: HORIZON - 6, r: 92 }

export const PALETTE = {
  skyTop: '#12002e',
  skyMid: '#4a1a6b',
  skyLow: '#c9186b',
  moonTop: '#ffe14d',
  moonMid: '#ff9a3c',
  moonLow: '#ff2975',
  moonGlow: '#ff7a3c',
  ridgeFar: '#3a1263',
  ridgeNear: '#210a3d',
  floorTop: '#2a0a3d',
  floorLow: '#0b0116',
  grid: '#ff2e88',
  star: '#ffffff',
}

// Seeded so committed assets are byte-stable across runs.
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
}

// -------------------------------------------------------------------- layers

function sky() {
  return el('rect', { x: 0, y: 0, width: W, height: HORIZON + 2, fill: 'url(#sky)' })
}

function stars({ count = 80, seed = 20260928 } = {}) {
  const rand = lcg(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(
      el('circle', {
        cx: (rand() * W).toFixed(1),
        cy: (rand() * (HORIZON - 90)).toFixed(1),
        r: (0.4 + rand() * 1.1).toFixed(2),
        fill: PALETTE.star,
        opacity: (0.25 + rand() * 0.6).toFixed(2),
      })
    )
  }
  return out.join('')
}

/**
 * Bands cut out of the disc, widening downwards.
 *
 * Anchored to the moon's own centre, not to its bottom edge: only the cap above
 * HORIZON is ever visible, so bands placed below the centre lines up with the
 * part that the ground immediately hides.
 */
function moonBands() {
  const bars = []
  for (let i = 0; i < 7; i++) {
    bars.push(
      el('rect', {
        x: MOON.x - MOON.r - 4,
        y: (MOON.y - 48 + i * 9).toFixed(1),
        width: MOON.r * 2 + 8,
        height: (2 + i * 1.1).toFixed(1),
        fill: '#000',
      })
    )
  }
  return bars.join('')
}

/** Drawn clean, never inside a filtered group. */
function moon() {
  const halo = el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r + 30, fill: 'url(#moonGlow)' })
  const disc = el('circle', {
    cx: MOON.x,
    cy: MOON.y,
    r: MOON.r,
    fill: 'url(#moon)',
    mask: 'url(#moonMask)',
  })
  return halo + disc
}

function skyline(seed, baseY, amp, steps, fill, freq) {
  const rand = lcg(seed)
  return el('path', {
    d: ridgePath({
      x0: 0,
      x1: W,
      steps,
      baseline: H,
      heightAt: (x) => baseY - Math.abs(Math.sin(x * freq + seed)) * amp - rand() * amp * 0.4,
    }),
    fill,
  })
}

/**
 * The rails. A forward-moving camera does not move these — they converge on the
 * vanishing point whatever the distance — so they stay put while the rungs
 * travel.
 */
export function verticalLines() {
  return Array.from({ length: 19 }, (_, i) =>
    path([
      [W / 2, HORIZON],
      [W / 2 + (i - 9) * 96, H],
    ])
  ).join('')
}

/** Rungs with perspective spacing, bunched towards the vanishing point. */
export function staticHorizontals(count = 12) {
  return Array.from({ length: count }, (_, i) => {
    const y = HORIZON + (H - HORIZON) * Math.pow((i + 1) / count, 2.2)
    return path([
      [0, y],
      [W, y],
    ])
  }).join('')
}

const GRID_STYLE = { stroke: PALETTE.grid, 'stroke-width': 1.2, fill: 'none', opacity: 0.85 }

/**
 * A grid line element. Exported because the animated scene has to build its own
 * rungs — they carry an <animate> child — and must not drift from the static
 * ones stylistically.
 * @param {{d: string, class?: string, children?: string}} opts
 */
export function gridPath({ d, class: className, children = '' }) {
  return el('path', { class: className, d, ...GRID_STYLE }, children)
}

function ground({ filterId = null, attrs = {}, rungs, rails }) {
  const layers =
    el('rect', { x: 0, y: HORIZON, width: W, height: H - HORIZON, fill: 'url(#floor)' }) +
    // The mask fades the grid out towards the horizon. Without it the far rungs
    // converge to under a pixel apart and read as a smear.
    el(
      'g',
      { mask: 'url(#gridMask)' },
      (rungs ?? gridPath({ class: attrs.class, d: staticHorizontals() })) + (rails ?? gridPath({ d: verticalLines() }))
    )

  return filterId ? el('g', { filter: `url(#${filterId})` }, layers) : layers
}

// --------------------------------------------------------------------- parts

/**
 * The displacement filter, expressed in the same vocabulary as the scene.
 * @param {'href' | 'xlink:href'} [opts.hrefAttr] the legacy spelling still needs
 *   the xlink namespace declared on the document; both render identically.
 */
export function warpFilter({ map, scale, id = 'warp', width = W, height = H, hrefAttr = 'href' }) {
  const image =
    hrefAttr === 'href'
      ? feImage({ href: map, width, height, result: 'map' })
      : el('feImage', { [hrefAttr]: map, width, height, result: 'map' })

  return filter({
    id,
    region: { x: 0, y: 0, width, height },
    primitives: image + feDisplacementMap({ map: 'map', scale }),
  })
}

/**
 * @param {object} [opts]
 * @param {string} [opts.filterDef] markup for a filter the ground will use.
 *   Supplied by the caller so that generating a filter and referencing one stay
 *   independent — experiment 04 needs a turbulence filter that this module has
 *   no reason to know about.
 * @param {string} [opts.extra] any further defs.
 */
export function sceneDefs({ filterDef = '', extra = '' } = {}) {
  return [
    linearGradient({
      id: 'sky',
      stops: [
        [0, PALETTE.skyTop],
        [0.55, PALETTE.skyMid],
        [1, PALETTE.skyLow],
      ],
    }),
    linearGradient({
      id: 'moon',
      stops: [
        [0, PALETTE.moonTop],
        [0.5, PALETTE.moonMid],
        [1, PALETTE.moonLow],
      ],
    }),
    radialGradient({
      id: 'moonGlow',
      stops: [
        [0.62, PALETTE.moonGlow, 0.45],
        [0.78, PALETTE.moonGlow, 0.14],
        [1, PALETTE.moonGlow, 0],
      ],
    }),
    linearGradient({
      id: 'floor',
      stops: [
        [0, PALETTE.floorTop],
        [1, PALETTE.floorLow],
      ],
    }),
    el(
      'mask',
      { id: 'moonMask' },
      el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }) +
        el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r, fill: '#fff' }) +
        moonBands()
    ),
    // Grid fade: hidden at the horizon, opaque by y≈277. Near the vanishing
    // point the rungs are under a pixel apart, so they must dissolve rather
    // than pile up — but the fade has to stay short or it leaves a dead band
    // between the ridge line and the first visible rung.
    linearGradient({
      id: 'gridFade',
      stops: [
        [0, '#000'],
        [0.18, '#fff'],
        [1, '#fff'],
      ],
    }),
    el(
      'mask',
      { id: 'gridMask', maskUnits: 'userSpaceOnUse', x: 0, y: HORIZON, width: W, height: H - HORIZON },
      el('rect', { x: 0, y: HORIZON, width: W, height: H - HORIZON, fill: 'url(#gridFade)' })
    ),
    filterDef,
    extra,
  ]
    .filter(Boolean)
    .join('')
}

/**
 * @param {object} [opts]
 * @param {string | null} [opts.filterId] wrap only the ground group in this
 *   filter. Everything above the horizon — moon included — renders clean.
 */
export function sceneBody({ filterId = null, groundAttrs = {}, rungs, rails, moonExtra = '' } = {}) {
  return [
    sky(),
    stars(),
    moon(),
    moonExtra,
    // Kept low on purpose: a taller ridge swallows the moon's banded half.
    skyline(3, HORIZON + 2, 26, 16, PALETTE.ridgeFar, 0.03),
    skyline(11, HORIZON + 8, 16, 22, PALETTE.ridgeNear, 0.043),
    ground({ filterId, attrs: groundAttrs, rungs, rails }),
  ].join('')
}

/**
 * Both halves of the document. Pass `warp` for the usual case (a displacement
 * map on the ground), or `filterDef` + `filterId` to supply your own filter.
 */
export function scene({
  warp = null,
  filterDef = '',
  filterId = null,
  extraDefs = '',
  groundAttrs = {},
  rungs,
  rails,
  moonExtra = '',
  id = 'warp',
} = {}) {
  const def = filterDef || (warp ? warpFilter({ ...warp, id }) : '')
  return {
    defs: sceneDefs({ filterDef: def, extra: extraDefs }),
    body: sceneBody({ filterId: filterId ?? (warp ? id : null), groundAttrs, rungs, rails, moonExtra }),
  }
}
