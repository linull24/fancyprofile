import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { OUT_DIR, buildExperiments } from './experiments.mjs'

mkdirSync(OUT_DIR, { recursive: true })

const { files, notes } = buildExperiments()
for (const note of notes) console.log(note)

let total = 0
for (const { name, contents } of files) {
  writeFileSync(join(OUT_DIR, name), contents)
  total += Buffer.byteLength(contents)
}

console.log(`\nwrote ${files.length} files to experiments/ (${(total / 1024).toFixed(0)}kB)`)
