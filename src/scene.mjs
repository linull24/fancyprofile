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
import { mandalaPath } from './sun-mandala.mjs'

export const W = 800
export const H = 400
export const HORIZON = 250

// Sits just above the horizon so a wide cap clears the ridge line — the ridge
// peaks reach roughly y=226, and anything of the disc below that is hidden.
// Named `MOON` for historical reasons and because the shipped ids (`#moon`,
// `#moonMask`) are part of the committed assets; it is the scene's sun disc.
const MOON = { x: W / 2, y: HORIZON - 6, r: 92 }

/**
 * How the disc is drawn. `bands` is the shipped look and the default, so the
 * committed assets stay byte-identical; the others are alternate stylings of
 * the same geometry — same centre, same radius, same occlusion by the ridge.
 *
 * `eclipse` is the literal black sun: an unlit disc, a bright rim where the
 * chromosphere shows, and a corona falling off outwards.
 *
 * `mandala` is the one style that is not drawn here at all — its outline is a
 * traced asset (see `sun-mandala.mjs`) rather than a construction, and it is
 * also the only element in the banner that moves on its own.
 * @type {readonly ['bands', 'eclipse', 'rays', 'rings', 'mandala']}
 */
export const SUN_STYLES = /** @type {const} */ (['bands', 'eclipse', 'rays', 'rings', 'mandala'])

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
  // Only the eclipse style uses these. The core is the palette's darkest ink
  // rather than #000: pure black turns the disc into a hole punched in the sky.
  sunCore: '#0b0116',
  corona: '#ffd24d',
  ray: '#ff2975',
  // The mandala's body is the one sun that is not painted with the scene's
  // amber ramp — it is purple. Its *light* is not: the halo it throws is the
  // same sunlight the other styles radiate (`corona` / `moonGlow` / `moonLow`
  // below), because a purple disc that glowed purple would read as a lit
  // sticker, not as a sun. The ramp was picked by rendering it in the scene, on
  // a magenta sky, not on a swatch.
  mandalaTop: '#b06cf0',
  mandalaMid: '#7b2cbf',
  mandalaLow: '#4c1d95',
}

/**
 * The mandala outline, mapped onto the disc once, at load.
 *
 * One decimal of the scene's own units is 0.05 units of possible error — half
 * what the trace already deviates from a true circle, and a twentieth of a
 * pixel in the rendered banner. Two more decimals would cost 1.4kB to describe
 * a difference no renderer can show; none at all facets the outer circle
 * visibly at 2x.
 */
const MANDALA = mandalaPath({ x: MOON.x, y: MOON.y, r: MOON.r, precision: 1 })

/**
 * One turn. Slow on purpose: the grid's loop is 1.8s, and the two are
 * deliberately unrelated — a sun that pulsed in step with the travel would read
 * as part of the camera, not as a thing out there turning on its own.
 */
const MANDALA_SPIN_SECONDS = 24

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
function moon({ style }) {
  if (style === 'eclipse') return eclipseSun()
  if (style === 'mandala') return mandalaSun()
  const halo = el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r + 30, fill: 'url(#moonGlow)' })
  const disc = el('circle', {
    cx: MOON.x,
    cy: MOON.y,
    r: MOON.r,
    fill: 'url(#moon)',
    mask: 'url(#moonMask)',
  })
  // Rays go behind the disc, so the wedge that would cross the centre is hidden
  // by the body — they read as light escaping from around it, not as a pinwheel.
  return (style === 'rays' ? sunRays() : '') + halo + disc
}

/**
 * The mandala: a traced ornament, recoloured purple, turning about its centre.
 *
 * There is no `moonMask` here, and that is the point of the shape. Every other
 * style is a disc that the mask cuts holes out of; this outline already carries
 * its own holes, because its subpaths wind against each other. It also needs no
 * clipping to the disc: its outer boundary *is* the disc, by construction —
 * `mandalaPath` fitted that circle and scaled the whole trace onto it.
 *
 * What this draws is a rectangle painted with the purple ramp and *shaped* by a
 * mask whose content turns. Painting the path directly is the obvious thing to
 * write and it is wrong: a paint server is resolved in the user space of the
 * element that references it, so a `userSpaceOnUse` ramp inside a rotating
 * group rotates with that group. The sun visibly darkened as it went round — a
 * pixel on the rim read #a058e1 at 0° and #5d22a4 at 90° — because the ramp was
 * turning too. Keeping the paint on a still element and the motion in the mask
 * separates the two.
 *
 * The turn is declared in SMIL rather than CSS because it needs a centre.
 * `rotate(a cx cy)` states one outright; `transform: rotate()` would need
 * `transform-box` and `transform-origin` to agree on the same point, and those
 * do not default the same way across engines.
 */
function mandalaSun() {
  const glow = el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r + 26, fill: 'url(#mandalaLight)' })
  const disc = el('rect', {
    x: MOON.x - MOON.r,
    y: MOON.y - MOON.r,
    width: MOON.r * 2,
    height: MOON.r * 2,
    fill: 'url(#mandalaMark)',
    mask: 'url(#mandalaShape)',
  })
  return glow + disc
}

/** One turn of the mandala, as a child of the group it rotates. */
function mandalaSpin() {
  return el('animateTransform', {
    attributeName: 'transform',
    type: 'rotate',
    from: `0 ${MOON.x} ${MOON.y}`,
    to: `360 ${MOON.x} ${MOON.y}`,
    dur: `${MANDALA_SPIN_SECONDS}s`,
    repeatCount: 'indefinite',
  })
}

/**
 * The black sun: no light coming off the face, only a rim and a corona.
 *
 * The corona is a gradient broad enough that the disc covers its inner half, so
 * only the falling-off half is ever visible; that is cheaper and smoother than
 * stroking a blurred ring.
 */
function eclipseSun() {
  const corona = el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r + 34, fill: 'url(#sunCorona)' })
  const rim = el('circle', {
    cx: MOON.x,
    cy: MOON.y,
    r: MOON.r + 1,
    fill: 'none',
    stroke: 'url(#moon)',
    'stroke-width': 2.5,
  })
  const disc = el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r, fill: PALETTE.sunCore })
  return corona + rim + disc
}

/**
 * Wedges radiating from behind the disc. Fixed, not animated: these are light
 * rather than an object, and sweeping a light source around fights the forward
 * travel. The mandala does turn — it has structure, so its rotation reads as a
 * thing spinning, not as the light changing.
 *
 * Angles are generated rather than hand-placed so the ring closes exactly —
 * no seam at 2π.
 */
function sunRays({ count = 24, inner = MOON.r * 0.9, outer = MOON.r * 1.42, half = 0.03 } = {}) {
  const parts = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const at = (r, theta) => [
      (MOON.x + r * Math.cos(theta)).toFixed(1),
      (MOON.y + r * Math.sin(theta)).toFixed(1),
    ]
    parts.push(
      el('path', {
        d: path([at(inner, a - half), at(outer, a), at(inner, a + half)], { close: true, precision: 1 }),
        fill: 'url(#sunRay)',
        opacity: 0.5,
      })
    )
  }
  return parts.join('')
}

/** Concentric gaps, widening outwards. The mirror of the bands, in rings. */
function sunRings({ count = 5 } = {}) {
  const rings = []
  for (let i = 1; i <= count; i++) {
    rings.push(
      el('circle', {
        cx: MOON.x,
        cy: MOON.y,
        r: (MOON.r * (0.2 + i * 0.15)).toFixed(1),
        fill: 'none',
        stroke: '#000',
        'stroke-width': (1.2 + i * 0.8).toFixed(1),
      })
    )
  }
  return rings.join('')
}

/** Whatever the mask punches out of the disc; `eclipse` is solid. */
function sunCutouts(style) {
  if (style === 'bands') return moonBands()
  if (style === 'rings') return sunRings()
  return ''
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
 * Defs that only some sun styles need. Kept out of the common list so the
 * default document is not carrying dead gradients.
 * @param {typeof SUN_STYLES[number]} style
 */
function sunStyleDefs(style) {
  if (style === 'eclipse') {
    // Reaches from inside the disc out past its rim; the visible band is the
    // part beyond r/1.37 ≈ 0.73 of this radius, so that is where the stops sit.
    return [
      radialGradient({
        id: 'sunCorona',
        stops: [
          [0.68, PALETTE.corona, 0],
          [0.74, PALETTE.corona, 0.9],
          [0.88, PALETTE.moonGlow, 0.3],
          [1, PALETTE.moonLow, 0],
        ],
      }),
    ]
  }
  if (style === 'rays') {
    // userSpaceOnUse: every wedge must share one ramp. Per-object bounding boxes
    // would give each ray its own vertical gradient and the ring would band.
    const span = MOON.r * 1.42
    return [
      linearGradient({
        id: 'sunRay',
        gradientUnits: 'userSpaceOnUse',
        x1: MOON.x,
        y1: MOON.y - span,
        x2: MOON.x,
        y2: MOON.y + span,
        stops: [
          [0, PALETTE.moonTop],
          [0.5, PALETTE.moonMid],
          [1, PALETTE.moonLow],
        ],
      }),
    ]
  }
  if (style === 'mandala') {
    const span = MOON.r
    return [
      // userSpaceOnUse for the same reason as the rays, one step further: the
      // shape turns, and an objectBoundingBox gradient would turn *with* it, so
      // the highlight would be glued to the disc instead of coming from above.
      linearGradient({
        id: 'mandalaMark',
        gradientUnits: 'userSpaceOnUse',
        x1: MOON.x,
        y1: MOON.y - span,
        x2: MOON.x,
        y2: MOON.y + span,
        stops: [
          [0, PALETTE.mandalaTop],
          [0.5, PALETTE.mandalaMid],
          [1, PALETTE.mandalaLow],
        ],
      }),
      // The light the disc throws: the scene's own sun light, not a purple
      // bloom. It is drawn at corona strength just outside the rim, where the
      // eye reads "this thing is emitting", and it reaches *inside* the disc on
      // purpose — the outline is a lattice, so the holes are where the light
      // shows through, and they would otherwise frame a dark hole.
      //
      // The circle is 118 across a 92 disc, so the rim sits at 0.78 of this
      // radius; that is where the peak belongs.
      radialGradient({
        id: 'mandalaLight',
        stops: [
          [0, PALETTE.corona, 0.18],
          [0.62, PALETTE.corona, 0.42],
          [0.78, PALETTE.moonGlow, 0.72],
          [0.88, PALETTE.moonLow, 0.16],
          [1, PALETTE.moonLow, 0],
        ],
      }),
      // The shape, and the only thing in the banner that moves on its own. It
      // lives in a mask so that the paint above can stay still; see the note on
      // `mandalaSun`.
      el('mask', { id: 'mandalaShape' }, el('g', {}, mandalaSpin() + el('path', { d: MANDALA.d, fill: '#fff' }))),
    ]
  }
  return []
}

/**
 * Which of the disc's shared defs a style actually paints with.
 *
 * Written down rather than assumed, because a gradient nobody references is the
 * one kind of dead weight a hand-built document has no excuse for: it costs
 * bytes and a parse in every renderer, and it cannot be seen to be wrong. The
 * mandala paints its own purple and masks nothing, and the eclipse paints only
 * the rim — between them they are the reason this table exists.
 * @type {Record<typeof SUN_STYLES[number], string[]>}
 */
const DISC_DEFS = {
  bands: ['moon', 'moonGlow', 'moonMask'],
  eclipse: ['moon'],
  rays: ['moon', 'moonGlow', 'moonMask'],
  rings: ['moon', 'moonGlow', 'moonMask'],
  mandala: [],
}

function assertSunStyle(style) {
  if (!SUN_STYLES.includes(style)) {
    throw new Error(`unknown sun style "${style}" — expected one of ${SUN_STYLES.join(', ')}`)
  }
  return style
}

/**
 * @param {object} [opts]
 * @param {string} [opts.filterDef] markup for a filter the ground will use.
 *   Supplied by the caller so that generating a filter and referencing one stay
 *   independent — experiment 04 needs a turbulence filter that this module has
 *   no reason to know about.
 * @param {string} [opts.extra] any further defs.
 * @param {typeof SUN_STYLES[number]} [opts.sunStyle]
 */
export function sceneDefs({ filterDef = '', extra = '', sunStyle = 'bands' } = {}) {
  assertSunStyle(sunStyle)
  const used = new Set(DISC_DEFS[sunStyle])
  return [
    linearGradient({
      id: 'sky',
      stops: [
        [0, PALETTE.skyTop],
        [0.55, PALETTE.skyMid],
        [1, PALETTE.skyLow],
      ],
    }),
    used.has('moon') &&
      linearGradient({
        id: 'moon',
        stops: [
          [0, PALETTE.moonTop],
          [0.5, PALETTE.moonMid],
          [1, PALETTE.moonLow],
        ],
      }),
    used.has('moonGlow') &&
      radialGradient({
        id: 'moonGlow',
        stops: [
          [0.62, PALETTE.moonGlow, 0.45],
          [0.78, PALETTE.moonGlow, 0.14],
          [1, PALETTE.moonGlow, 0],
        ],
      }),
    ...sunStyleDefs(sunStyle),
    linearGradient({
      id: 'floor',
      stops: [
        [0, PALETTE.floorTop],
        [1, PALETTE.floorLow],
      ],
    }),
    used.has('moonMask') &&
      el(
        'mask',
        { id: 'moonMask' },
        el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }) +
          el('circle', { cx: MOON.x, cy: MOON.y, r: MOON.r, fill: '#fff' }) +
          sunCutouts(sunStyle)
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
 * @param {typeof SUN_STYLES[number]} [opts.sunStyle]
 */
export function sceneBody({ filterId = null, groundAttrs = {}, rungs, rails, sunStyle = 'bands' } = {}) {
  assertSunStyle(sunStyle)
  return [
    sky(),
    stars(),
    moon({ style: sunStyle }),
    // Kept low on purpose: a taller ridge swallows the moon's banded half.
    skyline(3, HORIZON + 2, 26, 16, PALETTE.ridgeFar, 0.03),
    skyline(11, HORIZON + 8, 16, 22, PALETTE.ridgeNear, 0.043),
    ground({ filterId, attrs: groundAttrs, rungs, rails }),
  ].join('')
}

/**
 * Both halves of the document. Pass `warp` for the usual case (a displacement
 * map on the ground), or `filterDef` + `filterId` to supply your own filter.
 *
 * @param {object} [opts]
 * @param {typeof SUN_STYLES[number]} [opts.sunStyle] how the sun disc is drawn.
 */
export function scene({
  warp = null,
  filterDef = '',
  filterId = null,
  extraDefs = '',
  groundAttrs = {},
  rungs,
  rails,
  sunStyle = 'bands',
  id = 'warp',
} = {}) {
  const def = filterDef || (warp ? warpFilter({ ...warp, id }) : '')
  return {
    defs: sceneDefs({ filterDef: def, extra: extraDefs, sunStyle }),
    body: sceneBody({ filterId: filterId ?? (warp ? id : null), groundAttrs, rungs, rails, sunStyle }),
  }
}
