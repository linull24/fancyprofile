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
 * @param {3 | 4} [opts.channels] the field is opaque, so alpha is dead weight.
 * @param {number} [opts.userWidth] the filter's user space, in px. Displacement
 *   has to be expressed there, not in map pixels: feDisplacementMap's scale is
 *   in user units, so a map sampled on a coarser grid would otherwise come out
 *   proportionally weaker instead of merely blurrier. Defaults to the map size,
 *   which is correct when the two coincide.
 * @param {number} [opts.userHeight]
 * @returns {{dataURI: string, scale: number, peak: number}}
 */
export function buildDisplacementMap({
  width,
  height,
  fragment,
  headroom = 2,
  channels = 4,
  userWidth = width,
  userHeight = height,
}) {
  const count = width * height
  const dx = new Float64Array(count)
  const dy = new Float64Array(count)
  let peak = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const pos = fragment({ x: x / width, y: y / height })
      // A fragment returns a *sample position*; store it as the offset from
      // where feDisplacementMap would otherwise have sampled, in user space.
      const ox = (pos.x - x / width) * userWidth
      const oy = (pos.y - y / height) * userHeight
      dx[i] = ox
      dy[i] = oy
      const abs = Math.max(Math.abs(ox), Math.abs(oy))
      if (abs > peak) peak = abs
    }
  }

  const scale = peak * headroom || 1
  const pixels = Buffer.alloc(count * channels)
  for (let i = 0; i < count; i++) {
    pixels[i * channels] = Math.round(clamp01(dx[i] / scale + 0.5) * 255)
    pixels[i * channels + 1] = Math.round(clamp01(dy[i] / scale + 0.5) * 255)
    // Blue is unused and stays 0 in both layouts, which deflates to nothing.
    if (channels === 4) pixels[i * 4 + 3] = 255
  }

  return {
    dataURI: `data:image/png;base64,${encodePNG(width, height, pixels, { channels }).toString('base64')}`,
    scale,
    peak,
  }
}

// The <filter> that consumes this map is built by scene.warpFilter, so that all
// SVG markup in the project goes through one builder (svg.mjs). This module
// only computes the field.
