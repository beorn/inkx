/**
 * Tests for sibling order persistence (.km/sibling-order.json)
 *
 * Verifies that:
 * 1. Column reorder is written to .km/sibling-order.json
 * 2. Fresh discovery restores persisted order
 * 3. Backward compatible — no file means filesystem order
 * 4. New entries not in persisted order are appended at the end
 */
import { test, expect, describe, vi } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"
import {
  readSiblingOrder,
  writeSiblingOrder,
  applySiblingOrder,
} from "../src/sibling-order.ts"

/** Helper: exhaust a loadRepo generator and return the result */
function runLoadRepo(...args: Parameters<typeof loadRepo>) {
  const gen = loadRepo(...args)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/** Get folder children ordered by parent_idx */
function getFolderChildren(db: Database): { fs_path: string; parent_idx: number }[] {
  return db
    .prepare(
      `SELECT fs_path, parent_idx FROM nodes
       WHERE fstype = 'folder' AND fs_path != '.'
       ORDER BY parent_idx, created_at`,
    )
    .all() as { fs_path: string; parent_idx: number }[]
}

describe("sibling-order.ts unit tests", () => {
  test("readSiblingOrder returns empty map when file doesn't exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))
    expect(readSiblingOrder(tmpDir)).toEqual({})
  })

  test("writeSiblingOrder creates .km/ and file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))
    writeSiblingOrder(tmpDir, ".", ["b", "a", "c"])

    const filePath = join(tmpDir, ".km", "sibling-order.json")
    expect(existsSync(filePath)).toBe(true)

    const content = JSON.parse(readFileSync(filePath, "utf-8"))
    expect(content).toEqual({ ".": ["b", "a", "c"] })
  })

  test("writeSiblingOrder merges with existing orders", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))

    writeSiblingOrder(tmpDir, ".", ["b", "a", "c"])
    writeSiblingOrder(tmpDir, "subdir", ["y", "x"])

    const result = readSiblingOrder(tmpDir)
    expect(result).toEqual({
      ".": ["b", "a", "c"],
      subdir: ["y", "x"],
    })
  })

  test("writeSiblingOrder removes empty entries", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))

    writeSiblingOrder(tmpDir, ".", ["b", "a"])
    writeSiblingOrder(tmpDir, ".", [])

    const result = readSiblingOrder(tmpDir)
    expect(result).toEqual({})
  })

  test("readSiblingOrder handles invalid JSON gracefully", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))
    mkdirSync(join(tmpDir, ".km"), { recursive: true })
    writeFileSync(join(tmpDir, ".km", "sibling-order.json"), "not json", "utf-8")

    // Suppress expected warning
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(readSiblingOrder(tmpDir)).toEqual({})
    vi.restoreAllMocks()
  })

  test("readSiblingOrder filters invalid entries", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-"))
    mkdirSync(join(tmpDir, ".km"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".km", "sibling-order.json"),
      JSON.stringify({ ".": ["a", "b"], bad: 42 }),
      "utf-8",
    )

    // Suppress expected warning
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = readSiblingOrder(tmpDir)
    expect(result).toEqual({ ".": ["a", "b"] })
    vi.restoreAllMocks()
  })

  test("applySiblingOrder assigns indices from persisted order", () => {
    const result = applySiblingOrder(["c", "a", "b"], ["a", "b", "c"])
    expect(result.get("c")).toBe(0)
    expect(result.get("a")).toBe(1)
    expect(result.get("b")).toBe(2)
  })

  test("applySiblingOrder places new entries after ordered ones", () => {
    const result = applySiblingOrder(["b", "a"], ["a", "b", "d"])
    expect(result.get("b")).toBe(0)
    expect(result.get("a")).toBe(1)
    expect(result.get("d")).toBe(2) // new entry appended
  })

  test("applySiblingOrder skips entries no longer on disk", () => {
    const result = applySiblingOrder(["c", "deleted", "a"], ["a", "c"])
    expect(result.get("c")).toBe(0)
    expect(result.get("a")).toBe(1)
    expect(result.has("deleted")).toBe(false)
  })
})

describe("sibling order integration with discovery", () => {
  test("persisted order survives state.db rebuild", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-int-"))

    // Create a vault with 3 folders (columns)
    mkdirSync(join(tmpDir, "alpha"))
    writeFileSync(join(tmpDir, "alpha", "index.md"), "# Alpha\n")
    mkdirSync(join(tmpDir, "beta"))
    writeFileSync(join(tmpDir, "beta", "index.md"), "# Beta\n")
    mkdirSync(join(tmpDir, "gamma"))
    writeFileSync(join(tmpDir, "gamma", "index.md"), "# Gamma\n")

    // Load initial — verify all 3 folders exist
    const db1 = new Database(":memory:")
    db1.run(SCHEMA)
    const result1 = runLoadRepo(tmpDir, { db: db1 })
    expect(result1.nodeCount).toBeGreaterThanOrEqual(3)

    const initialChildren = getFolderChildren(db1)
    expect(initialChildren).toHaveLength(3)

    // Simulate a column reorder: gamma, alpha, beta
    writeSiblingOrder(tmpDir, ".", ["gamma", "alpha", "beta"])

    // Rebuild from scratch (new DB, like deleting state.db)
    const db2 = new Database(":memory:")
    db2.run(SCHEMA)
    runLoadRepo(tmpDir, { db: db2 })

    // Verify restored order: gamma first, alpha second, beta third
    const restoredChildren = getFolderChildren(db2)
    expect(restoredChildren.map((c) => c.fs_path)).toEqual(["gamma", "alpha", "beta"])
  })

  test("new folders added after order was saved appear at the end", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-new-"))

    // Create vault with 2 folders
    mkdirSync(join(tmpDir, "alpha"))
    writeFileSync(join(tmpDir, "alpha", "index.md"), "# Alpha\n")
    mkdirSync(join(tmpDir, "beta"))
    writeFileSync(join(tmpDir, "beta", "index.md"), "# Beta\n")

    // Save a reordered order: beta, alpha
    writeSiblingOrder(tmpDir, ".", ["beta", "alpha"])

    // Add a new folder after the order was saved
    mkdirSync(join(tmpDir, "gamma"))
    writeFileSync(join(tmpDir, "gamma", "index.md"), "# Gamma\n")

    // Load with persisted order
    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoadRepo(tmpDir, { db })

    const children = getFolderChildren(db)

    // beta and alpha should come before gamma
    const betaIdx = children.findIndex((c) => c.fs_path === "beta")
    const alphaIdx = children.findIndex((c) => c.fs_path === "alpha")
    const gammaIdx = children.findIndex((c) => c.fs_path === "gamma")

    expect(betaIdx).toBeLessThan(alphaIdx)
    expect(alphaIdx).toBeLessThan(gammaIdx)
  })

  test("no persisted order file — discovery assigns sequential indices", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-fb-"))

    mkdirSync(join(tmpDir, "alpha"))
    writeFileSync(join(tmpDir, "alpha", "index.md"), "# Alpha\n")
    mkdirSync(join(tmpDir, "beta"))
    writeFileSync(join(tmpDir, "beta", "index.md"), "# Beta\n")
    mkdirSync(join(tmpDir, "charlie"))
    writeFileSync(join(tmpDir, "charlie", "index.md"), "# Charlie\n")

    // No .km/sibling-order.json — should use filesystem order (sequential indices)
    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoadRepo(tmpDir, { db })

    const children = getFolderChildren(db)
    // All 3 should be present with distinct parent_idx values
    expect(children).toHaveLength(3)
    const indices = children.map((c) => c.parent_idx)
    expect(new Set(indices).size).toBe(3) // all unique
  })

  test("persisted order for markdown files at root level", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-md-"))

    // Create vault with markdown files as columns (no folders)
    writeFileSync(join(tmpDir, "alpha.md"), "# Alpha\n\n- task 1\n")
    writeFileSync(join(tmpDir, "beta.md"), "# Beta\n\n- task 2\n")
    writeFileSync(join(tmpDir, "gamma.md"), "# Gamma\n\n- task 3\n")

    // Persist reordered order: gamma, alpha, beta
    writeSiblingOrder(tmpDir, ".", ["gamma.md", "alpha.md", "beta.md"])

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoadRepo(tmpDir, { db })

    const children = db
      .prepare(
        `SELECT fs_path, parent_idx FROM nodes
         WHERE fstype IN ('mdfile', 'file') AND fs_path IS NOT NULL
         ORDER BY parent_idx, created_at`,
      )
      .all() as { fs_path: string; parent_idx: number }[]

    expect(children.map((c) => c.fs_path)).toEqual(["gamma.md", "alpha.md", "beta.md"])
  })

  test("persisted order with deleted folder is skipped gracefully", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-so-del-"))

    // Create vault with 2 folders
    mkdirSync(join(tmpDir, "alpha"))
    writeFileSync(join(tmpDir, "alpha", "index.md"), "# Alpha\n")
    mkdirSync(join(tmpDir, "beta"))
    writeFileSync(join(tmpDir, "beta", "index.md"), "# Beta\n")

    // Persist order that references a deleted folder
    writeSiblingOrder(tmpDir, ".", ["gamma", "alpha", "beta"])
    // "gamma" doesn't exist on disk — should be skipped

    const db = new Database(":memory:")
    db.run(SCHEMA)
    runLoadRepo(tmpDir, { db })

    const children = getFolderChildren(db)
    // alpha and beta should still load, gamma absent
    expect(children).toHaveLength(2)
    const names = children.map((c) => c.fs_path)
    expect(names).toContain("alpha")
    expect(names).toContain("beta")

    // alpha should come before beta (they come after "gamma" in persisted order,
    // so alpha=idx 1, beta=idx 2 — both greater than absent gamma)
    const alphaIdx = children.findIndex((c) => c.fs_path === "alpha")
    const betaIdx = children.findIndex((c) => c.fs_path === "beta")
    expect(alphaIdx).toBeLessThan(betaIdx)
  })
})
