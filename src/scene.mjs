// A synthwave scene emitted as plain SVG markup.
//
// This is deliberately hand-rolled rather than pulled from paper.js: the point
// of the experiments is to find out what GitHub will render, and every layer of
// abstraction between the numbers and the markup is a place a sanitizer could
// surprise us. Geometry libraries can come back once the constraints are known.

export const W = 800
export const H = 400
export const HORIZON = 252

const SUN = { x: W / 2, y: 250, r: 104 }

const PALETTE = {
  skyTop: '#12002e',
  skyMid: '#4a1a6b',
  skyLow: '#c9186b',
  sunTop: '#ffd319',
  sunMid: '#ff8c37',
  sunLow: '#ff2975',
  floorTop: '#2a0a3d',
  floorLow: '#0d0118',
  grid: '#ff2e88',
}

// Seeded so the committed assets are byte-stable across runs.
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
}

function sunBands() {
  const bars = []
  for (let i = 0; i < 7; i++) {
    const y = SUN.y + 4 + i * 12
    const h = 2 + i * 1.7
    bars.push(
      `<rect x="${SUN.x - SUN.r - 4}" y="${y.toFixed(1)}" width="${SUN.r * 2 + 8}" height="${h.toFixed(1)}" fill="#000"/>`
    )
  }
  return bars.join('\n      ')
}

function ridge(seed, baseY, amp, steps) {
  const rand = lcg(seed)
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W
    const y = baseY - Math.abs(Math.sin(i * 1.7 + seed)) * amp - rand() * amp * 0.4
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `${pts.join(' ')} ${W},${H} 0,${H}`
}

function stars() {
  const rand = lcg(20260928)
  const out = []
  for (let i = 0; i < 70; i++) {
    const x = rand() * W
    const y = rand() * (HORIZON - 60)
    const r = 0.4 + rand() * 1.1
    const o = 0.25 + rand() * 0.6
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`)
  }
  return out.join('\n    ')
}

function grid() {
  const lines = []
  // Horizontals bunch up towards the vanishing point, so step in squared space.
  for (let k = 1; k <= 11; k++) {
    const t = Math.pow(k / 11, 2.2)
    const y = HORIZON + (H - HORIZON) * t
    lines.push(`M0 ${y.toFixed(1)} H${W}`)
  }
  // Verticals are evenly spaced at the bottom edge and converge on the horizon.
  for (let i = -9; i <= 9; i++) {
    lines.push(`M${W / 2} ${HORIZON} L${(W / 2 + i * 96).toFixed(1)} ${H}`)
  }
  return `<path d="${lines.join(' ')}" stroke="${PALETTE.grid}" stroke-width="1.2" opacity="0.85" fill="none"/>`
}

export function sceneDefs({ extra = '' } = {}) {
  return `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PALETTE.skyTop}"/>
      <stop offset="0.55" stop-color="${PALETTE.skyMid}"/>
      <stop offset="1" stop-color="${PALETTE.skyLow}"/>
    </linearGradient>
    <linearGradient id="sunGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PALETTE.sunTop}"/>
      <stop offset="0.5" stop-color="${PALETTE.sunMid}"/>
      <stop offset="1" stop-color="${PALETTE.sunLow}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PALETTE.floorTop}"/>
      <stop offset="1" stop-color="${PALETTE.floorLow}"/>
    </linearGradient>
    <mask id="sunMask">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#000"/>
      <circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="#fff"/>
      ${sunBands()}
    </mask>${extra ? `\n    ${extra}` : ''}`
}

/**
 * @param {object} [opts]
 * @param {string} [opts.sunExtra]   markup injected inside the sun group (animation)
 * @param {string} [opts.gridWrap]   wrapper attributes for the grid group
 * @param {string} [opts.style]      a <style> block to prepend
 */
export function sceneBody({ sunExtra = '', gridAttrs = '' } = {}) {
  return `${stars()}
    <circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="url(#sunGrad)" mask="url(#sunMask)"/>
    ${sunExtra}
    <path d="${ridge(3, HORIZON + 6, 54, 14)}" fill="#2b0b45"/>
    <path d="${ridge(11, HORIZON + 14, 30, 22)}" fill="#1a0530"/>
    <rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#floor)"/>
    <g ${gridAttrs}>${grid()}</g>`
}

/**
 * Standalone SVG document wrapper.
 *
 * `viewBox` is separable from `width`/`height` so a document can render a crop
 * of the scene at a larger size — a magnifier. Filter regions stay in user
 * space, so a cropped view still gets the correctly aligned displacement.
 */
export function svgDocument({ defs = '', body, style = '', width = W, height = H, viewBox = `0 0 ${width} ${height}` }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${viewBox}">
  ${style ? `<style>${style}</style>` : ''}
  <defs>
    ${defs}
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
  ${body}
</svg>
`
}
