/**
 * Test migration logic for repo root node
 */
import { test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { loadRepo, migrateToRepoRootNode } from "../src/repo-loader.ts"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

test("migrateToRepoRootNode creates repo root for existing nodes", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))

  // Create a test markdown file
  writeFileSync(join(tmpDir, "test.md"), "# Test\n\nContent")

  // Create database with schema
  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Load repo (should trigger migration)
  const result = loadRepo(tmpDir, { db, searchAncestors: false })
  let done = false
  while (!done) {
    const next = result.next()
    done = next.done ?? false
  }

  // Verify repo root node was created
  const repoRootNode = db
    .prepare("SELECT * FROM nodes WHERE parent_id IS NULL AND type = 'folder'")
    .get() as { id: string; content: string; data: string } | undefined

  if (!repoRootNode) {
    throw new Error("No repo root node found")
  }

  const data = JSON.parse(repoRootNode.data) as { is_repo_root?: boolean }
  if (!data.is_repo_root) {
    throw new Error("Repo root node missing is_repo_root flag")
  }

  // Verify all other nodes have parent_id set
  const orphanCount = (
    db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL")
      .get() as { count: number }
  ).count

  if (orphanCount !== 1) {
    throw new Error(`Expected 1 root node (repo root), found ${orphanCount}`)
  }
})

test("migrateToRepoRootNode skips if repo root already exists", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))

  // Create a test markdown file
  writeFileSync(join(tmpDir, "test.md"), "# Test\n\nContent")

  // Create database with schema
  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Load repo twice (second time should skip migration)
  const result1 = loadRepo(tmpDir, { db, searchAncestors: false })
  let done = false
  while (!done) {
    const next = result1.next()
    done = next.done ?? false
  }

  const nodeCountBefore = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count

  // Run again - should skip migration
  const result2 = loadRepo(tmpDir, { db, force: true, searchAncestors: false })
  done = false
  while (!done) {
    const next = result2.next()
    done = next.done ?? false
  }

  const nodeCountAfter = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count

  // Should have same number of nodes (repo root created once)
  if (nodeCountBefore !== nodeCountAfter) {
    throw new Error(
      `Node count changed: ${nodeCountBefore} -> ${nodeCountAfter}`,
    )
  }
})

test("migrateToRepoRootNode reparents orphan folders to repo root", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-test-"))

  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Simulate disk-mode replay: events.jsonl created BEFORE repo root existed.
  // The repo root "." gets created by migration, but top-level folders
  // were recorded with parent_id = NULL in the old events.
  const now = Date.now()
  const insertNode = db.prepare(`
    INSERT INTO nodes (id, type, parent_id, parent_idx, name, content, data, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Pre-create the repo root (as migration would)
  insertNode.run(
    ".",
    "folder",
    null,
    0,
    "root",
    "root",
    JSON.stringify({ is_repo_root: true }),
    now,
    now,
    "",
  )

  // Orphan folders (as they appear after replaying old events)
  insertNode.run(
    "inbox",
    "folder",
    null,
    1,
    "inbox",
    "inbox",
    "{}",
    now,
    now,
    "",
  )
  insertNode.run(
    "projects",
    "folder",
    null,
    2,
    "projects",
    "projects",
    "{}",
    now,
    now,
    "",
  )
  insertNode.run(
    "areas",
    "folder",
    null,
    3,
    "areas",
    "areas",
    "{}",
    now,
    now,
    "",
  )

  // Orphan file (should also be migrated)
  insertNode.run("file1", "file", null, 4, "test", "test", "{}", now, now, "")

  // Run migration - should reparent orphan folders AND files
  migrateToRepoRootNode(db, tmpDir)

  // Only the repo root itself should have parent_id = NULL
  const orphans = db
    .prepare("SELECT id, type FROM nodes WHERE parent_id IS NULL")
    .all() as { id: string; type: string }[]

  expect(orphans).toHaveLength(1)
  expect(orphans[0].id).toBe(".")

  // All non-root folders should be children of "."
  const folders = db
    .prepare(
      "SELECT id, parent_id FROM nodes WHERE type = 'folder' AND id != '.'",
    )
    .all() as { id: string; parent_id: string | null }[]

  expect(folders).toHaveLength(3)
  for (const folder of folders) {
    expect(folder.parent_id).toBe(".")
  }

  // File should also be reparented
  const file = db
    .prepare("SELECT parent_id FROM nodes WHERE id = 'file1'")
    .get() as { parent_id: string }
  expect(file.parent_id).toBe(".")
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

  // Load repo
  const gen = loadRepo(tmpDir, { db, searchAncestors: false })
  let done = false
  while (!done) {
    const next = gen.next()
    done = next.done ?? false
  }

  // All root-level items (folders + files) should be children of repo root
  const repoRoot = db
    .prepare(
      "SELECT id FROM nodes WHERE json_extract(data, '$.is_repo_root') = 1",
    )
    .get() as { id: string }

  const rootChildren = db
    .prepare("SELECT id, type, name FROM nodes WHERE parent_id = ?")
    .all(repoRoot.id) as { id: string; type: string; name: string }[]

  const childNames = rootChildren.map((c) => c.name).sort()

  // Should include both folders and files
  expect(childNames).toContain("inbox")
  expect(childNames).toContain("projects")
  expect(childNames).toContain("board")

  // No orphan folders (except repo root)
  const orphanFolders = db
    .prepare(
      "SELECT id FROM nodes WHERE parent_id IS NULL AND type = 'folder' AND json_extract(data, '$.is_repo_root') != 1",
    )
    .all() as { id: string }[]

  expect(orphanFolders).toHaveLength(0)
})
