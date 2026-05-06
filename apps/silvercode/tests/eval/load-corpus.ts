/**
 * Load the role-prefix adversarial corpus.
 *
 * The corpus is a base64-encoded JSON array of strings stored at
 * `fixtures/role-prefix-corpus.b64`. Trigger tokens never appear as
 * literal text in any source file or test file — they live only in the
 * binary blob, with `.recall-ignore` so they never enter the grep /
 * recall / context surface.
 *
 * See `apps/silvercode/docs/channels.md` § 9
 * (Content quarantine for this design itself).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const FIXTURE_PATH = join(__dirname, "fixtures", "role-prefix-corpus.b64")

let cached: readonly string[] | null = null

export function loadRolePrefixCorpus(): readonly string[] {
  if (cached) return cached
  const b64 = readFileSync(FIXTURE_PATH, "utf8").trim()
  const json = Buffer.from(b64, "base64").toString("utf8")
  const arr = JSON.parse(json)
  if (!Array.isArray(arr)) throw new Error("corpus is not an array")
  for (const e of arr) {
    if (typeof e !== "string") throw new Error("corpus entry not a string")
  }
  cached = arr as readonly string[]
  return cached
}
