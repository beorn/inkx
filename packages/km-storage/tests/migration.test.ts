/**
 * Test migration logic for repo root node
 */
import { test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import { loadRepo } from "../src/repo-loader.ts"
import { mkdtempSync, writeFileSync } from "fs"
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
