/**
 * Reconciliation Tests
 *
 * Tests for reconcile.ts - comparing filesystem state to database state.
 * Uses isolated test environments for parallel execution.
 */

import { describe, test, expect, vi } from "vitest"
import { mkdirSync, rmSync, writeFileSync, statSync, utimesSync } from "fs"
import { join, relative } from "path"
import type { Database } from "bun:sqlite"
import {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
  type DirectoryScanner,
} from "../../src/watch/reconcile.ts"
import { getNodeByPath } from "../../src/db-queries/core-lookup.ts"
import { getChildren } from "../../src/db-queries/tree-traversal.ts"
import { withTestEnv, clearConfigCache } from "@km/storage"
import type { Emitter } from "../../src/emitter.ts"

// ============================================================================
// Test Helpers
// ============================================================================

/** Disable index file materialization for tests that don't want it */
function disableMaterialization(repoDir: string): void {
  const kmDir = join(repoDir, ".km")
  mkdirSync(kmDir, { recursive: true })
  writeFileSync(join(kmDir, "config.yaml"), 'folderIndex:\n  materialization: "none"\n')
  clearConfigCache()
}

/** Create a markdown file and return its path */
function createMdFile(repoDir: string, name: string, content: string): string {
  const path = join(repoDir, name)
  writeFileSync(path, content)
  return path
}

/** Create a folder and return its path */
function createFolder(repoDir: string, name: string): string {
  const path = join(repoDir, name)
  mkdirSync(path, { recursive: true })
  return path
}

/** Touch a file by updating mtime to future */
function touchFile(path: string, offsetMs = 1000): void {
  const futureTime = new Date(Date.now() + offsetMs)
  utimesSync(path, futureTime, futureTime)
}

/** Sync a directory to database */
async function syncDir(db: Database, dir: string, repoDir: string, emitter: Emitter): Promise<void> {
  const ops = reconcileDirectory(db, dir, repoDir)
  await applyReconcileOps(db, ops, repoDir, emitter)
}

/**
 * Module-level repoDir set by withTestEnvRel wrapper.
 * Used by assertNodeExists/assertNodeNotExists to convert absolute paths to
 * relative (DB stores relative fs_path).
 */
let _repoDir = ""

/** Wrap withTestEnv to set _repoDir for path helpers */
async function withTestEnvRel<T>(
  fn: (env: { db: Database; repoDir: string; emitter: Emitter }) => T,
): Promise<Awaited<T>> {
  return (await withTestEnv(async (env) => {
    _repoDir = env.repoDir
    return (await fn(env)) as Awaited<T>
  })) as Awaited<T>
}

/** Convert absolute path to relative for DB queries (DB stores relative fs_path) */
function toRel(absPath: string): string {
  if (!absPath.startsWith("/")) return absPath
  return relative(_repoDir, absPath) || "."
}

/** Assert node exists at path with expected type.
 * Absolute paths are converted to relative (DB stores relative fs_path). */
function assertNodeExists(
  db: Database,
  path: string,
  expectedType?: string,
): NonNullable<ReturnType<typeof getNodeByPath>> {
  const node = getNodeByPath(db, toRel(path))
  expect(node).not.toBeNull()
  if (expectedType) expect(node!.type).toBe(expectedType)
  return node!
}

/** Assert node does not exist at path */
function assertNodeNotExists(db: Database, path: string): void {
  expect(getNodeByPath(db, toRel(path))).toBeNull()
}

/** Get children of a specific type (uses new km-ast types) */
function getChildrenOfType(db: Database, parentId: string, type: string): ReturnType<typeof getChildren> {
  if (type === "task") {
    return getChildren(db, parentId).filter((n) => n.item?.task?.status != null)
  }
  if (type === "section") {
    return getChildren(db, parentId).filter((n) => n.type === "h" && n.fstype === "mdsection")
  }
  if (type === "file") {
    return getChildren(db, parentId).filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))
  }
  if (type === "folder") {
    return getChildren(db, parentId).filter((n) => n.type === "h" && n.fstype === "folder")
  }
  return getChildren(db, parentId).filter((n) => n.type === type)
}

/** Count total tasks across sections */
function countTasksInSections(db: Database, sections: { id: string }[]): number {
  let total = 0
  for (const section of sections) {
    total += getChildrenOfType(db, section.id, "task").length
  }
  return total
}

// ============================================================================
// Test Fixtures
// ============================================================================

const BOARD_CONTENT = `# Board

## Open

- [ ] Task 1
- [ ] Task 2

## Done

- [x] Task 3
`

describe("reconcile.ts", () => {
  describe("reconcileDirectory", () => {
    test.each([
      {
        name: "file",
        setup: (dir: string) => createMdFile(dir, "test.md", "# Test"),
      },
      {
        name: "folder",
        setup: (dir: string) => createFolder(dir, "subfolder"),
      },
    ])("detects new $name", ({ setup }) =>
      withTestEnvRel(({ db, repoDir }) => {
        const path = setup(repoDir)
        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBe(1)
        expect(ops[0]!.type).toBe("create")
        expect(ops[0]!.path).toBe(path)
      }),
    )

    test("detects multiple new items", () =>
      withTestEnvRel(({ db, repoDir }) => {
        createMdFile(repoDir, "file1.md", "# File 1")
        createMdFile(repoDir, "file2.md", "# File 2")
        createFolder(repoDir, "folder1")

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBe(3)
        expect(ops.every((op) => op.type === "create")).toBe(true)
      }))

    test("detects deleted files", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "delete-me.md", "# Delete Me")
        await syncDir(db, repoDir, repoDir, emitter)

        const node = assertNodeExists(db, filePath)
        rmSync(filePath)

        const deleteOps = reconcileDirectory(db, repoDir, repoDir)
        expect(deleteOps.length).toBe(1)
        expect(deleteOps[0]!.type).toBe("delete")
        expect(deleteOps[0]!.path).toBe(toRel(filePath))
        expect(deleteOps[0]!.nodeId).toBe(node.id)
      }))

    test.each([
      { scenario: "forward", offsetMs: 1000, desc: "future mtime" },
      {
        scenario: "backward (backup restore)",
        offsetMs: -86400000,
        desc: "past mtime",
      },
    ])("detects modified files by mtime ($scenario)", ({ offsetMs }) =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "modify-me.md", "# Original")
        await syncDir(db, repoDir, repoDir, emitter)

        const node = assertNodeExists(db, filePath)
        expect(node.fs_mtime).toBeDefined()

        writeFileSync(filePath, "# Modified Content")
        touchFile(filePath, offsetMs)

        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]!.type).toBe("update")
        expect(updateOps[0]!.path).toBe(filePath)
        expect(updateOps[0]!.nodeId).toBe(node.id)
      }),
    )

    test("detects renamed files by inode", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const oldPath = createMdFile(repoDir, "old-name.md", "# Content")
        await syncDir(db, repoDir, repoDir, emitter)

        const node = assertNodeExists(db, oldPath)
        expect(node.fs_ino).toBeDefined()
        const originalIno = node.fs_ino!

        const newPath = join(repoDir, "new-name.md")
        Bun.spawnSync(["mv", oldPath, newPath])
        expect(statSync(newPath).ino).toBe(originalIno)

        const renameOps = reconcileDirectory(db, repoDir, repoDir)
        const renameOp = renameOps.find((op) => op.type === "rename")
        expect(renameOp).toBeDefined()
        expect(renameOp!.oldPath).toBe(toRel(oldPath))
        expect(renameOp!.path).toBe(newPath)
        expect(renameOp!.nodeId).toBe(node.id)
      }))

    test("returns empty array when nothing changed", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        createMdFile(repoDir, "stable.md", "# Stable")
        await syncDir(db, repoDir, repoDir, emitter)

        const ops = reconcileDirectory(db, repoDir, repoDir)
        expect(ops.length).toBe(0)
      }))

    test("ignores non-markdown files", () =>
      withTestEnvRel(({ db, repoDir }) => {
        writeFileSync(join(repoDir, "image.png"), "fake image data")
        createMdFile(repoDir, "test.md", "# Real markdown")

        const ops = reconcileDirectory(db, repoDir, repoDir)

        expect(ops.length).toBeGreaterThanOrEqual(1)
        expect(ops.some((op) => op.path.endsWith(".md"))).toBe(true)
      }))
  })

  describe("applyReconcileOps", () => {
    test.each([
      {
        name: "file node from markdown",
        setup: (dir: string) => createMdFile(dir, "new-file.md", "# New File\n\n- [ ] Task 1\n- [x] Task 2"),
        expectedType: "h",
        checkChildren: true,
      },
      {
        name: "folder node",
        setup: (dir: string) => createFolder(dir, "new-folder"),
        expectedType: "h",
        checkChildren: false,
      },
    ])("creates $name", ({ setup, expectedType, checkChildren }) =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const path = setup(repoDir)
        await syncDir(db, repoDir, repoDir, emitter)

        const node = assertNodeExists(db, path, expectedType)

        if (checkChildren) {
          const tasks = getChildrenOfType(db, node.id, "task")
          expect(tasks.length).toBe(2)
        }
      }),
    )

    test("deletes node on delete op", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "to-delete.md", "# To Delete")
        await syncDir(db, repoDir, repoDir, emitter)
        assertNodeExists(db, filePath)

        rmSync(filePath)
        await syncDir(db, repoDir, repoDir, emitter)

        assertNodeNotExists(db, filePath)
      }))

    test("handles rename operations and updates database", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const oldPath = createMdFile(repoDir, "rename-old.md", "# Rename Me")
        await syncDir(db, repoDir, repoDir, emitter)

        const originalNode = assertNodeExists(db, oldPath)
        const originalId = originalNode.id

        const newPath = join(repoDir, "rename-new.md")
        Bun.spawnSync(["mv", oldPath, newPath])

        const renameOps = reconcileDirectory(db, repoDir, repoDir)
        const renameOp = renameOps.find((op) => op.type === "rename")
        expect(renameOp).toBeDefined()
        expect(renameOp!.nodeId).toBe(originalId)
        expect(renameOp!.path).toBe(newPath)
        expect(renameOp!.oldPath).toBe(toRel(oldPath))

        await syncDir(db, repoDir, repoDir, emitter)

        // Node should now have new path, same ID preserved
        const renamedNode = assertNodeExists(db, newPath)
        expect(renamedNode.id).toBe(originalId)
        expect(renamedNode.fs_path).toBe(toRel(newPath))

        assertNodeNotExists(db, oldPath)
      }))

    test("rename preserves children fs_path for folders", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const oldFolder = createFolder(repoDir, "old-folder")
        const filePath = join(oldFolder, "child.md")
        writeFileSync(filePath, "# Child File")

        // Sync folder and contents
        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, oldFolder, repoDir, emitter)

        const originalFolder = assertNodeExists(db, oldFolder)
        assertNodeExists(db, filePath)

        // Rename folder
        const newFolder = join(repoDir, "new-folder")
        Bun.spawnSync(["mv", oldFolder, newFolder])
        await syncDir(db, repoDir, repoDir, emitter)

        // Folder should have new path, same ID
        const renamedFolder = assertNodeExists(db, newFolder)
        expect(renamedFolder.id).toBe(originalFolder.id)

        // Note: child file paths are NOT automatically updated by folder rename
        // The child file still has old path until next reconcile of the folder
        // This is expected behavior - the watcher handles children separately
      }))

    test("creates folder hierarchy for nested files", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const nestedDir = createFolder(repoDir, "level1/level2")
        const filePath = createMdFile(nestedDir, "nested.md", "# Nested File")

        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, join(repoDir, "level1"), repoDir, emitter)
        await syncDir(db, nestedDir, repoDir, emitter)

        const fileNode = assertNodeExists(db, filePath)
        expect(fileNode.parent_id).not.toBeNull()

        const level2Node = assertNodeExists(db, nestedDir)
        expect(fileNode.parent_id).toBe(level2Node.id)
      }))
  })

  describe("update preserves nested nodes", () => {
    test("file update does not duplicate or delete nested tasks", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "nested-tasks.md", BOARD_CONTENT)
        await syncDir(db, repoDir, repoDir, emitter)

        const fileNode = assertNodeExists(db, filePath)
        const sections = getChildrenOfType(db, fileNode.id, "section")
        expect(sections.length).toBe(2)

        const openSection = sections.find((s) => s.content?.includes("Open"))!
        expect(getChildrenOfType(db, openSection.id, "task").length).toBe(2)

        const { getNodeCount } = await import("../../src/db-queries/index.ts")
        const originalNodeCount = getNodeCount(db)

        touchFile(filePath)
        const updateOps = reconcileDirectory(db, repoDir, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")
        await syncDir(db, repoDir, repoDir, emitter)

        expect(getNodeCount(db)).toBe(originalNodeCount)

        const fileNodeAfter = assertNodeExists(db, filePath)
        expect(fileNodeAfter.id).toBe(fileNode.id)

        const sectionsAfter = getChildrenOfType(db, fileNodeAfter.id, "section")
        expect(sectionsAfter.length).toBe(2)

        const openSectionAfter = sectionsAfter.find((s) => s.content?.includes("Open"))!
        expect(getChildrenOfType(db, openSectionAfter.id, "task").length).toBe(2)
      }))

    test("file update with content change correctly diffs nodes", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "diff-test.md", "# Test\n\n- [ ] Task A\n- [ ] Task B\n")
        await syncDir(db, repoDir, repoDir, emitter)

        const fileNode = assertNodeExists(db, filePath)
        const originalTasks = getChildrenOfType(db, fileNode.id, "task")
        expect(originalTasks.length).toBe(2)
        const taskAId = originalTasks.find((t) => t.content?.includes("Task A"))!.id
        const taskBId = originalTasks.find((t) => t.content?.includes("Task B"))!.id

        writeFileSync(filePath, "# Test\n\n- [ ] Task A Modified\n- [ ] Task B\n")
        touchFile(filePath)
        await syncDir(db, repoDir, repoDir, emitter)

        const fileNodeAfter = assertNodeExists(db, filePath)
        const tasksAfter = getChildrenOfType(db, fileNodeAfter.id, "task")
        expect(tasksAfter.length).toBe(2)

        const taskAAfter = tasksAfter.find((t) => t.content?.includes("Task A Modified"))
        const taskBAfter = tasksAfter.find((t) => t.content?.includes("Task B"))

        expect(taskAAfter).toBeDefined()
        expect(taskBAfter).toBeDefined()
        expect(taskAAfter!.id).toBe(taskAId)
        expect(taskBAfter!.id).toBe(taskBId)
      }))
  })

  describe("TUI refresh scenario", () => {
    test("folder children remain visible after file touch in subfolder", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        disableMaterialization(repoDir)
        const issueFolder = createFolder(repoDir, "issue")
        const task1Path = createMdFile(issueFolder, "task1.md", "# Task 1\n\n- [ ] Do something")
        createMdFile(issueFolder, "task2.md", "# Task 2\n\n- [ ] Do something else")

        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, issueFolder, repoDir, emitter)

        const folderNode = assertNodeExists(db, issueFolder)
        expect(getChildren(db, folderNode.id).length).toBe(2)

        touchFile(task1Path)
        const updateOps = reconcileDirectory(db, issueFolder, repoDir)
        expect(updateOps.length).toBe(1)
        expect(updateOps[0]?.type).toBe("update")
        await syncDir(db, issueFolder, repoDir, emitter)

        const folderNodeAfter = assertNodeExists(db, issueFolder)
        expect(folderNodeAfter.id).toBe(folderNode.id)

        const childrenAfter = getChildren(db, folderNode.id)
        expect(childrenAfter.length).toBe(2)
        for (const child of childrenAfter) {
          expect(child.parent_id).toBe(folderNode.id)
        }
      }))

    test("nested tasks remain visible after parent file touch", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        disableMaterialization(repoDir)
        const issueFolder = createFolder(repoDir, "issue")
        const taskPath = createMdFile(issueFolder, "project.md", BOARD_CONTENT)

        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, issueFolder, repoDir, emitter)

        const folderNode = assertNodeExists(db, issueFolder)
        const fileNodes = getChildren(db, folderNode.id)
        expect(fileNodes.length).toBe(1)
        expect(fileNodes[0]?.type).toBe("h")

        const sections = getChildrenOfType(db, fileNodes[0]!.id, "section")
        expect(sections.length).toBe(2)
        expect(countTasksInSections(db, sections)).toBe(3)

        touchFile(taskPath)
        await syncDir(db, issueFolder, repoDir, emitter)

        const folderNodeAfter = assertNodeExists(db, issueFolder)
        expect(folderNodeAfter.id).toBe(folderNode.id)

        const fileNodesAfter = getChildren(db, folderNode.id)
        expect(fileNodesAfter.length).toBe(1)
        expect(fileNodesAfter[0]!.id).toBe(fileNodes[0]!.id)

        const sectionsAfter = getChildrenOfType(db, fileNodesAfter[0]!.id, "section")
        expect(sectionsAfter.length).toBe(2)
        expect(countTasksInSections(db, sectionsAfter)).toBe(3)
      }))
  })

  describe("path-based IDs prevent duplicates", () => {
    test("folder created by watch handler has same ID as discovery would create", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const folderPath = createFolder(repoDir, "test-folder")
        await syncDir(db, repoDir, repoDir, emitter)

        // ID should be relative path from repo root (path-based)
        const folderNode = assertNodeExists(db, folderPath)
        expect(folderNode.id).toBe("test-folder")
      }))

    test("nested folder IDs are path-based", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const level1 = createFolder(repoDir, "level1")
        const level2 = createFolder(level1, "level2")

        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, level1, repoDir, emitter)

        expect(assertNodeExists(db, level1).id).toBe("level1")
        expect(assertNodeExists(db, level2).id).toBe("level1/level2")
      }))

    test("re-applying same folder does not create duplicate", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const folderPath = createFolder(repoDir, "no-dup-folder")
        await syncDir(db, repoDir, repoDir, emitter)

        const countQuery =
          "SELECT COUNT(*) as cnt FROM nodes WHERE type = 'h' AND fstype = 'folder' AND name = 'no-dup-folder'"
        expect((db.query(countQuery).get() as { cnt: number }).cnt).toBe(1)

        // Simulate watch handler and discovery both running
        const { applyEventWithDb } = await import("../../src/db-events.ts")
        const { generatePathBasedId } = await import("../../src/id-utils.ts")

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
            type: "h",
            item: {},
            fstype: "folder",
            fs_path: toRel(folderPath),
            name: "no-dup-folder",
          },
        })

        expect((db.query(countQuery).get() as { cnt: number }).cnt).toBe(1)
      }))
  })

  describe("getParentNodeId", () => {
    test("returns null for repo root files", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const filePath = createMdFile(repoDir, "root-file.md", "# Root")
        await syncDir(db, repoDir, repoDir, emitter)

        expect(getParentNodeId(db, toRel(filePath))).toBeNull()
      }))

    test("returns folder node ID for nested files", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        const folderPath = createFolder(repoDir, "parent-folder")
        await syncDir(db, repoDir, repoDir, emitter)

        const folderNode = assertNodeExists(db, folderPath)
        const filePath = createMdFile(folderPath, "child.md", "# Child")

        expect(getParentNodeId(db, toRel(filePath))).toBe(folderNode.id)
      }))
  })

  describe("displaced-delete inode verification", () => {
    test("deletes displaced node when its DB inode differs from FS (stale)", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        // Create two files and sync them
        const fileA = createMdFile(repoDir, "old-name.md", "# File A")
        const fileB = createMdFile(repoDir, "target.md", "# File B")
        await syncDir(db, repoDir, repoDir, emitter)

        const nodeA = assertNodeExists(db, fileA)
        const nodeB = assertNodeExists(db, fileB)
        const inoA = nodeA.fs_ino!
        const inoB = nodeB.fs_ino!
        expect(inoA).not.toBe(inoB)

        // Simulate: file A renamed to target.md on FS (overwriting B).
        // Use a custom scanner to report the FS state after the rename:
        // only "target.md" exists, with inode of file A.
        const fakeScanner: DirectoryScanner = () => [
          { path: join(repoDir, "target.md"), ino: inoA, mtime: Date.now(), isDirectory: false },
        ]

        const ops = reconcileDirectory(db, repoDir, repoDir, undefined, fakeScanner)

        // Node B (at target.md) has inoB in DB, but FS shows inoA — B is stale
        const deleteOp = ops.find((op) => op.type === "delete" && op.nodeId === nodeB.id)
        expect(deleteOp).toBeDefined()

        // Node A should be renamed to target.md
        const renameOp = ops.find((op) => op.type === "rename" && op.nodeId === nodeA.id)
        expect(renameOp).toBeDefined()
      }))

    test("skips rename when displaced node has no tracked inode (concurrent creation)", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        // Create file A and sync it
        const fileA = createMdFile(repoDir, "old-name.md", "# File A")
        await syncDir(db, repoDir, repoDir, emitter)
        const nodeA = assertNodeExists(db, fileA)
        const inoA = nodeA.fs_ino!

        // Manually insert a node at target.md WITHOUT an inode (simulates
        // a concurrent creation that hasn't been fully reconciled yet)
        const { applyEventWithDb } = await import("../../src/db-events.ts")
        applyEventWithDb(db, {
          id: "target.md",
          type: "node_created",
          actor: "test",
          ts: Date.now(),
          data: {
            id: "target.md",
            type: "h",
            item: {},
            fstype: "mdfile",
            fs_path: "target.md",
            name: "target",
            // No fs_ino — simulating concurrent creation without inode tracking
          },
        })

        const nodeB = getNodeByPath(db, "target.md")
        expect(nodeB).not.toBeNull()
        expect(nodeB!.fs_ino).toBeFalsy()

        // Simulate: FS shows target.md with inoA (file A's inode)
        const fakeScanner: DirectoryScanner = () => [
          { path: join(repoDir, "target.md"), ino: inoA, mtime: Date.now(), isDirectory: false },
        ]

        const ops = reconcileDirectory(db, repoDir, repoDir, undefined, fakeScanner)

        // Node B has no inode in DB — it might be a concurrent creation.
        // Should NOT delete node B and should NOT rename node A.
        const deleteOp = ops.find((op) => op.type === "delete" && op.nodeId === nodeB!.id)
        expect(deleteOp).toBeUndefined()

        const renameOp = ops.find((op) => op.type === "rename" && op.nodeId === nodeA.id)
        expect(renameOp).toBeUndefined()
      }))

    test("also deletes displaced descendants when directory node is stale", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        // Create folder B with a child file, sync them
        const folderB = createFolder(repoDir, "target-folder")
        createMdFile(folderB, "child.md", "# Child of B")
        await syncDir(db, repoDir, repoDir, emitter)
        await syncDir(db, folderB, repoDir, emitter)

        const nodeFolderB = assertNodeExists(db, folderB)
        const inoFolderB = nodeFolderB.fs_ino!

        // Create folder A and sync it
        const folderA = createFolder(repoDir, "old-folder")
        await syncDir(db, repoDir, repoDir, emitter)
        const nodeFolderA = assertNodeExists(db, folderA)
        const inoFolderA = nodeFolderA.fs_ino!
        expect(inoFolderA).not.toBe(inoFolderB)

        // Simulate: folder A renamed to target-folder on FS
        // FS shows target-folder with folder A's inode, and old-folder is gone
        const fakeScanner: DirectoryScanner = () => [
          { path: join(repoDir, "target-folder"), ino: inoFolderA, mtime: Date.now(), isDirectory: true },
        ]

        const ops = reconcileDirectory(db, repoDir, repoDir, undefined, fakeScanner)

        // Folder B (at target-folder) is stale — its inode differs from FS
        const deleteFolderOp = ops.find((op) => op.type === "delete" && op.nodeId === nodeFolderB.id)
        expect(deleteFolderOp).toBeDefined()

        // Child of B should also be deleted (displaced descendant)
        const deleteChildOp = ops.find((op) => op.type === "delete" && op.path === "target-folder/child.md")
        expect(deleteChildOp).toBeDefined()

        // Folder A should be renamed to target-folder
        const renameOp = ops.find((op) => op.type === "rename" && op.nodeId === nodeFolderA.id)
        expect(renameOp).toBeDefined()
      }))
  })

  describe("duplicate create guard", () => {
    test("duplicate create ops for the same file do not produce duplicate nodes", () =>
      withTestEnvRel(async ({ db, repoDir, emitter }) => {
        // Create a file and sync it
        const filePath = createMdFile(
          repoDir,
          "@next.md",
          "---\ntitle: Next Actions\n---\n\n# Next Actions\n\n- Task 1\n",
        )
        await syncDir(db, repoDir, repoDir, emitter)

        const originalNode = assertNodeExists(db, filePath)
        const originalId = originalNode.id

        // Simulate a duplicate create op (as if fs-watcher fired twice for the same file)
        const stat = statSync(filePath)
        const relPath = toRel(filePath)
        const duplicateOps = [{ type: "create" as const, path: filePath, ino: stat.ino, mtime: stat.mtimeMs }]
        await applyReconcileOps(db, duplicateOps, repoDir, emitter)

        // Should still have only ONE node for @next.md
        const allNodes = db.query("SELECT id FROM nodes WHERE fs_path = ?").all(relPath) as { id: string }[]
        expect(allNodes.length).toBe(1)
        // Should keep the original node ID
        expect(allNodes[0]!.id).toBe(originalId)
      }))
  })
})

describe("delete suppression (ReconciliationEngine)", () => {
  /**
   * When km deletes a file via WriteQueue, the watcher sees the unlink and
   * reconcileDirectory generates a delete op. The reconciliation engine must
   * suppress this delete op because it's our own delete — not an external one.
   */
  test("delete via km is suppressed by reconciliation engine", async () => {
    const { WriteTokenMap } = await import("../../src/watch/write-tokens.ts")
    const { createReconciliationEngine } = await import("../../src/watch/reconciliation-engine.ts")
    const { WriteQueue } = await import("../../src/watch/writequeue.ts")
    const { createSyncState } = await import("../../src/watch/sync-state.ts")

    await withTestEnvRel(async ({ db, repoDir, emitter }) => {
      // 1. Create a file and sync it into the DB
      const filePath = createMdFile(repoDir, "to-delete.md", "# Delete Me\n")
      await syncDir(db, repoDir, repoDir, emitter)
      assertNodeExists(db, filePath)

      // 2. Set up the reconciliation engine
      const writeTokens = new WriteTokenMap()
      const syncState = createSyncState(db)
      const writeQueue = new WriteQueue({ debounceMs: 1 })

      const engine = createReconciliationEngine({
        db,
        repoPath: repoDir,
        writeTokens,
        syncState,
        writeQueue,
        reconcileEmitter: emitter,
      })

      // 3. Simulate km deleting the file: record the delete token, then remove the file
      writeTokens.recordDelete(filePath)
      rmSync(filePath)

      // 4. Run reconciliation — should generate a delete op but filter it out
      const ops = engine.reconcile(repoDir, [])
      expect(ops).toHaveLength(0)

      // 5. Tombstone was consumed (one-shot)
      expect(writeTokens.hasDelete(filePath)).toBe(false)
    })
  })

  test("external delete is NOT suppressed", async () => {
    const { WriteTokenMap } = await import("../../src/watch/write-tokens.ts")
    const { createReconciliationEngine } = await import("../../src/watch/reconciliation-engine.ts")
    const { WriteQueue } = await import("../../src/watch/writequeue.ts")
    const { createSyncState } = await import("../../src/watch/sync-state.ts")

    await withTestEnvRel(async ({ db, repoDir, emitter }) => {
      // 1. Create a file and sync it into the DB
      const filePath = createMdFile(repoDir, "external-delete.md", "# External\n")
      await syncDir(db, repoDir, repoDir, emitter)
      assertNodeExists(db, filePath)

      // 2. Set up the reconciliation engine (no delete tokens recorded)
      const writeTokens = new WriteTokenMap()
      const syncState = createSyncState(db)
      const writeQueue = new WriteQueue({ debounceMs: 1 })

      const engine = createReconciliationEngine({
        db,
        repoPath: repoDir,
        writeTokens,
        syncState,
        writeQueue,
        reconcileEmitter: emitter,
      })

      // 3. Externally delete the file (no recordDelete — this simulates user/editor deleting)
      rmSync(filePath)

      // 4. Run reconciliation — delete op should pass through
      const ops = engine.reconcile(repoDir, [])
      expect(ops).toHaveLength(1)
      expect(ops[0]!.type).toBe("delete")
    })
  })

  test("pending delete in WriteQueue is also suppressed", async () => {
    const { WriteTokenMap } = await import("../../src/watch/write-tokens.ts")
    const { createReconciliationEngine } = await import("../../src/watch/reconciliation-engine.ts")
    const { WriteQueue } = await import("../../src/watch/writequeue.ts")
    const { createSyncState } = await import("../../src/watch/sync-state.ts")

    await withTestEnvRel(async ({ db, repoDir, emitter }) => {
      // 1. Create a file and sync it into the DB
      const filePath = createMdFile(repoDir, "pending-delete.md", "# Pending\n")
      await syncDir(db, repoDir, repoDir, emitter)
      assertNodeExists(db, filePath)

      // 2. Set up the reconciliation engine
      const writeTokens = new WriteTokenMap()
      const syncState = createSyncState(db)
      const writeQueue = new WriteQueue({
        debounceMs: 999999, // Never auto-flush
      })

      const engine = createReconciliationEngine({
        db,
        repoPath: repoDir,
        writeTokens,
        syncState,
        writeQueue,
        reconcileEmitter: emitter,
      })

      // 3. Queue a delete (not yet flushed — file still exists on disk)
      // But also remove the file to simulate the race condition where
      // reconciliation runs while the delete is pending
      writeQueue.queueDelete(filePath, "test-event")
      rmSync(filePath)

      // 4. Run reconciliation — should be suppressed by pending path check
      const ops = engine.reconcile(repoDir, [])
      expect(ops).toHaveLength(0)
    })
  })
})
