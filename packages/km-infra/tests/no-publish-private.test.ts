/**
 * Guard: @km/storage and @km/fs-mount must stay private.
 *
 * @km/storage source imports from @km/fs-mount in ~10 files without declaring
 * the dep in its package.json; @km/fs-mount declares @km/storage. This is a
 * source-level package cycle that only resolves via Bun workspace hoisting.
 * Publishing either half to npm would ship a broken install to consumers.
 *
 * This test (plus packages/km-infra/scripts/check-no-publish-private.sh which
 * runs in test:ci) prevents accidental publish. When the cycle is resolved
 * (see hub/km/storage-architecture.md §6.6 — option c: extract @km/runtime),
 * delete both this test and the shell check.
 */

import { describe, test, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..")

function readPkg(pkgName: string): Record<string, unknown> {
  const path = join(REPO_ROOT, "packages", pkgName, "package.json")
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

describe("no-publish-private guard", () => {
  test('@km/storage package.json has "private": true', () => {
    const pkg = readPkg("km-storage")
    expect(pkg.name).toBe("@km/storage")
    expect(pkg.private).toBe(true)
  })

  test('@km/fs-mount package.json has "private": true', () => {
    const pkg = readPkg("km-fs-mount")
    expect(pkg.name).toBe("@km/fs-mount")
    expect(pkg.private).toBe(true)
  })

  test("both package.json files document the reason via _note", () => {
    // The _note field is a convention (JSON has no comments). It exists so
    // anyone reading package.json sees WHY the package is private before
    // attempting to flip the flag. If this test fails, read
    // hub/km/storage-architecture.md §6.6 and the package CLAUDE.md files.
    const storage = readPkg("km-storage")
    const fsMount = readPkg("km-fs-mount")

    expect(
      typeof storage._note === "string" && storage._note.length > 0,
      "@km/storage package.json must have a _note explaining the cycle constraint",
    ).toBe(true)
    expect(
      typeof fsMount._note === "string" && fsMount._note.length > 0,
      "@km/fs-mount package.json must have a _note explaining the cycle constraint",
    ).toBe(true)
  })
})
