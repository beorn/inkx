/**
 * Test repo root node creation
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA, migrateSchema } from "../src/db/schema.ts"
import { loadRepo, ensureRepoRootNode } from "../src/repo/loader.ts"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

test("ensureRepoRootNode creates root node in empty DB", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))
  const db = new Database(":memory:")
  db.run(SCHEMA)

  ensureRepoRootNode(db, tmpDir)

  const root = db.prepare("SELECT * FROM nodes WHERE id = '.'").get() as {
    id: string
    type: string
    fs_path: string
    data: string
  }

  expect(root).toBeDefined()
  expect(root.type).toBe("h")
  expect(root.fs_path).toBe(".")
  expect((JSON.parse(root.data) as Record<string, unknown>).is_repo_root).toBe(true)
})

test("ensureRepoRootNode is idempotent", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))
  const db = new Database(":memory:")
  db.run(SCHEMA)

  ensureRepoRootNode(db, tmpDir)
  ensureRepoRootNode(db, tmpDir) // second call should be no-op

  const roots = db.prepare("SELECT id FROM nodes WHERE id = '.'").all() as {
    id: string
  }[]

  expect(roots).toHaveLength(1)
})

test("loadRepo creates root and reparents all top-level nodes", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))

  // Create a test markdown file
  writeFileSync(join(tmpDir, "test.md"), "# Test\n\nContent")

  const db = new Database(":memory:")
  db.run(SCHEMA)

  const gen = loadRepo(tmpDir, { db, searchAncestors: false })
  let done = false
  while (!done) {
    const next = gen.next()
    done = next.done ?? false
  }

  // Verify repo root exists
  const root = db.prepare("SELECT id FROM nodes WHERE id = '.'").get() as {
    id: string
  }
  expect(root).toBeDefined()

  // Only root should have parent_id = NULL
  const orphanCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL").get() as { count: number }
  ).count
  expect(orphanCount).toBe(1) // just the root "."
})

test("vault with folders shows them as board columns", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))

  // Create a vault with subdirectories and files
  mkdirSync(join(tmpDir, "inbox"))
  mkdirSync(join(tmpDir, "projects"))
  writeFileSync(join(tmpDir, "board.md"), "# Board\n\n## Column 1\n")
  writeFileSync(join(tmpDir, "inbox", "task.md"), "# Task\n- [ ] Do thing\n")
  writeFileSync(join(tmpDir, "projects", "proj.md"), "# Project\n")

  const db = new Database(":memory:")
  db.run(SCHEMA)

  const gen = loadRepo(tmpDir, { db, searchAncestors: false })
  let done = false
  while (!done) {
    const next = gen.next()
    done = next.done ?? false
  }

  // All root-level items should be children of "."
  const rootChildren = db.prepare("SELECT id, type, name FROM nodes WHERE parent_id = '.'").all() as {
    id: string
    type: string
    name: string
  }[]

  const childNames = rootChildren.map((c) => c.name).sort()
  expect(childNames).toContain("inbox")
  expect(childNames).toContain("projects")
  expect(childNames).toContain("board")

  // No orphan folders (except repo root)
  const orphanFolders = db.prepare("SELECT id FROM nodes WHERE parent_id IS NULL AND id != '.'").all() as {
    id: string
  }[]

  expect(orphanFolders).toHaveLength(0)
})

describe("SQLite performance optimizations", () => {
  test("covering index idx_nodes_parent_order exists with correct columns", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    const indexInfo = db.prepare("PRAGMA index_info(idx_nodes_parent_order)").all() as {
      seqno: number
      cid: number
      name: string
    }[]

    expect(indexInfo).toHaveLength(2)
    expect(indexInfo[0]!.name).toBe("parent_id")
    expect(indexInfo[1]!.name).toBe("parent_idx")
  })

  test("old idx_nodes_parent index is dropped by migration", () => {
    const db = new Database(":memory:")

    // Create a minimal schema with the OLD single-column index
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        parent_idx REAL DEFAULT 0,
        fstype TEXT,
        item INTEGER DEFAULT 0,
        embed_source TEXT,
        fs_path TEXT,
        fs_ino INTEGER,
        fs_mtime INTEGER,
        name TEXT,
        block_id TEXT,
        title TEXT,
        md_pos INTEGER,
        md_line INTEGER,
        list_marker TEXT,
        task_marker TEXT,
        task_status TEXT,
        assigned_to TEXT,
        due_at TEXT,
        start_at TEXT,
        due_date TEXT,
        scheduled_date TEXT,
        priority INTEGER,
        content TEXT,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT
      )
    `)
    db.run("CREATE INDEX idx_nodes_parent ON nodes(parent_id)")

    // Verify old index exists before migration
    const beforeIndexes = db.prepare("PRAGMA index_list(nodes)").all() as { name: string }[]
    expect(beforeIndexes.map((i) => i.name)).toContain("idx_nodes_parent")

    // Run migration
    migrateSchema(db)

    // Verify old index is gone
    const afterIndexes = db.prepare("PRAGMA index_list(nodes)").all() as { name: string }[]
    expect(afterIndexes.map((i) => i.name)).not.toContain("idx_nodes_parent")
  })

  test("FTS prefix search works with prefix='2,3,4'", () => {
    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Insert nodes with content — triggers auto-populate FTS via triggers
    db.run("INSERT INTO nodes (id, type, content) VALUES ('n1', 'p', 'project planning document')")
    db.run("INSERT INTO nodes (id, type, content) VALUES ('n2', 'p', 'programming in TypeScript')")
    db.run("INSERT INTO nodes (id, type, content) VALUES ('n3', 'p', 'unrelated content here')")

    // Prefix search — should match nodes containing words starting with "proj"
    const results = db.prepare("SELECT id FROM nodes_fts WHERE nodes_fts MATCH 'proj*'").all() as { id: string }[]

    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.map((r) => r.id)).toContain("n1")
  })

  test("SQLite pragmas applied for disk mode", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-pragma-test-"))
    const dbPath = join(tmpDir, "test.db")
    const db = new Database(dbPath)

    // Apply the same pragmas as repo.ts disk mode
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA temp_store = MEMORY")
    db.run("PRAGMA cache_size = -200000")
    db.run("PRAGMA mmap_size = 268435456")
    db.run("PRAGMA wal_autocheckpoint = 10000")

    // Verify pragmas are set correctly
    const journalMode = (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode
    expect(journalMode).toBe("wal")

    const synchronous = (db.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous
    expect(synchronous).toBe(1) // NORMAL = 1

    const tempStore = (db.prepare("PRAGMA temp_store").get() as { temp_store: number }).temp_store
    expect(tempStore).toBe(2) // MEMORY = 2

    db.close()
  })
})
