/**
 * Tests for federation Phase A — per-repo RepoId minting + persistence.
 *
 * Covers hub/km/storage-architecture.md §5.1:
 *   - First open mints a ULID-shaped RepoId, written to `.km/config.yaml`.
 *   - Subsequent opens return the same RepoId.
 *   - Missing .km/ directory is created.
 *   - Malformed YAML logs + mints fresh without throwing.
 *   - Existing non-`repo` keys (user config) survive a mint/merge.
 *   - Legacy `.km/config.toml` is migrated once, then deleted.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseDocument } from "yaml"

import { CONFIG_YAML_NAME, mintRepoId, readOrMintRepoId, writeRepoConfigYaml } from "../../src/federation/repo-id.ts"
import { asRepoId } from "@km/core"

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
  test("creates .km/ if missing and mints a fresh RepoId (written to config.yaml)", () => {
    expect(existsSync(kmDir)).toBe(false)
    const id = readOrMintRepoId(kmDir)
    expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    const yamlPath = join(kmDir, CONFIG_YAML_NAME)
    expect(existsSync(yamlPath)).toBe(true)

    const doc = parseDocument(readFileSync(yamlPath, "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(String(id))
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
    const yamlPath = join(kmDir, CONFIG_YAML_NAME)
    const contents = readFileSync(yamlPath, "utf-8")

    // Simulate re-read from disk via a fresh call — same as a new process.
    const reopened = readOrMintRepoId(kmDir)
    expect(String(reopened)).toBe(String(id))

    // File untouched: a second call MUST NOT have rewritten with a new id.
    expect(readFileSync(yamlPath, "utf-8")).toBe(contents)
  })

  test("malformed YAML does NOT throw and mints a fresh id", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), "this is: not: valid: yaml:\n  - [unbalanced", "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()

      // File was overwritten with a clean config that round-trips.
      const reopened = readOrMintRepoId(kmDir)
      expect(String(reopened)).toBe(String(id))
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("yaml with no repo.id mints + merges back (preserves existing user keys)", () => {
    mkdirSync(kmDir, { recursive: true })
    // Pre-existing user config without a repo: block.
    writeFileSync(
      join(kmDir, CONFIG_YAML_NAME),
      `beads:
  prefix: "km"
inactive:
  - "raw/**"
`,
      "utf-8",
    )

    const id = readOrMintRepoId(kmDir)
    expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    const doc = parseDocument(readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(String(id))
    // Existing user keys survive.
    expect(doc.getIn(["beads", "prefix"])).toBe("km")
    expect(doc.get("inactive")).toBeDefined()
  })

  test("non-string repo.id mints a fresh id and overwrites", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), `repo:\n  id: 42\n`, "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("empty-string repo.id mints a fresh id", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), `repo:\n  id: ""\n`, "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id).length).toBeGreaterThan(0)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("writes a leading comment above the repo: block on fresh mint", () => {
    const id = readOrMintRepoId(kmDir)
    const contents = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")
    expect(contents).toContain("#")
    expect(contents).toContain("km-managed")
    expect(contents).toContain(String(id))
  })

  test("preserves user comments in config.yaml across a repo.id merge", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(
      join(kmDir, CONFIG_YAML_NAME),
      `# User-edited km configuration
# Please keep this comment.
beads:
  prefix: "km"
`,
      "utf-8",
    )

    readOrMintRepoId(kmDir)
    const contents = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")
    expect(contents).toContain("User-edited km configuration")
    expect(contents).toContain("Please keep this comment.")
  })
})

describe("migration from legacy .km/config.toml", () => {
  test("migrates repo_id from config.toml → config.yaml, then deletes the toml", () => {
    mkdirSync(kmDir, { recursive: true })
    const legacy = "01HKXB2W7K9M1X4Y2Z3ABCDEFG"
    const tomlPath = join(kmDir, "config.toml")
    writeFileSync(tomlPath, `repo_id = "${legacy}"\n`, "utf-8")

    const id = readOrMintRepoId(kmDir)
    expect(String(id)).toBe(legacy)

    // TOML is gone; yaml carries the id.
    expect(existsSync(tomlPath)).toBe(false)
    const doc = parseDocument(readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(legacy)
  })

  test("malformed toml during migration logs + mints fresh (does not throw)", () => {
    mkdirSync(kmDir, { recursive: true })
    const tomlPath = join(kmDir, "config.toml")
    writeFileSync(tomlPath, "this is = broken [[ toml", "utf-8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const id = readOrMintRepoId(kmDir)
      expect(String(id)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("toml present but yaml already has repo.id → yaml wins, toml is not touched", () => {
    // Edge case: if yaml already has the id (e.g. user manually migrated),
    // the toml migration path is never entered. The toml remains as-is —
    // we only delete it when we actually migrate from it. This is a safety
    // feature: never delete a file we didn't consume.
    mkdirSync(kmDir, { recursive: true })
    const existingId = "01HKXB2W7K9M1X4Y2Z3YAML0001"
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), `repo:\n  id: "${existingId}"\n`, "utf-8")
    const tomlPath = join(kmDir, "config.toml")
    writeFileSync(tomlPath, `repo_id = "01HKXB2W7K9M1X4Y2Z3TOML0001"\n`, "utf-8")

    const id = readOrMintRepoId(kmDir)
    expect(String(id)).toBe(existingId)
    // TOML not consumed → not deleted.
    expect(existsSync(tomlPath)).toBe(true)
  })
})

describe("writeRepoConfigYaml", () => {
  test("writes repo.id into the yaml document", () => {
    const target = join(kmDir, CONFIG_YAML_NAME)
    writeRepoConfigYaml(target, asRepoId("01HKXB2W7K9M1X4Y2Z3"))
    const doc = parseDocument(readFileSync(target, "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe("01HKXB2W7K9M1X4Y2Z3")
  })

  test("preserves pre-existing keys in the yaml", () => {
    mkdirSync(kmDir, { recursive: true })
    const target = join(kmDir, CONFIG_YAML_NAME)
    writeFileSync(target, `beads:\n  prefix: "test"\n`, "utf-8")

    writeRepoConfigYaml(target, asRepoId("01HKXB2W7K9M1X4Y2ZZZZZZZZZ"))
    const doc = parseDocument(readFileSync(target, "utf-8"))
    expect(doc.getIn(["beads", "prefix"])).toBe("test")
    expect(doc.getIn(["repo", "id"])).toBe("01HKXB2W7K9M1X4Y2ZZZZZZZZZ")
  })

  test("idempotent — writing the same id a second time yields stable output", () => {
    const target = join(kmDir, CONFIG_YAML_NAME)
    writeRepoConfigYaml(target, asRepoId("01ABCDEF1234567890123456AB"))
    const first = readFileSync(target, "utf-8")
    writeRepoConfigYaml(target, asRepoId("01ABCDEF1234567890123456AB"))
    const second = readFileSync(target, "utf-8")
    expect(second).toBe(first)
  })
})
