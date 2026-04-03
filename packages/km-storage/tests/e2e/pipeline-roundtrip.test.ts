/**
 * Pipeline Round-Trip Integrity Tests
 *
 * Verifies core file <-> DB sync mechanics:
 *   1. Write file -> sync -> DB reflects file contents
 *   2. Edit DB -> sync -> file reflects DB changes
 *   3. Concurrent fs + DB edits -> sync -> both changes preserved
 *
 * These test pipeline integrity (Layer 3), not individual feature preservation
 * (see roundtrip-features.test.ts for that).
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { getAllNodes, withTestEnv } from "@km/storage"
import type { KNode } from "@km/core"
import { createTestSync } from "../watch/sync-test-helpers.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create sync with test defaults (no worker, no debounce) */
function createTestSyncHelper(db: import("bun:sqlite").Database, repoDir: string) {
  return createTestSync(db, repoDir, {
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
  })
}

/** Get all file-level nodes (mdfile type) */
function getFileNodes(db: import("bun:sqlite").Database): KNode[] {
  return getAllNodes(db).filter((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
}

/** Get all task nodes */
function getTaskNodes(db: import("bun:sqlite").Database): KNode[] {
  return getAllNodes(db).filter((n) => n.item?.task?.status != null)
}

/** Get all section nodes */
function getSectionNodes(db: import("bun:sqlite").Database): KNode[] {
  return getAllNodes(db).filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
}

// =============================================================================
// 1. File -> Sync -> DB
// =============================================================================

describe("file -> sync -> DB", () => {
  test("single file with tasks syncs to DB nodes", () =>
    withTestEnv(async ({ repoDir, data }) => {
      writeFileSync(
        join(repoDir, "tasks.md"),
        "# Tasks\n\n- [ ] Buy groceries\n- [x] Clean kitchen\n- [/] Write report\n",
      )

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      // File node should exist
      const fileNodes = getFileNodes(data.database)
      expect(fileNodes).toHaveLength(1)
      expect(fileNodes[0]!.fs_path).toContain("tasks.md")

      // All three tasks should be in DB with correct statuses
      const tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(3)

      const todo = tasks.find((t) => t.content?.includes("Buy groceries"))
      expect(todo?.item?.task?.status).toBe("todo")

      const done = tasks.find((t) => t.content?.includes("Clean kitchen"))
      expect(done?.item?.task?.status).toBe("done")

      const wip = tasks.find((t) => t.content?.includes("Write report"))
      expect(wip?.item?.task?.status).toBe("wip")
    }))

  test("multiple files each get their own file node", () =>
    withTestEnv(async ({ repoDir, data }) => {
      writeFileSync(join(repoDir, "alpha.md"), "# Alpha\n\n- [ ] Task A\n")
      writeFileSync(join(repoDir, "beta.md"), "# Beta\n\n- [ ] Task B\n")
      writeFileSync(join(repoDir, "gamma.md"), "# Gamma\n\n- [ ] Task C\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      const fileNodes = getFileNodes(data.database)
      expect(fileNodes).toHaveLength(3)

      const names = fileNodes.map((n) => n.content).sort()
      expect(names).toEqual(["Alpha", "Beta", "Gamma"])

      // Each file should have exactly one task
      for (const fileNode of fileNodes) {
        const children = getAllNodes(data.database).filter(
          (n) => n.parent_id === fileNode.id && n.item?.task?.status != null,
        )
        expect(children).toHaveLength(1)
      }
    }))

  test("sections create hierarchical DB structure", () =>
    withTestEnv(async ({ repoDir, data }) => {
      writeFileSync(
        join(repoDir, "board.md"),
        "# Board\n\n## Todo\n\n- [ ] First task\n\n## Done\n\n- [x] Finished task\n",
      )

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      // Should have file node + 2 sections
      const fileNodes = getFileNodes(data.database)
      expect(fileNodes).toHaveLength(1)

      const sections = getSectionNodes(data.database)
      expect(sections).toHaveLength(2)

      // Sections should be children of the file node
      for (const section of sections) {
        expect(section.parent_id).toBe(fileNodes[0]!.id)
      }

      // Tasks should be under their respective sections
      const todoSection = sections.find((s) => s.content === "Todo" || s.title === "Todo")!
      const doneSection = sections.find((s) => s.content === "Done" || s.title === "Done")!

      const todoTasks = getTaskNodes(data.database).filter((t) => t.parent_id === todoSection.id)
      expect(todoTasks).toHaveLength(1)
      expect(todoTasks[0]!.item?.task?.status).toBe("todo")

      const doneTasks = getTaskNodes(data.database).filter((t) => t.parent_id === doneSection.id)
      expect(doneTasks).toHaveLength(1)
      expect(doneTasks[0]!.item?.task?.status).toBe("done")
    }))

  test("re-syncing after external file edit updates DB", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "evolving.md")
      writeFileSync(filePath, "# Evolving\n\n- [ ] Original task\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      let tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(1)
      expect(tasks[0]!.content).toContain("Original task")

      // Simulate external edit: add a second task
      writeFileSync(filePath, "# Evolving\n\n- [ ] Original task\n- [ ] Added externally\n")
      await manager.syncFromFs()

      tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(2)
      expect(tasks.some((t) => t.content?.includes("Added externally"))).toBe(true)
    }))
})

// =============================================================================
// 2. DB edit -> Sync -> File
// =============================================================================

describe("DB edit -> sync -> file", () => {
  test("marking task done in DB updates file checkbox", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "tasks.md")
      writeFileSync(filePath, "# Tasks\n\n- [ ] Buy groceries\n- [ ] Walk dog\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      // Find the "Buy groceries" task and mark it done
      const tasks = getTaskNodes(data.database)
      const grocery = tasks.find((t) => t.content?.includes("Buy groceries"))!
      expect(grocery).toBeDefined()

      data.updateNode(grocery.id, {
        item: { task: { status: "done", marker: "[x]" } },
      })

      // Sync DB -> file
      await manager.syncToFs()

      const content = readFileSync(filePath, "utf-8")
      expect(content).toContain("[x] Buy groceries")
      // Other task should remain unchanged
      expect(content).toContain("[ ] Walk dog")
    }))

  test("editing task content in DB updates file text", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "rename.md")
      writeFileSync(filePath, "# Rename\n\n- [ ] Old name\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      const tasks = getTaskNodes(data.database)
      const task = tasks.find((t) => t.content?.includes("Old name"))!

      data.updateNode(task.id, { content: "New name" })
      await manager.syncToFs()

      const content = readFileSync(filePath, "utf-8")
      expect(content).toContain("New name")
      expect(content).not.toContain("Old name")
    }))

  test("adding due date in DB appears in file", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "dates.md")
      writeFileSync(filePath, "# Dates\n\n- [ ] Schedule meeting\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      const tasks = getTaskNodes(data.database)
      const task = tasks.find((t) => t.content?.includes("Schedule meeting"))!

      data.updateNode(task.id, { due_at: "2026-06-15" })
      await manager.syncToFs()

      const content = readFileSync(filePath, "utf-8")
      // File should contain the due date in some format
      expect(content).toContain("2026-06-15")
    }))

  test("DB edits survive re-parse (DB -> file -> DB round-trip)", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "full-cycle.md")
      writeFileSync(filePath, "# Cycle\n\n- [ ] Alpha task\n- [ ] Beta task\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      // Mark Alpha done in DB
      const tasks = getTaskNodes(data.database)
      const alpha = tasks.find((t) => t.content?.includes("Alpha"))!
      data.updateNode(alpha.id, {
        item: { task: { status: "done", marker: "[x]" } },
      })

      // DB -> file
      await manager.syncToFs()

      // Verify file has the change
      const content = readFileSync(filePath, "utf-8")
      expect(content).toContain("[x] Alpha")

      // file -> DB (re-parse)
      await manager.syncFromFs()

      // The done status should persist through the re-parse
      const allNodes = getAllNodes(data.database)
      const alphaAfter = allNodes.find((n) => n.content?.includes("Alpha") && n.item?.task?.status != null)
      expect(alphaAfter?.item?.task?.status).toBe("done")

      // Beta should still be todo
      const betaAfter = allNodes.find((n) => n.content?.includes("Beta") && n.item?.task?.status != null)
      expect(betaAfter?.item?.task?.status).toBe("todo")
    }))
})

// =============================================================================
// 3. Concurrent fs + DB edits
// =============================================================================

describe("concurrent fs + DB edits", () => {
  test("DB edit persisted to file, then external file addition, both survive", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "concurrent.md")
      writeFileSync(filePath, "# Concurrent\n\n- [ ] Task Alpha\n- [ ] Task Beta\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      // DB edit: mark Beta done
      const tasks = getTaskNodes(data.database)
      const beta = tasks.find((t) => t.content?.includes("Beta"))!
      data.updateNode(beta.id, {
        item: { task: { status: "done", marker: "[x]" } },
      })

      // Persist DB change to file first
      await manager.syncToFs()

      let content = readFileSync(filePath, "utf-8")
      expect(content).toContain("[x] Task Beta")

      // Now simulate external editor adding a task to the updated file
      content = content.trimEnd() + "\n- [ ] Task Gamma\n"
      writeFileSync(filePath, content)

      // Sync file -> DB (picks up Gamma while preserving Beta done)
      await manager.syncFromFs()

      const allTasks = getTaskNodes(data.database)
      expect(allTasks).toHaveLength(3)

      // Beta should still be done (persisted before external edit)
      const betaAfter = allTasks.find((t) => t.content?.includes("Beta"))
      expect(betaAfter?.item?.task?.status).toBe("done")

      // Gamma should exist (from external edit)
      expect(allTasks.some((t) => t.content?.includes("Gamma"))).toBe(true)

      // Alpha should still be todo
      const alphaAfter = allTasks.find((t) => t.content?.includes("Alpha"))
      expect(alphaAfter?.item?.task?.status).toBe("todo")
    }))

  test("multiple sync cycles preserve accumulated changes", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "multi-cycle.md")
      writeFileSync(filePath, "# Multi\n\n- [ ] Step 1\n- [ ] Step 2\n- [ ] Step 3\n")

      const manager = createTestSyncHelper(data.database, repoDir)

      // Cycle 1: import
      await manager.syncFromFs()
      let tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(3)

      // Cycle 2: complete Step 1 in DB, sync out
      const step1 = tasks.find((t) => t.content?.includes("Step 1"))!
      data.updateNode(step1.id, { item: { task: { status: "done", marker: "[x]" } } })
      await manager.syncToFs()

      // Cycle 3: complete Step 2 in DB, sync out
      await manager.syncFromFs() // re-import to get fresh state
      tasks = getTaskNodes(data.database)
      const step2 = tasks.find((t) => t.content?.includes("Step 2"))!
      data.updateNode(step2.id, { item: { task: { status: "done", marker: "[x]" } } })
      await manager.syncToFs()

      // Verify: Steps 1 and 2 done, Step 3 still todo
      const content = readFileSync(filePath, "utf-8")
      expect(content).toContain("[x] Step 1")
      expect(content).toContain("[x] Step 2")
      expect(content).toContain("[ ] Step 3")

      // DB should also reflect accumulated state
      await manager.syncFromFs()
      tasks = getTaskNodes(data.database)
      const finalStep1 = tasks.find((t) => t.content?.includes("Step 1"))!
      const finalStep2 = tasks.find((t) => t.content?.includes("Step 2"))!
      const finalStep3 = tasks.find((t) => t.content?.includes("Step 3"))!
      expect(finalStep1.item?.task?.status).toBe("done")
      expect(finalStep2.item?.task?.status).toBe("done")
      expect(finalStep3.item?.task?.status).toBe("todo")
    }))

  test("file restructure (adding section) preserves DB task metadata", () =>
    withTestEnv(async ({ repoDir, data }) => {
      const filePath = join(repoDir, "restructure.md")
      // Start with flat structure
      writeFileSync(filePath, "# Board\n\n- [ ] Task A\n- [x] Task B\n")

      const manager = createTestSyncHelper(data.database, repoDir)
      await manager.syncFromFs()

      let tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(2)

      // External edit: restructure into sections
      writeFileSync(filePath, "# Board\n\n## Active\n\n- [ ] Task A\n\n## Completed\n\n- [x] Task B\n")
      await manager.syncFromFs()

      // After restructure, tasks should still exist with correct statuses
      tasks = getTaskNodes(data.database)
      expect(tasks).toHaveLength(2)

      const taskA = tasks.find((t) => t.content?.includes("Task A"))
      expect(taskA?.item?.task?.status).toBe("todo")

      const taskB = tasks.find((t) => t.content?.includes("Task B"))
      expect(taskB?.item?.task?.status).toBe("done")

      // Sections should now exist
      const sections = getSectionNodes(data.database)
      expect(sections.length).toBeGreaterThanOrEqual(2)
    }))
})
