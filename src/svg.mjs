// A small SVG builder.
//
// Deliberately thin: it emits strings, keeps no tree, and adds no renderer
// abstraction. What it does buy is that the two classes of bug this project has
// actually hit become unrepresentable —
//
//   * malformed path data (the ridge silhouettes were silently absent from
//     every frame because the path opened with a coordinate pair instead of a
//     moveto), and
//   * unescaped attribute values.
//
// Attribute names are passed through verbatim, so they must be written the way
// SVG spells them: kebab-case where SVG uses kebab (`stroke-width`,
// `color-interpolation-filters`) and camelCase where SVG uses camel (`viewBox`,
// `baseFrequency`). No name mangling, because guessing wrong is silent.
//
// Output is compact rather than indented: these files are web assets, and the
// markup is meant to be read through the source that generated it.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, (c) => ESCAPES[c])
}

export function attrs(map) {
  const out = []
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === null || value === false) continue
    out.push(`${key}="${escapeAttr(value)}"`)
  }
  return out.join(' ')
}

/** @param {string | string[] | null} [children] */
export function el(name, attributes = {}, children = '') {
  const open = `<${name}${Object.keys(attributes).length ? ' ' + attrs(attributes) : ''}`
  const kids = Array.isArray(children) ? children.filter(Boolean).join('') : children || ''
  return kids ? `${open}>${kids}</${name}>` : `${open}/>`
}

const round = (n, p) => {
  const f = 10 ** p
  return Math.round(n * f) / f
}

/**
 * Path data from a point list. The moveto is not optional and not the caller's
 * job — an SVG path that does not open with one is an error, and browsers drop
 * the whole element without warning.
 *
 * @param {[number, number][]} points
 * @param {{close?: boolean, precision?: number}} [opts]
 */
export function path(points, { close = false, precision = 2 } = {}) {
  if (!points.length) return ''
  const [head, ...rest] = points
  const fmt = ([x, y]) => `${round(x, precision)},${round(y, precision)}`
  return `M${fmt(head)}${rest.map((p) => ` L${fmt(p)}`).join('')}${close ? ' Z' : ''}`
}

/**
 * A polyline through a series of x samples, closed down to a baseline — the
 * shape of a skyline.
 * @param {(x: number) => number} heightAt
 */
export function ridgePath({ x0, x1, steps, heightAt, baseline, precision = 2 }) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    points.push([x, heightAt(x)])
  }
  points.push([x1, baseline], [x0, baseline])
  return path(points, { close: true, precision })
}

// --------------------------------------------------------------------- paint

/** @param {[number, string, number?][]} stops offset, colour, opacity */
export function linearGradient({ id, x1 = 0, y1 = 0, x2 = 0, y2 = 1, stops, ...rest }) {
  return el(
    'linearGradient',
    { id, x1, y1, x2, y2, ...rest },
    stops.map(([offset, color, opacity]) => el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }))
  )
}

export function radialGradient({ id, cx = 0.5, cy = 0.5, r = 0.5, stops, ...rest }) {
  return el(
    'radialGradient',
    { id, cx, cy, r, ...rest },
    stops.map(([offset, color, opacity]) => el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }))
  )
}

// -------------------------------------------------------------------- filter

export function filter({ id, region, primitives, ...rest }) {
  const box = region
    ? { filterUnits: 'userSpaceOnUse', x: region.x, y: region.y, width: region.width, height: region.height }
    : {}
  return el(
    'filter',
    // sRGB is not optional for displacement: the default linearRGB would put
    // the encoded offsets through a transfer curve and shear the field.
    { id, ...box, 'color-interpolation-filters': 'sRGB', ...rest },
    primitives
  )
}

export function feImage({ href, width, height, result }) {
  return el('feImage', { href, width, height, result })
}

export function feDisplacementMap({ source = 'SourceGraphic', map, scale, xChannel = 'R', yChannel = 'G', result }) {
  return el('feDisplacementMap', {
    in: source,
    in2: map,
    scale: round(scale, 3),
    xChannelSelector: xChannel,
    yChannelSelector: yChannel,
    result,
  })
}

export function feTurbulence({ type = 'fractalNoise', baseFrequency, numOctaves = 3, seed, result }) {
  return el('feTurbulence', { type, baseFrequency, numOctaves, seed, result })
}

export function feGaussianBlur({ source = 'SourceGraphic', stdDeviation, result }) {
  return el('feGaussianBlur', { in: source, stdDeviation, result })
}

export function feColorMatrix({ source = 'SourceGraphic', type = 'matrix', values, result }) {
  return el('feColorMatrix', { in: source, type, values, result })
}

export function feComposite({ operator = 'over', source, source2, result }) {
  return el('feComposite', { operator, in: source, in2: source2, result })
}

// ------------------------------------------------------------------ document

/**
 * @param {object} opts
 * @param {boolean} [opts.xlink] declare the xlink namespace. Only needed for
 *   documents that use `xlink:href`; the modern `href` needs no declaration and
 *   renders identically, so this stays off by default and exists for the
 *   experiment that compares the two spellings.
 */
export function svgDocument({ width, height, viewBox, defs = '', body = '', style = '', xlink = false }) {
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      ...(xlink ? { 'xmlns:xlink': 'http://www.w3.org/1999/xlink' } : {}),
      width,
      height,
      viewBox: viewBox || `0 0 ${width} ${height}`,
    },
    [style ? el('style', {}, style) : '', defs ? el('defs', {}, defs) : '', body]
  )
}
