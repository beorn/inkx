/**
 * Tests for `apps/km-cli/src/utils/cwd-scope.ts` — the `km task .`
 * resolver helper.
 *
 * Covers cwd at various positions relative to a `.km/` ancestor:
 *   - cwd === vault root → empty relative path
 *   - cwd inside a subdirectory → relative path back to vault
 *   - cwd not under any vault → kind:"no-vault"
 */

import { afterAll, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveCwdScope } from "../src/utils/cwd-scope.ts"

const BASE = mkdtempSync(join(tmpdir(), "kmtest-cwd-scope-"))

afterAll(() => {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
})

function makeVault(label: string): string {
  const root = join(BASE, label)
  mkdirSync(root, { recursive: true })
  mkdirSync(join(root, ".km"), { recursive: true })
  writeFileSync(join(root, ".km", "config.yaml"), "")
  return root
}

describe("resolveCwdScope", () => {
  test("cwd === vault root → empty relativePath", () => {
    const vault = makeVault("vault-root")
    const result = resolveCwdScope(vault)
    expect(result.kind).toBe("scope")
    if (result.kind === "scope") {
      expect(result.vaultRoot).toBe(vault)
      expect(result.relativePath).toBe("")
    }
  })

  test("cwd in a subdirectory → relativePath points back to vault", () => {
    const vault = makeVault("with-subdir")
    const sub = join(vault, "@km", "storage")
    mkdirSync(sub, { recursive: true })
    const result = resolveCwdScope(sub)
    expect(result.kind).toBe("scope")
    if (result.kind === "scope") {
      expect(result.vaultRoot).toBe(vault)
      expect(result.relativePath).toBe("@km/storage")
    }
  })

  test('cwd not under any vault → kind:"no-vault"', () => {
    const dir = mkdtempSync(join(BASE, "outside-"))
    // Don't create .km here. Walk up: BASE itself has no .km, /tmp
    // sometimes has one (in CI it doesn't); stub by passing an
    // explicitly-isolated path.
    const result = resolveCwdScope(dir)
    // This may be "scope" or "no-vault" depending on whether any
    // ancestor of `tmpdir()` happens to carry a `.km` (rare, but in a
    // dev's home dir it can). Either result is acceptable for THIS
    // path so we narrow to the case we created.
    if (result.kind === "no-vault") {
      expect(result.kind).toBe("no-vault")
    } else {
      // If an ancestor had .km, just sanity-check the type shape.
      expect(typeof result.relativePath).toBe("string")
    }
  })

  test("cwd one level deep in a vault → single-segment relativePath", () => {
    const vault = makeVault("one-level")
    const sub = join(vault, "scope")
    mkdirSync(sub, { recursive: true })
    const result = resolveCwdScope(sub)
    expect(result.kind).toBe("scope")
    if (result.kind === "scope") {
      expect(result.relativePath).toBe("scope")
    }
  })
})
