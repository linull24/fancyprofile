// Minimal RGBA8 PNG codec. Node's zlib does the only hard part; this exists
// so the displacement-map pipeline has zero runtime dependencies.
//
// The decoder exists for verification, not for rendering. zlib's deflate output
// is not stable across zlib versions, so the committed base64 payload can differ
// from a fresh build on another machine while decoding to identical pixels. The
// verify step therefore compares decoded pixels rather than file bytes.
import { deflateSync, inflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * @param {Buffer} pixels width*height*channels bytes
 * @param {{channels?: 3 | 4}} [opts] 3 = RGB (colour type 2), 4 = RGBA (colour type 6)
 */
export function encodePNG(width, height, pixels, { channels = 4 } = {}) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = channels === 3 ? 2 : 6 // colour type
  // [10..12] compression, filter, interlace all 0

  // Each scanline is prefixed with its filter byte (0 = None).
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Decodes the subset of PNG that encodePNG produces, plus the other four scanline
 * filters, so hand-tooled files still decode.
 * @returns {{width: number, height: number, data: Buffer}} data is RGBA8
 */
export function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error('not a PNG')
  }

  let width, height, bitDepth, colorType
  const idat = []
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`unsupported PNG: depth ${bitDepth} colour type ${colorType}`)
      }
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  const raw = inflateSync(Buffer.concat(idat))
  const bpp = colorType === 2 ? 3 : 4
  const stride = width * bpp
  const native = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = native.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`bad scanline filter ${filter}`)
      cur[x] = v & 0xff
    }
    prev = cur
  }

  if (bpp === 4) return { width, height, data: native }

  // Normalise RGB to RGBA so callers only ever deal with one layout.
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    out[i * 4] = native[j]
    out[i * 4 + 1] = native[j + 1]
    out[i * 4 + 2] = native[j + 2]
    out[i * 4 + 3] = 255
  }
  return { width, height, data: out }
}
