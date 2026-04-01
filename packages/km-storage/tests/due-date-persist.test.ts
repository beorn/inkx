/**
 * Due Date Persistence Tests
 *
 * Verifies that due_at set via updateNode persists:
 * 1. In the database after updateNode
 * 2. In the markdown file after write-through
 * 3. After re-parsing the file (round-trip)
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { withTestEnv, getAllNodes, getNode } from "@km/storage"
import { parseMarkdownToNodes, nodesToMarkdown } from "@km/markdown"
import { SyncManager } from "../src/watch/sync.ts"

/** Create a SyncManager with test defaults */
function createSyncManager(db: import("bun:sqlite").Database, repoDir: string) {
  return new SyncManager({
    repoPath: repoDir,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
    useWorker: false,
    db,
  })
}

describe("due date persistence", () => {
  test("updateNode sets due_at in DB", () =>
    withTestEnv(async ({ repoDir, data, db }) => {
      // Write a file with a task (no due date)
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy milk\n")

      // Sync file → DB
      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Find the task node
      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.content === "Buy milk")
      expect(task).toBeDefined()
      expect(task!.due_at).toBeUndefined()

      // Set due_at via updateNode
      data.updateNode(task!.id, { due_at: "2026-02-14" })

      // Verify DB has due_at
      const updated = getNode(db, task!.id)
      expect(updated?.due_at).toBe("2026-02-14")
    }))

  test("due_at appears in serialized markdown via nodesToMarkdown", () =>
    withTestEnv(async ({ repoDir, data, db }) => {
      // Write a file with a task
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy milk\n")

      // Sync file → DB
      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Find the task and set due_at
      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.content === "Buy milk")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { due_at: "2026-02-14" })

      // Serialize back to markdown
      const fileNode = allNodes.find(
        (n) => n.type === "h" && n.item != null && (n.fstype === "mdfile" || n.fstype === "file"),
      )
      expect(fileNode).toBeDefined()

      // Re-read all nodes from DB (to get updated due_at)
      const updatedNodes = getAllNodes(db)
      const subtree = updatedNodes.filter((n) => {
        // Include file node and all descendants
        let current = n
        for (let i = 0; i < 10; i++) {
          if (current.id === fileNode!.id) return true
          if (!current.parent_id) return false
          const parent = updatedNodes.find((p) => p.id === current.parent_id)
          if (!parent) return false
          current = parent
        }
        return false
      })

      const md = nodesToMarkdown(subtree, updatedNodes)
      expect(md).toContain("2026-02-14")
    }))

  test("due_at survives file write-through and re-parse", () =>
    withTestEnv(async ({ repoDir, data, db }) => {
      // Write a file with a task
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy milk\n")

      // Sync file → DB
      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Find the task and set due_at
      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.content === "Buy milk")
      expect(task).toBeDefined()
      data.updateNode(task!.id, { due_at: "2026-02-14" })

      // Sync DB → FS (write-through)
      await manager.syncToFs()

      // Read the file and verify date is present
      const fileContent = readFileSync(filePath, "utf-8")
      expect(fileContent).toContain("2026-02-14")

      // Re-parse the file and verify due_at survives
      const reparsed = parseMarkdownToNodes(fileContent, filePath)
      const reparsedTask = reparsed.find((n) => n.content?.includes("Buy milk"))
      expect(reparsedTask).toBeDefined()
      expect(reparsedTask!.due_at).toBe("2026-02-14")
    }))

  test("due_at with inline format (due:) survives round-trip", () =>
    withTestEnv(async ({ repoDir, data, db }) => {
      // Write a file with a task that already has inline due date
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy milk due:2026-02-14\n")

      // Sync file → DB
      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Verify due_at was parsed
      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.content?.includes("Buy milk"))
      expect(task).toBeDefined()
      expect(task!.due_at).toBe("2026-02-14")

      // Sync DB → FS → re-parse
      await manager.syncToFs()

      const fileContent = readFileSync(filePath, "utf-8")
      // Should not have duplicate dates
      const dateCount = (fileContent.match(/2026-02-14/g) ?? []).length
      expect(dateCount).toBe(1)

      // Re-parse should still have the date
      const reparsed = parseMarkdownToNodes(fileContent, filePath)
      const reparsedTask = reparsed.find((n) => n.content?.includes("Buy milk"))
      expect(reparsedTask).toBeDefined()
      expect(reparsedTask!.due_at).toBe("2026-02-14")
    }))

  test("due_at with emoji format survives round-trip", () =>
    withTestEnv(async ({ repoDir, data, db }) => {
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy milk 📅 2026-02-14\n")

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.content?.includes("Buy milk"))
      expect(task).toBeDefined()
      expect(task!.due_at).toBe("2026-02-14")

      // Round-trip
      await manager.syncToFs()

      const fileContent = readFileSync(filePath, "utf-8")
      const dateCount = (fileContent.match(/2026-02-14/g) ?? []).length
      expect(dateCount).toBe(1)

      const reparsed = parseMarkdownToNodes(fileContent, filePath)
      const reparsedTask = reparsed.find((n) => n.content?.includes("Buy milk"))
      expect(reparsedTask).toBeDefined()
      expect(reparsedTask!.due_at).toBe("2026-02-14")
    }))
})
