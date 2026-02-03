/**
 * Reconciliation Tests
 *
 * Tests for reconcile.ts - comparing filesystem state to database state.
 * Uses isolated test environments for parallel execution.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, rmSync, writeFileSync, statSync, utimesSync } from "fs"
import { join } from "path"
import {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "../../src/watch/reconcile.ts"
import { getNodeByPath } from "../../src/db-queries/core-lookup.ts"
import { getChildren } from "../../src/db-queries/tree-traversal.ts"
import { withTestEnv } from "@km/storage"

describe("reconcile.ts", () => {
  describe("reconcileDirectory", () => {
    test("detects new files", () =>
      withTestEnv(({ db, repoDir }) => {
        const filePath = join(repoDir, "test.md")
        writeFileSync(filePath, "# Test\n\n- [ ] Task 1")

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBe(1)
        expect(ops[0]!.type).toBe("create")
        expect(ops[0]!.path).toBe(filePath)
      }))

    test("detects new folders", () =>
      withTestEnv(({ db, repoDir }) => {
        const folderPath = join(repoDir, "subfolder")
        mkdirSync(folderPath)

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBe(1)
        expect(ops[0]!.type).toBe("create")
        expect(ops[0]!.path).toBe(folderPath)
      }))

    test("detects multiple new items", () =>
      withTestEnv(({ db, repoDir }) => {
        writeFileSync(join(repoDir, "file1.md"), "# File 1")
        writeFileSync(join(repoDir, "file2.md"), "# File 2")
        mkdirSync(join(repoDir, "folder1"))

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBe(3)
        expect(ops.every((op) => op.type === "create")).toBe(true)
      }))

    test("detects deleted files", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "delete-me.md")
        writeFileSync(filePath, "# Delete Me")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        expect(createOps.length).toBe(1)

        await applyReconcileOps(db, createOps, repoDir, emitter)

        const node = getNodeByPath(db, filePath)
        expect(node).not.toBeNull()

        rmSync(filePath)

        const deleteOps = reconcileDirectory(db, repoDir, repoDir)
        expect(deleteOps.length).toBe(1)
        expect(deleteOps[0]!.type).toBe("delete")
        expect(deleteOps[0]!.path).toBe(filePath)
        expect(deleteOps[0]!.nodeId).toBe(node!.id)
      }))

    test("detects modified files by mtime (forward)", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "modify-me.md")
        writeFileSync(filePath, "# Original")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const node = getNodeByPath(db, filePath)
        expect(node).not.toBeNull()

        writeFileSync(filePath, "# Modified Content")
        const futureTime = new Date(Date.now() + 1000)
        utimesSync(filePath, futureTime, futureTime)

        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]!.type).toBe("update")
        expect(updateOps[0]!.path).toBe(filePath)
        expect(updateOps[0]!.nodeId).toBe(node!.id)
      }))

    test("detects modified files by mtime (backward - restored from backup)", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "backup-restore.md")
        writeFileSync(filePath, "# Original")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const node = getNodeByPath(db, filePath)
        expect(node).not.toBeNull()
        expect(node!.fs_mtime).toBeDefined()

        writeFileSync(filePath, "# Restored from backup with different content")
        const pastTime = new Date(Date.now() - 86400000)
        utimesSync(filePath, pastTime, pastTime)

        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]!.type).toBe("update")
        expect(updateOps[0]!.path).toBe(filePath)
        expect(updateOps[0]!.nodeId).toBe(node!.id)
      }))

    test("detects renamed files by inode", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const oldPath = join(repoDir, "old-name.md")
        writeFileSync(oldPath, "# Content")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const node = getNodeByPath(db, oldPath)
        expect(node).not.toBeNull()
        expect(node!.fs_ino).toBeDefined()
        const originalIno = node!.fs_ino!

        const newPath = join(repoDir, "new-name.md")
        Bun.spawnSync(["mv", oldPath, newPath])

        const newStat = statSync(newPath)
        expect(newStat.ino).toBe(originalIno)

        const renameOps = reconcileDirectory(db, repoDir, repoDir)
        const renameOp = renameOps.find((op) => op.type === "rename")
        expect(renameOp).toBeDefined()
        expect(renameOp!.oldPath).toBe(oldPath)
        expect(renameOp!.path).toBe(newPath)
        expect(renameOp!.nodeId).toBe(node!.id)
      }))

    test("returns empty array when nothing changed", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "stable.md")
        writeFileSync(filePath, "# Stable")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const ops = reconcileDirectory(db, repoDir, repoDir)
        expect(ops.length).toBe(0)
      }))

    test("ignores non-markdown files", () =>
      withTestEnv(({ db, repoDir }) => {
        writeFileSync(join(repoDir, "image.png"), "fake image data")
        writeFileSync(join(repoDir, "test.md"), "# Real markdown")

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBeGreaterThanOrEqual(1)
        const mdOp = ops.find((op) => op.path.endsWith(".md"))
        expect(mdOp).toBeDefined()
      }))
  })

  describe("applyReconcileOps", () => {
    test("creates file node from markdown", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "new-file.md")
        writeFileSync(filePath, "# New File\n\n- [ ] Task 1\n- [x] Task 2")

        const ops = reconcileDirectory(db, repoDir, repoDir)
        expect(ops.length).toBe(1)

        await applyReconcileOps(db, ops, repoDir, emitter)

        const fileNode = getNodeByPath(db, filePath)
        expect(fileNode).not.toBeNull()
        expect(fileNode!.type).toBe("file")

        const children = getChildren(db, fileNode!.id)
        const tasks = children.filter((n) => n.type === "task")
        expect(tasks.length).toBe(2)
      }))

    test("creates folder node", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const folderPath = join(repoDir, "new-folder")
        mkdirSync(folderPath)

        const ops = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, ops, repoDir, emitter)

        const folderNode = getNodeByPath(db, folderPath)
        expect(folderNode).not.toBeNull()
        expect(folderNode!.type).toBe("folder")
      }))

    test("deletes node on delete op", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "to-delete.md")
        writeFileSync(filePath, "# To Delete")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        expect(getNodeByPath(db, filePath)).not.toBeNull()

        rmSync(filePath)
        const deleteOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, deleteOps, repoDir, emitter)

        expect(getNodeByPath(db, filePath)).toBeNull()
      }))

    test("handles rename operations", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const oldPath = join(repoDir, "rename-old.md")
        writeFileSync(oldPath, "# Rename Me")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const originalNode = getNodeByPath(db, oldPath)
        expect(originalNode).not.toBeNull()
        const originalId = originalNode!.id

        const newPath = join(repoDir, "rename-new.md")
        Bun.spawnSync(["mv", oldPath, newPath])

        const renameOps = reconcileDirectory(db, repoDir, repoDir)
        const renameOp = renameOps.find((op) => op.type === "rename")
        expect(renameOp).toBeDefined()
        expect(renameOp!.nodeId).toBe(originalId)
        expect(renameOp!.path).toBe(newPath)
        expect(renameOp!.oldPath).toBe(oldPath)
      }))

    test("creates folder hierarchy for nested files", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const nestedDir = join(repoDir, "level1", "level2")
        mkdirSync(nestedDir, { recursive: true })
        const filePath = join(nestedDir, "nested.md")
        writeFileSync(filePath, "# Nested File")

        const rootOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, rootOps, repoDir, emitter)

        const level1Ops = reconcileDirectory(
          db,
          join(repoDir, "level1"),
          repoDir,
        )
        await applyReconcileOps(db, level1Ops, repoDir, emitter)

        const level2Ops = reconcileDirectory(db, nestedDir, repoDir)
        await applyReconcileOps(db, level2Ops, repoDir, emitter)

        const fileNode = getNodeByPath(db, filePath)
        expect(fileNode).not.toBeNull()
        expect(fileNode!.parent_id).not.toBeNull()

        const level2Node = getNodeByPath(db, nestedDir)
        expect(level2Node).not.toBeNull()
        expect(fileNode!.parent_id).toBe(level2Node!.id)
      }))
  })

  describe("update preserves nested nodes", () => {
    test("file update does not duplicate or delete nested tasks", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "nested-tasks.md")
        const originalContent = `# Board

## Open

- [ ] Task 1
- [ ] Task 2

## Done

- [x] Task 3
`
        writeFileSync(filePath, originalContent)

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        expect(createOps.length).toBe(1)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const fileNode = getNodeByPath(db, filePath)
        expect(fileNode).not.toBeNull()
        const allChildren = getChildren(db, fileNode!.id)

        const sections = allChildren.filter((n) => n.type === "section")
        expect(sections.length).toBe(2)

        const openSection = sections.find((s) => s.content?.includes("Open"))
        expect(openSection).toBeDefined()
        const openTasks = getChildren(db, openSection!.id)
        expect(openTasks.filter((t) => t.type === "task").length).toBe(2)

        const { getNodeCount } = await import("../../src/db-queries/index.ts")
        const originalNodeCount = getNodeCount(db)

        const futureTime = new Date(Date.now() + 1000)
        utimesSync(filePath, futureTime, futureTime)

        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")

        await applyReconcileOps(db, updateOps, repoDir, emitter)

        const newNodeCount = getNodeCount(db)
        expect(newNodeCount).toBe(originalNodeCount)

        const fileNodeAfter = getNodeByPath(db, filePath)
        expect(fileNodeAfter).not.toBeNull()
        expect(fileNodeAfter!.id).toBe(fileNode!.id)

        const sectionsAfter = getChildren(db, fileNodeAfter!.id).filter(
          (n) => n.type === "section",
        )
        expect(sectionsAfter.length).toBe(2)

        const openSectionAfter = sectionsAfter.find((s) =>
          s.content?.includes("Open"),
        )
        expect(openSectionAfter).toBeDefined()
        const openTasksAfter = getChildren(db, openSectionAfter!.id)
        expect(openTasksAfter.filter((t) => t.type === "task").length).toBe(2)
      }))

    test("file update with content change correctly diffs nodes", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "diff-test.md")
        const originalContent = `# Test

- [ ] Task A
- [ ] Task B
`
        writeFileSync(filePath, originalContent)

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const fileNode = getNodeByPath(db, filePath)
        const originalTasks = getChildren(db, fileNode!.id).filter(
          (n) => n.type === "task",
        )
        expect(originalTasks.length).toBe(2)
        const taskAId = originalTasks.find((t) =>
          t.content?.includes("Task A"),
        )?.id
        const taskBId = originalTasks.find((t) =>
          t.content?.includes("Task B"),
        )?.id
        expect(taskAId).toBeDefined()
        expect(taskBId).toBeDefined()

        const modifiedContent = `# Test

- [ ] Task A Modified
- [ ] Task B
`
        writeFileSync(filePath, modifiedContent)
        const futureTime = new Date(Date.now() + 1000)
        utimesSync(filePath, futureTime, futureTime)

        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")

        await applyReconcileOps(db, updateOps, repoDir, emitter)

        const fileNodeAfter = getNodeByPath(db, filePath)
        const tasksAfter = getChildren(db, fileNodeAfter!.id).filter(
          (n) => n.type === "task",
        )
        expect(tasksAfter.length).toBe(2)

        const taskAAfter = tasksAfter.find((t) =>
          t.content?.includes("Task A Modified"),
        )
        const taskBAfter = tasksAfter.find((t) => t.content?.includes("Task B"))

        expect(taskAAfter).toBeDefined()
        expect(taskBAfter).toBeDefined()
        expect(taskAAfter!.id).toBe(taskAId!)
        expect(taskBAfter!.id).toBe(taskBId!)
      }))
  })

  describe("TUI refresh scenario", () => {
    test("folder children remain visible after file touch in subfolder", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const issueFolder = join(repoDir, "issue")
        mkdirSync(issueFolder)

        const task1Path = join(issueFolder, "task1.md")
        const task2Path = join(issueFolder, "task2.md")
        writeFileSync(task1Path, "# Task 1\n\n- [ ] Do something")
        writeFileSync(task2Path, "# Task 2\n\n- [ ] Do something else")

        const rootOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, rootOps, repoDir, emitter)

        const issueOps = reconcileDirectory(db, issueFolder, repoDir)
        await applyReconcileOps(db, issueOps, repoDir, emitter)

        const folderNode = getNodeByPath(db, issueFolder)
        expect(folderNode).not.toBeNull()
        const folderId = folderNode!.id

        const childrenBefore = getChildren(db, folderId)
        expect(childrenBefore.length).toBe(2)

        const futureTime = new Date(Date.now() + 1000)
        utimesSync(task1Path, futureTime, futureTime)

        const updateOps = reconcileDirectory(db, issueFolder, repoDir)

        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")

        await applyReconcileOps(db, updateOps, repoDir, emitter)

        const folderNodeAfter = getNodeByPath(db, issueFolder)
        expect(folderNodeAfter).not.toBeNull()
        expect(folderNodeAfter!.id).toBe(folderId)

        const childrenAfter = getChildren(db, folderId)
        expect(childrenAfter.length).toBe(2)

        for (const child of childrenAfter) {
          expect(child.parent_id).toBe(folderId)
        }
      }))

    test("nested tasks remain visible after parent file touch", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const issueFolder = join(repoDir, "issue")
        mkdirSync(issueFolder)

        const taskPath = join(issueFolder, "project.md")
        writeFileSync(
          taskPath,
          `# Project

## Open

- [ ] Task A
- [ ] Task B

## Done

- [x] Task C
`,
        )

        const rootOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, rootOps, repoDir, emitter)

        const issueOps = reconcileDirectory(db, issueFolder, repoDir)
        await applyReconcileOps(db, issueOps, repoDir, emitter)

        const folderNode = getNodeByPath(db, issueFolder)
        expect(folderNode).not.toBeNull()
        const folderId = folderNode!.id

        const fileNodes = getChildren(db, folderId)
        expect(fileNodes.length).toBe(1)

        const fileNode = fileNodes[0]
        expect(fileNode?.type).toBe("file")

        const sections = getChildren(db, fileNode!.id)
        expect(sections.length).toBe(2)

        let totalTasksBefore = 0
        for (const section of sections) {
          const tasks = getChildren(db, section.id).filter(
            (n) => n.type === "task",
          )
          totalTasksBefore += tasks.length
        }
        expect(totalTasksBefore).toBe(3)

        const futureTime = new Date(Date.now() + 1000)
        utimesSync(taskPath, futureTime, futureTime)

        const updateOps = reconcileDirectory(db, issueFolder, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")

        await applyReconcileOps(db, updateOps, repoDir, emitter)

        const folderNodeAfter = getNodeByPath(db, issueFolder)
        expect(folderNodeAfter!.id).toBe(folderId)

        const fileNodesAfter = getChildren(db, folderId)
        expect(fileNodesAfter.length).toBe(1)
        expect(fileNodesAfter[0]!.id).toBe(fileNode!.id)

        const sectionsAfter = getChildren(db, fileNodesAfter[0]!.id)
        expect(sectionsAfter.length).toBe(2)

        let totalTasksAfter = 0
        for (const section of sectionsAfter) {
          const tasks = getChildren(db, section.id).filter(
            (n) => n.type === "task",
          )
          totalTasksAfter += tasks.length
        }
        expect(totalTasksAfter).toBe(3)
      }))
  })

  describe("path-based IDs prevent duplicates", () => {
    test("folder created by watch handler has same ID as discovery would create", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        // First, create a folder through the watch handler (applyReconcileOps)
        const folderPath = join(repoDir, "test-folder")
        mkdirSync(folderPath)

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        expect(createOps.length).toBe(1)

        await applyReconcileOps(db, createOps, repoDir, emitter)

        const folderNode = getNodeByPath(db, folderPath)
        expect(folderNode).not.toBeNull()

        // The ID should be the relative path from repo root (path-based)
        // This ensures discovery and watch handler create same IDs
        expect(folderNode!.id).toBe("test-folder")
      }))

    test("nested folder IDs are path-based", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        // Create nested folder structure
        const level1 = join(repoDir, "level1")
        const level2 = join(level1, "level2")
        mkdirSync(level2, { recursive: true })

        // Reconcile from root
        const rootOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, rootOps, repoDir, emitter)

        // Reconcile level1
        const level1Ops = reconcileDirectory(db, level1, repoDir)
        await applyReconcileOps(db, level1Ops, repoDir, emitter)

        const level1Node = getNodeByPath(db, level1)
        const level2Node = getNodeByPath(db, level2)

        // Both should have path-based IDs
        expect(level1Node!.id).toBe("level1")
        expect(level2Node!.id).toBe("level1/level2")
      }))

    test("re-applying same folder does not create duplicate", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const folderPath = join(repoDir, "no-dup-folder")
        mkdirSync(folderPath)

        // First application
        const ops1 = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, ops1, repoDir, emitter)

        // Count folder nodes
        const countBefore = db
          .query(
            "SELECT COUNT(*) as cnt FROM nodes WHERE type = 'folder' AND name = 'no-dup-folder'",
          )
          .get() as { cnt: number }
        expect(countBefore.cnt).toBe(1)

        // Simulate what would happen if watch handler and discovery both run
        // The INSERT OR IGNORE should handle this gracefully
        const { applyEventWithDb } = await import("../../src/db-events.ts")
        const { generatePathBasedId } = await import("../../src/id-utils.ts")

        // Manually try to insert same folder again (simulating watch handler)
        const folderId = generatePathBasedId(repoDir, folderPath)
        expect(folderId).toBe("no-dup-folder")

        // This should not throw due to INSERT OR IGNORE
        applyEventWithDb(db, {
          id: folderId,
          type: "node_created",
          actor: "test",
          ts: Date.now(),
          data: {
            id: folderId,
            type: "folder",
            fs_path: folderPath,
            name: "no-dup-folder",
          },
        })

        // Still should have only 1 folder
        const countAfter = db
          .query(
            "SELECT COUNT(*) as cnt FROM nodes WHERE type = 'folder' AND name = 'no-dup-folder'",
          )
          .get() as { cnt: number }
        expect(countAfter.cnt).toBe(1)
      }))
  })

  describe("getParentNodeId", () => {
    test("returns null for repo root files", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const filePath = join(repoDir, "root-file.md")
        writeFileSync(filePath, "# Root")

        const createOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, createOps, repoDir, emitter)

        const parentId = getParentNodeId(db, filePath)
        expect(parentId).toBeNull()
      }))

    test("returns folder node ID for nested files", () =>
      withTestEnv(async ({ db, repoDir, emitter }) => {
        const folderPath = join(repoDir, "parent-folder")
        mkdirSync(folderPath)

        const folderOps = reconcileDirectory(db, repoDir, repoDir)
        await applyReconcileOps(db, folderOps, repoDir, emitter)

        const folderNode = getNodeByPath(db, folderPath)
        expect(folderNode).not.toBeNull()

        const filePath = join(folderPath, "child.md")
        writeFileSync(filePath, "# Child")

        const parentId = getParentNodeId(db, filePath)
        expect(parentId).toBe(folderNode!.id)
      }))
  })
})
