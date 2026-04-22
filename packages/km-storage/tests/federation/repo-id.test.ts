/**
 * Tests for federation Phase A — per-repo RepoId minting + persistence.
 *
 * Covers hub/km/storage-architecture.md §5.1:
 *   - First open mints a ULID-shaped RepoId.
 *   - Subsequent opens return the same RepoId.
 *   - Missing .km/ directory is created.
 *   - Malformed TOML logs + mints fresh without throwing.
 *   - Missing/invalid repo_id field recovers without data loss on unrelated keys.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { CONFIG_TOML_NAME, mintRepoId, readOrMintRepoId, writeRepoConfigToml } from "../../src/federation/repo-id.ts"

let tempRoot: string
let kmDir: string

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "km-federation-repoid-"))
  kmDir = join(tempRoot, ".km")
})

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("mintRepoId", () => {
  test("returns a ULID-shaped string", () => {
    const id = mintRepoId()
    // ULID = 26 chars, Crockford base32 uppercase alphabet.
    expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  test("each call yields a unique id", () => {
    const a = mintRepoId()
    const b = mintRepoId()
    expect(String(a)).not.toBe(String(b))
  })
})

describe("readOrMintRepoId", () => {
  test("creates .km/ if missing and mints a fresh RepoId", () => {
    expect(existsSync(kmDir)).toBe(false)
    const id = readOrMintRepoId(kmDir)
    expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(existsSync(join(kmDir, CONFIG_TOML_NAME))).toBe(true)

    const contents = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
    expect(contents).toContain(`repo_id = "${String(id)}"`)
  })

  test("subsequent calls on the same dir return the same id (idempotent)", () => {
    const first = readOrMintRepoId(kmDir)
    const second = readOrMintRepoId(kmDir)
    const third = readOrMintRepoId(kmDir)
    expect(String(first)).toBe(String(second))
    expect(String(second)).toBe(String(third))
  })

  test("survives re-open across process boundaries (file contents round-trip)", () => {
    const id = readOrMintRepoId(kmDir)
    const contents = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")

    // Simulate re-read from disk via a fresh call — same as a new process.
    const reopened = readOrMintRepoId(kmDir)
    expect(String(reopened)).toBe(String(id))

    // File untouched: a second call MUST NOT have rewritten with a new id.
    expect(readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")).toBe(contents)
  })

  test("malformed TOML does NOT throw and mints a fresh id", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), "not valid = toml = broken [[", "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()

      // File was overwritten with a clean config.
      const reopened = readOrMintRepoId(kmDir)
      expect(String(reopened)).toBe(String(id))
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("missing repo_id key mints + merges back (preserves other keys)", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), `some_other_key = "hello"\n`, "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()

      const contents = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
      expect(contents).toContain(`repo_id = "${String(id)}"`)
      expect(contents).toContain(`some_other_key = "hello"`)
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("non-string repo_id mints a fresh id", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), `repo_id = 42\n`, "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("empty-string repo_id mints a fresh id", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), `repo_id = ""\n`, "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id).length).toBeGreaterThan(0)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("writeRepoConfigToml", () => {
  test("writes quoted strings with header comments", () => {
    const target = join(kmDir, CONFIG_TOML_NAME)
    writeRepoConfigToml(target, { repo_id: "01HKXB2W7K9M1X4Y2Z3" })
    const contents = readFileSync(target, "utf-8")
    expect(contents).toContain("# km federation metadata")
    expect(contents).toContain(`repo_id = "01HKXB2W7K9M1X4Y2Z3"`)
    expect(contents.endsWith("\n")).toBe(true)
  })

  test("escapes quotes + backslashes in values", () => {
    const target = join(kmDir, CONFIG_TOML_NAME)
    writeRepoConfigToml(target, { weird: 'has "quotes" and \\ slashes' })
    const contents = readFileSync(target, "utf-8")
    expect(contents).toContain(String.raw`weird = "has \"quotes\" and \\ slashes"`)
    // Round-trip via the real TOML parser.
    const parsed = Bun.TOML.parse(contents) as Record<string, string>
    expect(parsed["weird"]).toBe('has "quotes" and \\ slashes')
  })

  test("skips null / undefined values", () => {
    const target = join(kmDir, CONFIG_TOML_NAME)
    writeRepoConfigToml(target, { repo_id: "abc", nope: null, also_nope: undefined })
    const contents = readFileSync(target, "utf-8")
    expect(contents).toContain(`repo_id = "abc"`)
    expect(contents).not.toContain("nope")
  })
})
