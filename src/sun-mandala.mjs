// The mandala sun: an ornamental disc that is traced, not constructed.
//
// `sun-mandala.path.txt` is an outline verbatim — one `<path>`, 25 subpaths,
// cubics and lines, drawn in a 400x400 box. It is machine output, which means
// it arrives with three properties that are wrong for a banner:
//
//   * an origin and a scale of its own,
//   * three decimals of precision, on a shape that ends up 184 user units wide,
//   * 11kB of text.
//
// So it is not edited — it is *mapped*. The outline is parsed, moved onto the
// scene's disc, and re-emitted at a precision the banner can actually resolve.
// The mapping needs no hand-copied constants: the outer boundary is a circle,
// and the first subpath is its four-cubic approximation, so the centre and
// radius are fitted from the data (and the fit is asserted, because a traced
// circle that is *nearly* a circle would otherwise rotate with a visible wobble
// that no single frame ever shows).
//
// Precision is stated in output units, not source units: 1 decimal of the scene
// is 0.22 of the source's units at this scale — three times coarser than the
// trace, and still finer than one pixel of the rendered banner, which is the
// only place this path is ever seen.
//
// Only absolute M/L/C appear in the data; a command this parser does not
// understand is an error rather than a silently dropped subpath, for the same
// reason `svg.mjs` refuses to guess path syntax.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(import.meta.dirname, 'sun-mandala.path.txt'), 'utf8').trim()

/**
 * How far the outer boundary may stray from a circle, as a fraction of its
 * radius, before this is not the shape the module assumes. A four-cubic circle
 * approximation is off by ~0.03% of the radius on its own, so the bar has to sit
 * above that; it is set at 0.2%, which still rejects the case that matters — an
 * outline whose outer boundary is lobed (a gear, a star), where rotating about
 * the centre would wobble instead of turning.
 */
const FIT_TOLERANCE = 0.002

/** @type {Record<string, number>} numbers each command consumes; unknown commands are rejected. */
const ARITY = { M: 2, L: 2, C: 6, Z: 0 }

const LETTER = /^[A-Za-z]$/
const NUMBER = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?$/

/**
 * Path data to absolute commands, with implicit coordinate repeats expanded.
 * @param {string} data
 * @returns {{cmd: string, points: number[]}[]}
 */
export function parsePathData(data) {
  const tokens = data.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []
  const out = []
  let i = 0

  while (i < tokens.length) {
    const letter = tokens[i]
    if (!LETTER.test(letter)) throw new Error(`path data is malformed at token ${i} ("${letter}")`)
    const cmd = letter.toUpperCase()
    const arity = ARITY[cmd]
    if (arity === undefined) throw new Error(`unsupported path command "${letter}"`)
    const relative = letter !== cmd
    i++

    if (cmd === 'Z') {
      out.push({ cmd, points: [] })
      continue
    }

    let repeat = 0
    while (i < tokens.length && !LETTER.test(tokens[i])) {
      if (i + arity > tokens.length) throw new Error(`path data ends mid-command ("${letter}")`)
      const points = []
      for (let k = 0; k < arity; k++) {
        const value = tokens[i + k]
        if (!NUMBER.test(value)) throw new Error(`path data has a non-number argument ("${value}")`)
        points.push(Number(value))
      }
      // A repeated set after a moveto is a lineto, per the path grammar.
      const effective = repeat > 0 && cmd === 'M' ? 'L' : cmd
      out.push({ cmd: effective, points, relative })
      i += arity
      repeat++
    }
    if (!repeat) throw new Error(`path command "${letter}" has no arguments`)
  }

  return out
}

/** Absolute commands to subpaths of on-curve points (control points dropped). */
function subpaths(commands) {
  const out = []
  for (const { cmd, points } of commands) {
    if (cmd === 'M') out.push([[points[0], points[1]]])
    else if (cmd === 'L') out.at(-1).push([points[0], points[1]])
    else if (cmd === 'C') out.at(-1).push([points[4], points[5]])
  }
  return out
}

/**
 * Least-squares circle through points (Kasa fit).
 * @param {[number, number][]} points
 */
function fitCircle(points) {
  const n = points.length
  const mean = (f) => points.reduce((s, p) => s + f(p), 0) / n
  const mx = mean((p) => p[0])
  const my = mean((p) => p[1])
  // Centred sums keep the normal equations well conditioned for points that all
  // sit near one circle.
  let suu = 0
  let svv = 0
  let suv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (const [x, y] of points) {
    const u = x - mx
    const v = y - my
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  const uc = (0.5 * (suuu + suvv) * svv - 0.5 * (svvv + svuu) * suv) / det
  const vc = (0.5 * (svvv + svuu) * suu - 0.5 * (suuu + suvv) * suv) / det
  const cx = uc + mx
  const cy = vc + my
  // sqrt, not hypot: hypot is not required to be correctly rounded and its
  // implementation has changed between engines, and this fit feeds a path that
  // `verify` compares byte-for-byte between a laptop and CI. The coordinates are
  // hundreds of units, so the scaling hypot exists for has nothing to do here.
  const distance = (p) => Math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2)
  const r = points.reduce((s, p) => s + distance(p), 0) / n
  const maxError = points.reduce((m, p) => Math.max(m, Math.abs(distance(p) - r)), 0)
  return { cx, cy, r, maxError, fitPoints: n }
}

const outline = parsePathData(SOURCE)

/** The disc the outline is drawn on, measured from the outline itself. */
export const SOURCE_DISC = fitCircle(subpaths(outline)[0])

if (!(SOURCE_DISC.maxError / SOURCE_DISC.r < FIT_TOLERANCE)) {
  throw new Error(
    `the outlined disc is not circular (max radial error ${((SOURCE_DISC.maxError / SOURCE_DISC.r) * 100).toFixed(3)}% of the radius, ` +
      `over the ${(FIT_TOLERANCE * 100).toFixed(1)}% allowed); rotating it about the fitted centre would wobble`
  )
}

const round = (n, p) => {
  const f = 10 ** p
  return Math.round(n * f) / f
}

const fmt = (n) => String(Object.is(n, -0) ? 0 : n)

/**
 * The outline in scene coordinates: centred on (x, y), scaled so the traced
 * circle is exactly `r`, rounded to `precision` decimals of the output.
 *
 * Points are emitted *relative* to the previous one, which costs 28% fewer
 * bytes than absolute coordinates here (measured, not assumed: 5.6kB against
 * 7.8kB) because a trace steps a few units at a time. The rounding happens in
 * absolute space first and the deltas are differences of already-rounded
 * points — rounding the deltas directly would let the error walk across 674
 * points and pull the far side of the mandala out of round.
 *
 * A moveto stays absolute, so a relative run never has to jump between
 * subpaths.
 *
 * @param {{x: number, y: number, r: number, precision?: number}} opts
 */
export function mandalaPath({ x, y, r, precision = 1 }) {
  const scale = r / SOURCE_DISC.r
  const map = (px, py) => [
    round(x + (px - SOURCE_DISC.cx) * scale, precision),
    round(y + (py - SOURCE_DISC.cy) * scale, precision),
  ]
  const parts = []
  let previous = null

  for (const { cmd, points } of outline) {
    if (cmd === 'Z') {
      parts.push('Z')
      continue
    }
    const mapped = []
    for (let k = 0; k < points.length; k += 2) mapped.push(map(points[k], points[k + 1]))

    if (cmd === 'M' || previous === null) {
      previous = mapped.at(-1)
      parts.push(`M${mapped.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ')}`)
      continue
    }
    // Every coordinate pair of a cubic is relative to where the curve *starts*,
    // not to the pair before it: `l` walks, `c` does not. Both curves here are
    // emitted through the same loop, so the anchor is what differs.
    const anchor = cmd === 'C' ? previous : null
    const relative = mapped.map((p) => {
      const [fx, fy] = anchor || previous
      const delta = [round(p[0] - fx, precision), round(p[1] - fy, precision)]
      previous = p
      return `${fmt(delta[0])},${fmt(delta[1])}`
    })
    parts.push(cmd.toLowerCase() + relative.join(' '))
  }

  return { d: parts.join(''), scale, precision, bytes: Buffer.byteLength(SOURCE) }
}
