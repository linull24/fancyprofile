// Checks that the committed SVGs still match a fresh build.
//
// The obvious implementation is `git diff --exit-code`, and it is wrong: zlib's
// deflate output is not stable across zlib versions, so the base64 PNG payload
// differs between a laptop and CI even though it decodes to identical pixels.
// Comparing compressed bytes would fail the build for a difference that does not
// exist in the rendered image.
//
// So compare the two things that are actually meaningful:
//   1. the markup, with the embedded payload masked out — must match exactly
//   2. the decoded displacement map pixels — must match exactly
// A payload that differs only in compression is reported, not failed.
//
// Both committed sets are covered: the six rendering experiments and the scene
// banner in every sun style. The scenes are in here for the same reason as the
// experiments — the README embeds them, so a stale one is a lie in the docs —
// and because a style is exactly the kind of thing that rots silently once it
// stops being the default.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { OUT_DIR, buildExperiments } from './experiments.mjs'
import { decodePNG } from './png.mjs'
import { SCENE_DIR, buildScene } from './scene-animated.mjs'
import { SUN_STYLES } from './scene.mjs'

const DATA_URI = /data:image\/png;base64,([A-Za-z0-9+/=]+)/

let failed = 0
let payloadOnly = 0
let checked = 0

/**
 * @param {{dir: string, name: string, contents: string, hint: string}[]} targets
 */
function check(targets) {
  for (const { dir, name, contents, hint } of targets) {
    checked++
    const fresh = contents
    let committed
    try {
      committed = readFileSync(join(dir, name), 'utf8')
    } catch {
      console.error(`FAIL ${name}: not committed — run \`${hint}\``)
      failed++
      continue
    }

    const maskedCommitted = committed.replace(DATA_URI, 'data:image/png;base64,<payload>')
    const maskedFresh = fresh.replace(DATA_URI, 'data:image/png;base64,<payload>')
    if (maskedCommitted !== maskedFresh) {
      console.error(`FAIL ${name}: markup differs from a fresh build`)
      failed++
      continue
    }

    const committedPayload = committed.match(DATA_URI)?.[1]
    const freshPayload = fresh.match(DATA_URI)?.[1]
    if (committedPayload === freshPayload) continue

    // Payloads differ — that is only acceptable if the pixels do not.
    let a, b
    try {
      a = decodePNG(Buffer.from(committedPayload, 'base64'))
      b = decodePNG(Buffer.from(freshPayload, 'base64'))
    } catch (err) {
      console.error(`FAIL ${name}: committed payload is not a decodable PNG (${err.message})`)
      failed++
      continue
    }
    if (a.width !== b.width || a.height !== b.height || !a.data.equals(b.data)) {
      console.error(`FAIL ${name}: decoded displacement map differs from a fresh build`)
      failed++
    } else {
      console.log(`note ${name}: PNG payload re-compressed (${committedPayload.length} vs ${freshPayload.length} b64 chars), pixels identical`)
      payloadOnly++
    }
  }
}

check(buildExperiments().files.map((file) => ({ ...file, dir: OUT_DIR, hint: 'npm run build' })))
check(
  SUN_STYLES.map((sunStyle) => ({
    ...buildScene({ sunStyle }),
    dir: SCENE_DIR,
    hint: `npm run scene -- --sun=${sunStyle}`,
  }))
)

if (failed) {
  console.error(`\n${failed} file(s) out of sync`)
  process.exit(1)
}
console.log(
  `\nall ${checked} files in sync` +
    (payloadOnly ? ` (${payloadOnly} with compression-only payload drift)` : '')
)
