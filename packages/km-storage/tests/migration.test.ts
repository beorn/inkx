/**
 * Test repo root node creation
 */
import { test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { loadRepo, ensureRepoRootNode } from "../src/repo-loader.ts"
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
  expect(JSON.parse(root.data).is_repo_root).toBe(true)
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
