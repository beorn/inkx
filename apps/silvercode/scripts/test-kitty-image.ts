#!/usr/bin/env bun
// Standalone Kitty graphics diagnostic.
//
// Writes the silver-code.png to stdout via the Kitty graphics protocol —
// no silvery, no React, no alt-screen, no clearing. If the image renders,
// Kitty graphics works in your terminal and the issue is silvery's
// pipeline. If it doesn't, the issue is detection / encoding / your
// terminal config.
//
// Usage: bun apps/silvercode/scripts/test-kitty-image.ts

import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"

const PNG_PATH = resolvePath(import.meta.dirname, "..", "silver-code.png")
console.log(`Reading PNG from: ${PNG_PATH}`)

const png = readFileSync(PNG_PATH)
console.log(`PNG size: ${png.length} bytes`)
console.log(`TERM=${process.env.TERM} TERM_PROGRAM=${process.env.TERM_PROGRAM}`)
console.log("")
console.log("--- Image should appear below this line ---")
console.log("")

const APC_START = "\x1b_G"
const ST = "\x1b\\"
const MAX_CHUNK = 4096

const b64 = png.toString("base64")
const chunks: string[] = []
for (let i = 0; i < b64.length; i += MAX_CHUNK) {
  chunks.push(b64.slice(i, i + MAX_CHUNK))
}

console.log(`Encoding into ${chunks.length} chunks of ≤${MAX_CHUNK} base64 bytes`)
console.log("")

// PNG content is 865×595 (aspect ~1.45). Cell aspect is ~2:1
// (height:width), so for a faithful display: c / r ≈ 2.91 ≈ 3.
const C = 60
const R = 20

if (chunks.length === 1) {
  process.stdout.write(`${APC_START}a=T,f=100,c=${C},r=${R},m=0;${chunks[0]}${ST}`)
} else {
  // First chunk — full metadata, m=1 (more chunks follow)
  process.stdout.write(`${APC_START}a=T,f=100,c=${C},r=${R},m=1;${chunks[0]}${ST}`)
  // Middle chunks
  for (let i = 1; i < chunks.length - 1; i++) {
    process.stdout.write(`${APC_START}m=1;${chunks[i]}${ST}`)
  }
  // Last chunk — m=0
  process.stdout.write(`${APC_START}m=0;${chunks[chunks.length - 1]}${ST}`)
}

// Reserve some vertical space below the image so the prompt doesn't overlap
process.stdout.write("\n".repeat(16))
console.log("--- Image should appear above this line ---")
