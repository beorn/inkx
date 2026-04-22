/**
 * Tests for ~/.km/session.db — the user-local session state tier.
 *
 * Covers (hub/km/storage-architecture.md §5.3):
 *   - Fresh-open creates the schema.
 *   - Writes + reads round-trip per RepoId.
 *   - Multiple RepoIds stay isolated.
 *   - Migration from `.km/state.db` — session tables lifted, dropped from state.db.
 *
 * Discipline: every test opens its own DB in an isolated tempdir via
 * `KM_SESSION_DB` env var override so parallel vitest workers don't clash.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Database } from "bun:sqlite"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { asRepoId } from "@km/core"

import {
  addSessionRecent,
  appendUndo,
  clearSessionForRepo,
  deletePaneLayout,
  getCollapsedSet,
  getSessionCursor,
  getSessionRecent,
  getUndoEntries,
  isCollapsed,
  listPaneLayouts,
  loadPaneLayout,
  migrateSessionStateFromStateDb,
  openSessionDb,
  readSessionMeta,
  resolveSessionDbPath,
  savePaneLayout,
  SESSION_SCHEMA_VERSION,
  setCollapsed,
  setSessionCursor,
  trimSessionRecent,
  truncateUndoUpTo,
} from "../../src/session/session-db.ts"

let tmpHome: string
let dbPath: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "km-session-"))
  dbPath = join(tmpHome, ".km", "session.db")
})

afterEach(() => {
  if (existsSync(tmpHome)) rmSync(tmpHome, { recursive: true, force: true })
})

// =============================================================================
// Open / schema
// =============================================================================

describe("openSessionDb", () => {
  test("fresh open creates the db file and applies the schema", () => {
    using db = openSessionDb({ home: tmpHome })
    expect(existsSync(dbPath)).toBe(true)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
    const names = new Set(tables.map((r) => r.name))
    expect(names.has("session_cursor")).toBe(true)
    expect(names.has("session_recent")).toBe(true)
    expect(names.has("session_collapsed")).toBe(true)
    expect(names.has("session_pane_layout")).toBe(true)
    expect(names.has("session_undo")).toBe(true)
    expect(names.has("session_meta")).toBe(true)

    expect(readSessionMeta(db, "schema_version")).toBe(String(SESSION_SCHEMA_VERSION))
  })

  test("reopening an existing db is idempotent", () => {
    {
      using db = openSessionDb({ home: tmpHome })
      setSessionCursor(db, asRepoId("repo-alpha"), "node-1", 1000)
    }
    {
      using db = openSessionDb({ home: tmpHome })
      expect(getSessionCursor(db, asRepoId("repo-alpha"))).toEqual({
        nodeId: "node-1",
        updatedAt: 1000,
      })
    }
  })

  test("KM_SESSION_DB env var overrides the home path", () => {
    const override = join(tmpHome, "custom-session.db")
    const prev = process.env.KM_SESSION_DB
    process.env.KM_SESSION_DB = override
    try {
      expect(resolveSessionDbPath()).toBe(override)
      using db = openSessionDb()
      expect(existsSync(override)).toBe(true)
      // Sanity: the default path should NOT have been created.
      expect(existsSync(dbPath)).toBe(false)
      setSessionCursor(db, asRepoId("repo-a"), "n-1")
      expect(getSessionCursor(db, asRepoId("repo-a"))?.nodeId).toBe("n-1")
    } finally {
      if (prev === undefined) delete process.env.KM_SESSION_DB
      else process.env.KM_SESSION_DB = prev
    }
  })
})

// =============================================================================
// Per-tier round-trips, keyed by RepoId
// =============================================================================

describe("cursor", () => {
  test("round-trips + upserts", () => {
    using db = openSessionDb({ home: tmpHome })
    const repo = asRepoId("repo-1")
    expect(getSessionCursor(db, repo)).toBeNull()

    setSessionCursor(db, repo, "node-a", 100)
    expect(getSessionCursor(db, repo)).toEqual({ nodeId: "node-a", updatedAt: 100 })

    setSessionCursor(db, repo, "node-b", 200)
    expect(getSessionCursor(db, repo)).toEqual({ nodeId: "node-b", updatedAt: 200 })
  })
})

describe("recent", () => {
  test("orders most-recent-first, updates opened_at on re-add, trims to cap", () => {
    using db = openSessionDb({ home: tmpHome })
    const repo = asRepoId("repo-1")
    addSessionRecent(db, repo, "n-1", 100)
    addSessionRecent(db, repo, "n-2", 200)
    addSessionRecent(db, repo, "n-3", 300)
    // Re-open n-1, it should jump to the front.
    addSessionRecent(db, repo, "n-1", 400)

    const list = getSessionRecent(db, repo, 10)
    expect(list.map((r) => r.nodeId)).toEqual(["n-1", "n-3", "n-2"])

    // Cap at 2 — n-2 should fall off.
    trimSessionRecent(db, repo, 2)
    const capped = getSessionRecent(db, repo, 10)
    expect(capped.map((r) => r.nodeId)).toEqual(["n-1", "n-3"])
  })
})

describe("collapsed", () => {
  test("set/clear + whole-set fetch", () => {
    using db = openSessionDb({ home: tmpHome })
    const repo = asRepoId("repo-1")

    setCollapsed(db, repo, "n-1", true)
    setCollapsed(db, repo, "n-2", true)
    expect(isCollapsed(db, repo, "n-1")).toBe(true)
    expect(isCollapsed(db, repo, "n-3")).toBe(false)
    expect(getCollapsedSet(db, repo)).toEqual(new Set(["n-1", "n-2"]))

    setCollapsed(db, repo, "n-1", false)
    expect(isCollapsed(db, repo, "n-1")).toBe(false)
    expect(getCollapsedSet(db, repo)).toEqual(new Set(["n-2"]))
  })
})

describe("pane layout", () => {
  test("save/load/list/delete with JSON payloads", () => {
    using db = openSessionDb({ home: tmpHome })
    const repo = asRepoId("repo-1")

    savePaneLayout(db, repo, "default", { split: "vertical", ratio: 0.4 }, 111)
    savePaneLayout(db, repo, "review", { split: "horizontal", ratio: 0.7 }, 222)

    expect(listPaneLayouts(db, repo)).toEqual(["default", "review"])

    const loaded = loadPaneLayout<{ split: string; ratio: number }>(db, repo, "default")
    expect(loaded).toEqual({
      name: "default",
      layout: { split: "vertical", ratio: 0.4 },
      updatedAt: 111,
    })

    // Overwrite.
    savePaneLayout(db, repo, "default", { split: "vertical", ratio: 0.5 }, 333)
    expect(loadPaneLayout(db, repo, "default")?.updatedAt).toBe(333)

    deletePaneLayout(db, repo, "review")
    expect(listPaneLayouts(db, repo)).toEqual(["default"])
  })
})

describe("undo", () => {
  test("monotonic seq per repo + recent-first read + truncate", () => {
    using db = openSessionDb({ home: tmpHome })
    const repo = asRepoId("repo-1")

    const s1 = appendUndo(db, repo, { type: "insert", id: "n-1" }, 100)
    const s2 = appendUndo(db, repo, { type: "delete", id: "n-1" }, 110)
    const s3 = appendUndo(db, repo, { type: "move", id: "n-1", to: "n-2" }, 120)
    expect([s1, s2, s3]).toEqual([1, 2, 3])

    const entries = getUndoEntries(db, repo, 10)
    expect(entries.map((e) => e.seq)).toEqual([3, 2, 1])
    expect(JSON.parse(entries[0]!.opJson)).toEqual({ type: "move", id: "n-1", to: "n-2" })

    truncateUndoUpTo(db, repo, 2)
    const remaining = getUndoEntries(db, repo, 10)
    expect(remaining.map((e) => e.seq)).toEqual([3])
  })
})

// =============================================================================
// Isolation
// =============================================================================

describe("repo isolation", () => {
  test("writes keyed by RepoId do not leak across repos", () => {
    using db = openSessionDb({ home: tmpHome })
    const repoA = asRepoId("repo-A")
    const repoB = asRepoId("repo-B")

    setSessionCursor(db, repoA, "n-a", 100)
    setSessionCursor(db, repoB, "n-b", 200)
    expect(getSessionCursor(db, repoA)?.nodeId).toBe("n-a")
    expect(getSessionCursor(db, repoB)?.nodeId).toBe("n-b")

    addSessionRecent(db, repoA, "recent-A", 300)
    addSessionRecent(db, repoB, "recent-B1", 310)
    addSessionRecent(db, repoB, "recent-B2", 320)
    expect(getSessionRecent(db, repoA).map((r) => r.nodeId)).toEqual(["recent-A"])
    expect(getSessionRecent(db, repoB).map((r) => r.nodeId)).toEqual(["recent-B2", "recent-B1"])

    setCollapsed(db, repoA, "c-A", true)
    setCollapsed(db, repoB, "c-B", true)
    expect(getCollapsedSet(db, repoA)).toEqual(new Set(["c-A"]))
    expect(getCollapsedSet(db, repoB)).toEqual(new Set(["c-B"]))

    const seqA = appendUndo(db, repoA, { op: "a" })
    const seqB = appendUndo(db, repoB, { op: "b" })
    // seq is monotonic PER REPO, so both start at 1.
    expect(seqA).toBe(1)
    expect(seqB).toBe(1)

    // Clearing one repo must not touch the other.
    clearSessionForRepo(db, repoA)
    expect(getSessionCursor(db, repoA)).toBeNull()
    expect(getSessionCursor(db, repoB)?.nodeId).toBe("n-b")
    expect(getSessionRecent(db, repoB).length).toBe(2)
    expect(getCollapsedSet(db, repoB)).toEqual(new Set(["c-B"]))
    expect(getUndoEntries(db, repoB).length).toBe(1)
  })
})

// =============================================================================
// Migration
// =============================================================================

describe("migrateSessionStateFromStateDb", () => {
  test("no-op when state.db has no session_* tables (today's reality)", () => {
    using sessionDb = openSessionDb({ home: tmpHome })
    using stateDb = new Database(":memory:")
    // Typical content table — must be ignored.
    stateDb.run("CREATE TABLE nodes (id TEXT PRIMARY KEY)")

    const counts = migrateSessionStateFromStateDb(sessionDb, stateDb, asRepoId("repo-1"))
    expect(counts).toEqual({ cursor: 0, recent: 0, collapsed: 0, paneLayouts: 0, undo: 0 })
  })

  test("lifts session_* rows out of state.db and drops the source tables", () => {
    using sessionDb = openSessionDb({ home: tmpHome })
    using stateDb = new Database(":memory:")

    // Pre-split shape: session tables existed in state.db, keyed by node_id only.
    stateDb.run(`CREATE TABLE session_cursor (node_id TEXT PRIMARY KEY, updated_at INTEGER)`)
    stateDb.run(`INSERT INTO session_cursor VALUES ('legacy-cursor', 999)`)

    stateDb.run(`CREATE TABLE session_recent (node_id TEXT PRIMARY KEY, opened_at INTEGER)`)
    stateDb.run(`INSERT INTO session_recent VALUES ('legacy-r1', 100), ('legacy-r2', 200)`)

    stateDb.run(`CREATE TABLE session_collapsed (node_id TEXT PRIMARY KEY)`)
    stateDb.run(`INSERT INTO session_collapsed VALUES ('legacy-c1'), ('legacy-c2')`)

    stateDb.run(`CREATE TABLE session_pane_layout (name TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)`)
    stateDb.run(`INSERT INTO session_pane_layout VALUES ('default', '{"split":"v"}', 555)`)

    stateDb.run(`CREATE TABLE session_undo (seq INTEGER PRIMARY KEY, op_json TEXT, ts INTEGER)`)
    stateDb.run(`INSERT INTO session_undo VALUES (1, '{"op":"a"}', 10), (2, '{"op":"b"}', 20)`)

    const repo = asRepoId("legacy-repo")
    const counts = migrateSessionStateFromStateDb(sessionDb, stateDb, repo)
    expect(counts).toEqual({ cursor: 1, recent: 2, collapsed: 2, paneLayouts: 1, undo: 2 })

    // Source tables should be gone — state.db no longer carries session tier.
    const remaining = stateDb
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'session_%'")
      .all() as { name: string }[]
    expect(remaining).toEqual([])

    // Rows should be visible via the normal accessors, keyed by repo.
    expect(getSessionCursor(sessionDb, repo)).toEqual({ nodeId: "legacy-cursor", updatedAt: 999 })
    expect(getSessionRecent(sessionDb, repo).map((r) => r.nodeId)).toEqual(["legacy-r2", "legacy-r1"])
    expect(getCollapsedSet(sessionDb, repo)).toEqual(new Set(["legacy-c1", "legacy-c2"]))
    expect(loadPaneLayout(sessionDb, repo, "default")).toEqual({
      name: "default",
      layout: { split: "v" },
      updatedAt: 555,
    })
    expect(getUndoEntries(sessionDb, repo).map((e) => e.seq)).toEqual([2, 1])

    // Re-running migration is a no-op — tables are already dropped.
    const again = migrateSessionStateFromStateDb(sessionDb, stateDb, repo)
    expect(again).toEqual({ cursor: 0, recent: 0, collapsed: 0, paneLayouts: 0, undo: 0 })
  })
})
