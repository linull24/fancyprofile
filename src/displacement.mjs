// The shader -> SVG bridge, ported out of the browser.
//
// svg-shaders and liquid-glass both compute a displacement field on a <canvas>
// and hand it to <feDisplacementMap> as an RG texture. Neither part needs a
// browser: the field is a pure function of uv, and encoding it is arithmetic.
// Doing it here means the same scene renders identically on every run, which
// matters for a README asset that gets committed.
import { encodePNG } from './png.mjs'

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * @param {object} opts
 * @param {number} opts.width   map size in px; also the filter's user space
 * @param {number} opts.height
 * @param {(uv: {x: number, y: number}) => {x: number, y: number}} opts.fragment
 * @param {number} [opts.headroom] multiplier on the peak displacement. The map
 *   stores values in [0,1] with 0.5 meaning "don't move", so the range only
 *   covers +/- scale/2. Headroom keeps the peak inside that range instead of
 *   clipping at the edge of the field.
 * @returns {{dataURI: string, scale: number, peak: number}}
 */
export function buildDisplacementMap({ width, height, fragment, headroom = 2 }) {
  const count = width * height
  const dx = new Float64Array(count)
  const dy = new Float64Array(count)
  let peak = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const pos = fragment({ x: x / width, y: y / height })
      // A fragment returns a *sample position*; store it as the offset from
      // where feDisplacementMap would otherwise have sampled.
      const ox = pos.x * width - x
      const oy = pos.y * height - y
      dx[i] = ox
      dy[i] = oy
      const abs = Math.max(Math.abs(ox), Math.abs(oy))
      if (abs > peak) peak = abs
    }
  }

  const scale = peak * headroom || 1
  const rgba = Buffer.alloc(count * 4)
  for (let i = 0; i < count; i++) {
    rgba[i * 4] = Math.round(clamp01(dx[i] / scale + 0.5) * 255)
    rgba[i * 4 + 1] = Math.round(clamp01(dy[i] / scale + 0.5) * 255)
    rgba[i * 4 + 2] = 0
    rgba[i * 4 + 3] = 255
  }

  return {
    dataURI: `data:image/png;base64,${encodePNG(width, height, rgba).toString('base64')}`,
    scale,
    peak,
  }
}

/**
 * The <filter> both upstream projects converge on. sRGB is not optional: the
 * default linearRGB would decode our encoded offsets through a transfer curve
 * and shear the whole displacement field.
 */
export function displacementFilter({ id, map, width, height, scale }) {
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB">
      <feImage href="${map}" width="${width}" height="${height}" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="${scale.toFixed(2)}"/>
    </filter>`
}
