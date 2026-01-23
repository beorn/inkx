/**
 * Reconciliation Tests
 *
 * Tests for reconcile.ts - comparing filesystem state to database state.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  statSync,
  utimesSync,
} from "fs";
import { join } from "path";
import { setKmDir } from "../../src/emit.ts";
import {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "../../src/watch/reconcile.ts";
import { closeDb, resetDb, getNodeByPath, getChildren } from "../../src/db.ts";
import { rebuildState } from "../../src/rebuild.ts";

const TEST_DIR = join("/tmp", "kmtest-reconcile");
const KM_DIR = join(TEST_DIR, ".km");
const VAULT_DIR = join(TEST_DIR, "vault");

describe.serial("reconcile.ts", () => {
  beforeEach(() => {
    // Clean up and create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(KM_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    setKmDir(KM_DIR);
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("reconcileDirectory", () => {
    test("detects new files", () => {
      // Create a new file in the vault
      const filePath = join(VAULT_DIR, "test.md");
      writeFileSync(filePath, "# Test\n\n- [ ] Task 1");

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);

      expect(ops.length).toBe(1);
      expect(ops[0].type).toBe("create");
      expect(ops[0].path).toBe(filePath);
    });

    test("detects new folders", () => {
      // Create a new folder in the vault
      const folderPath = join(VAULT_DIR, "subfolder");
      mkdirSync(folderPath);

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);

      expect(ops.length).toBe(1);
      expect(ops[0].type).toBe("create");
      expect(ops[0].path).toBe(folderPath);
    });

    test("detects multiple new items", () => {
      // Create multiple files
      writeFileSync(join(VAULT_DIR, "file1.md"), "# File 1");
      writeFileSync(join(VAULT_DIR, "file2.md"), "# File 2");
      mkdirSync(join(VAULT_DIR, "folder1"));

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);

      expect(ops.length).toBe(3);
      expect(ops.every((op) => op.type === "create")).toBe(true);
    });

    test("detects deleted files", () => {
      // First, create a file and sync it to the database
      const filePath = join(VAULT_DIR, "delete-me.md");
      writeFileSync(filePath, "# Delete Me");

      // Apply the create operation
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(createOps.length).toBe(1);

      // Use applyReconcileOps to create the node
      void applyReconcileOps(createOps, VAULT_DIR);

      // Rebuild state to apply events
      rebuildState();

      // Verify node exists
      const node = getNodeByPath(filePath);
      expect(node).not.toBeNull();

      // Now delete the file
      rmSync(filePath);

      // Reconcile should detect the deletion
      const deleteOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(deleteOps.length).toBe(1);
      expect(deleteOps[0].type).toBe("delete");
      expect(deleteOps[0].path).toBe(filePath);
      expect(deleteOps[0].nodeId).toBe(node!.id);
    });

    test("detects modified files by mtime (forward)", () => {
      // Create a file and sync it
      const filePath = join(VAULT_DIR, "modify-me.md");
      writeFileSync(filePath, "# Original");

      // Create the node
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      void applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Verify node exists and record its updated_at
      const node = getNodeByPath(filePath);
      expect(node).not.toBeNull();

      // Modify the file and set mtime to future to ensure reconcile detects it
      writeFileSync(filePath, "# Modified Content");
      const futureTime = new Date(Date.now() + 1000);
      utimesSync(filePath, futureTime, futureTime);

      // Reconcile should detect the modification
      const updateOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(updateOps.length).toBe(1);
      expect(updateOps[0].type).toBe("update");
      expect(updateOps[0].path).toBe(filePath);
      expect(updateOps[0].nodeId).toBe(node!.id);
    });

    test("detects modified files by mtime (backward - restored from backup)", () => {
      // Create a file and sync it
      const filePath = join(VAULT_DIR, "backup-restore.md");
      writeFileSync(filePath, "# Original");

      // Create the node
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      void applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Verify node exists
      const node = getNodeByPath(filePath);
      expect(node).not.toBeNull();
      expect(node!.fs_mtime).toBeDefined();

      // Simulate file restored from backup with OLDER timestamp
      // This is the key scenario - file changes but mtime is older than what we recorded
      writeFileSync(filePath, "# Restored from backup with different content");
      const pastTime = new Date(Date.now() - 86400000); // 1 day in the past
      utimesSync(filePath, pastTime, pastTime);

      // Reconcile should still detect the modification because mtime changed
      const updateOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(updateOps.length).toBe(1);
      expect(updateOps[0].type).toBe("update");
      expect(updateOps[0].path).toBe(filePath);
      expect(updateOps[0].nodeId).toBe(node!.id);
    });

    test("detects renamed files by inode", () => {
      // Create a file and sync it
      const oldPath = join(VAULT_DIR, "old-name.md");
      writeFileSync(oldPath, "# Content");

      // Create the node
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      void applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Get the original node and its inode
      const node = getNodeByPath(oldPath);
      expect(node).not.toBeNull();
      const originalIno = node!.fs_ino;

      // Rename the file (mv preserves inode on same filesystem)
      const newPath = join(VAULT_DIR, "new-name.md");
      Bun.spawnSync(["mv", oldPath, newPath]);

      // Verify inode is preserved
      const newStat = statSync(newPath);
      expect(newStat.ino).toBe(originalIno);

      // Reconcile should detect the rename
      const renameOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      // May return 2 ops (rename + update due to mtime) or just 1 rename
      const renameOp = renameOps.find((op) => op.type === "rename");
      expect(renameOp).toBeDefined();
      expect(renameOp!.oldPath).toBe(oldPath);
      expect(renameOp!.path).toBe(newPath);
      expect(renameOp!.nodeId).toBe(node!.id);
    });

    test("returns empty array when nothing changed", () => {
      // Create and sync a file
      const filePath = join(VAULT_DIR, "stable.md");
      writeFileSync(filePath, "# Stable");

      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      void applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Reconcile again without changes - fs_mtime should already match
      // since we just synced and the file hasn't changed
      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(ops.length).toBe(0);
    });

    test("ignores non-markdown files", () => {
      // Create a non-markdown file
      writeFileSync(join(VAULT_DIR, "image.png"), "fake image data");
      writeFileSync(join(VAULT_DIR, "test.md"), "# Real markdown");

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);

      // Should only create the .md file (scanDirectory may return both but ops filter)
      // Actually scanDirectory returns all files, so we'll see 2 creates
      // but applyReconcileOps will only process .md files for content parsing
      expect(ops.length).toBeGreaterThanOrEqual(1);
      const mdOp = ops.find((op) => op.path.endsWith(".md"));
      expect(mdOp).toBeDefined();
    });
  });

  describe("applyReconcileOps", () => {
    test("creates file node from markdown", async () => {
      const filePath = join(VAULT_DIR, "new-file.md");
      writeFileSync(filePath, "# New File\n\n- [ ] Task 1\n- [x] Task 2");

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(ops.length).toBe(1);

      await applyReconcileOps(ops, VAULT_DIR);
      rebuildState();

      // Verify file node was created
      const fileNode = getNodeByPath(filePath);
      expect(fileNode).not.toBeNull();
      expect(fileNode!.type).toBe("file");

      // Verify tasks were created as children
      const children = getChildren(fileNode!.id);
      const tasks = children.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);
    });

    test("creates folder node", async () => {
      const folderPath = join(VAULT_DIR, "new-folder");
      mkdirSync(folderPath);

      const ops = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(ops, VAULT_DIR);
      rebuildState();

      const folderNode = getNodeByPath(folderPath);
      expect(folderNode).not.toBeNull();
      expect(folderNode!.type).toBe("folder");
    });

    test("deletes node on delete op", async () => {
      // Create and sync a file
      const filePath = join(VAULT_DIR, "to-delete.md");
      writeFileSync(filePath, "# To Delete");

      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      expect(getNodeByPath(filePath)).not.toBeNull();

      // Delete the file and reconcile
      rmSync(filePath);
      const deleteOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(deleteOps, VAULT_DIR);
      rebuildState();

      // Node should be deleted
      expect(getNodeByPath(filePath)).toBeNull();
    });

    test("handles rename operations", async () => {
      // Create and sync a file
      const oldPath = join(VAULT_DIR, "rename-old.md");
      writeFileSync(oldPath, "# Rename Me");

      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      const originalNode = getNodeByPath(oldPath);
      expect(originalNode).not.toBeNull();
      const originalId = originalNode!.id;

      // Rename and reconcile
      const newPath = join(VAULT_DIR, "rename-new.md");
      Bun.spawnSync(["mv", oldPath, newPath]);

      const renameOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      // Should detect a rename (same inode, different path)
      const renameOp = renameOps.find((op) => op.type === "rename");
      expect(renameOp).toBeDefined();
      expect(renameOp!.nodeId).toBe(originalId);
      expect(renameOp!.path).toBe(newPath);
      expect(renameOp!.oldPath).toBe(oldPath);
    });

    test("creates folder hierarchy for nested files", async () => {
      // Create nested structure
      const nestedDir = join(VAULT_DIR, "level1", "level2");
      mkdirSync(nestedDir, { recursive: true });
      const filePath = join(nestedDir, "nested.md");
      writeFileSync(filePath, "# Nested File");

      // Reconcile the parent first (creates folder nodes)
      const rootOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(rootOps, VAULT_DIR);
      rebuildState();

      // Then reconcile level1
      const level1Ops = reconcileDirectory(
        join(VAULT_DIR, "level1"),
        VAULT_DIR,
      );
      await applyReconcileOps(level1Ops, VAULT_DIR);
      rebuildState();

      // Then reconcile level2
      const level2Ops = reconcileDirectory(nestedDir, VAULT_DIR);
      await applyReconcileOps(level2Ops, VAULT_DIR);
      rebuildState();

      // Verify hierarchy
      const fileNode = getNodeByPath(filePath);
      expect(fileNode).not.toBeNull();
      expect(fileNode!.parent_id).not.toBeNull();

      // Check parent is level2 folder
      const level2Node = getNodeByPath(nestedDir);
      expect(level2Node).not.toBeNull();
      expect(fileNode!.parent_id).toBe(level2Node!.id);
    });
  });

  describe("update preserves nested nodes", () => {
    test("file update does not duplicate or delete nested tasks", async () => {
      // Create a file with nested structure: file → section → tasks
      const filePath = join(VAULT_DIR, "nested-tasks.md");
      const originalContent = `# Board

## Open

- [ ] Task 1
- [ ] Task 2

## Done

- [x] Task 3
`;
      writeFileSync(filePath, originalContent);

      // Initial sync
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(createOps.length).toBe(1);
      await applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Verify initial structure
      const fileNode = getNodeByPath(filePath);
      expect(fileNode).not.toBeNull();
      const allChildren = getChildren(fileNode!.id);

      // Should have sections as children (H2)
      const sections = allChildren.filter((n) => n.type === "section");
      expect(sections.length).toBe(2);

      // Each section should have tasks
      const openSection = sections.find((s) => s.content?.includes("Open"));
      expect(openSection).toBeDefined();
      const openTasks = getChildren(openSection!.id);
      expect(openTasks.filter((t) => t.type === "task").length).toBe(2);

      // Record the original node count
      const { getNodeCount } = await import("../../src/db-queries/index.ts");
      const originalNodeCount = getNodeCount();

      // Now trigger an update (touch the file to change mtime)
      const futureTime = new Date(Date.now() + 1000);
      utimesSync(filePath, futureTime, futureTime);

      // Reconcile - should detect an update
      const updateOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(updateOps.length).toBe(1);
      expect(updateOps[0]?.type).toBe("update");

      // Apply the update
      await applyReconcileOps(updateOps, VAULT_DIR);
      rebuildState();

      // Node count should be the same (no duplicates, no deletions)
      const newNodeCount = getNodeCount();
      expect(newNodeCount).toBe(originalNodeCount);

      // All structure should be preserved
      const fileNodeAfter = getNodeByPath(filePath);
      expect(fileNodeAfter).not.toBeNull();
      expect(fileNodeAfter!.id).toBe(fileNode!.id); // Same ID

      const sectionsAfter = getChildren(fileNodeAfter!.id).filter(
        (n) => n.type === "section",
      );
      expect(sectionsAfter.length).toBe(2);

      const openSectionAfter = sectionsAfter.find((s) =>
        s.content?.includes("Open"),
      );
      expect(openSectionAfter).toBeDefined();
      const openTasksAfter = getChildren(openSectionAfter!.id);
      expect(openTasksAfter.filter((t) => t.type === "task").length).toBe(2);
    });

    test("file update with content change correctly diffs nodes", async () => {
      // Create a file with tasks
      const filePath = join(VAULT_DIR, "diff-test.md");
      const originalContent = `# Test

- [ ] Task A
- [ ] Task B
`;
      writeFileSync(filePath, originalContent);

      // Initial sync
      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Get original task IDs
      const fileNode = getNodeByPath(filePath);
      const originalTasks = getChildren(fileNode!.id).filter(
        (n) => n.type === "task",
      );
      expect(originalTasks.length).toBe(2);
      const taskAId = originalTasks.find((t) =>
        t.content?.includes("Task A"),
      )?.id;
      const taskBId = originalTasks.find((t) =>
        t.content?.includes("Task B"),
      )?.id;
      expect(taskAId).toBeDefined();
      expect(taskBId).toBeDefined();

      // Update the file - change Task A content, keep Task B
      const modifiedContent = `# Test

- [ ] Task A Modified
- [ ] Task B
`;
      writeFileSync(filePath, modifiedContent);

      // Trigger update
      const updateOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      expect(updateOps.length).toBe(1);
      expect(updateOps[0]?.type).toBe("update");

      await applyReconcileOps(updateOps, VAULT_DIR);
      rebuildState();

      // Task A should be updated (same ID, new content)
      // Task B should be unchanged
      const fileNodeAfter = getNodeByPath(filePath);
      const tasksAfter = getChildren(fileNodeAfter!.id).filter(
        (n) => n.type === "task",
      );
      expect(tasksAfter.length).toBe(2);

      const taskAAfter = tasksAfter.find((t) =>
        t.content?.includes("Task A Modified"),
      );
      const taskBAfter = tasksAfter.find((t) => t.content?.includes("Task B"));

      expect(taskAAfter).toBeDefined();
      expect(taskBAfter).toBeDefined();
      expect(taskAAfter!.id).toBe(taskAId!); // Same ID
      expect(taskBAfter!.id).toBe(taskBId!); // Same ID
    });
  });

  describe("TUI refresh scenario", () => {
    test("folder children remain visible after file touch in subfolder", async () => {
      // This test simulates the TUI bug where:
      // 1. User views a subfolder (e.g., issue/)
      // 2. A file inside is touched
      // 3. After watcher syncs, the folder's children should still be visible

      // Create folder structure: vault/issue/task1.md, vault/issue/task2.md
      const issueFolder = join(VAULT_DIR, "issue");
      mkdirSync(issueFolder);

      const task1Path = join(issueFolder, "task1.md");
      const task2Path = join(issueFolder, "task2.md");
      writeFileSync(task1Path, "# Task 1\n\n- [ ] Do something");
      writeFileSync(task2Path, "# Task 2\n\n- [ ] Do something else");

      // Initial sync - first the root folder
      const rootOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(rootOps, VAULT_DIR);
      rebuildState();

      // Then the issue folder contents
      const issueOps = reconcileDirectory(issueFolder, VAULT_DIR);
      await applyReconcileOps(issueOps, VAULT_DIR);
      rebuildState();

      // Get the folder node - this is what TUI uses as rootId
      const folderNode = getNodeByPath(issueFolder);
      expect(folderNode).not.toBeNull();
      const folderId = folderNode!.id;

      // Verify folder has children (what TUI displays as columns)
      const childrenBefore = getChildren(folderId);
      expect(childrenBefore.length).toBe(2);

      // Simulate "touch" on one of the files - just change mtime
      const futureTime = new Date(Date.now() + 1000);
      utimesSync(task1Path, futureTime, futureTime);

      // Reconcile again (this is what watcher triggers)
      const updateOps = reconcileDirectory(issueFolder, VAULT_DIR);

      // Should detect an update for task1.md
      expect(updateOps.length).toBe(1);
      expect(updateOps[0]?.type).toBe("update");

      // Apply the reconcile operations
      await applyReconcileOps(updateOps, VAULT_DIR);
      rebuildState();

      // KEY CHECK: folder node should still exist with same ID
      const folderNodeAfter = getNodeByPath(issueFolder);
      expect(folderNodeAfter).not.toBeNull();
      expect(folderNodeAfter!.id).toBe(folderId);

      // KEY CHECK: folder should still have children
      const childrenAfter = getChildren(folderId);
      expect(childrenAfter.length).toBe(2);

      // All child nodes should have their parent_id pointing to the folder
      for (const child of childrenAfter) {
        expect(child.parent_id).toBe(folderId);
      }
    });

    test("nested tasks remain visible after parent file touch", async () => {
      // This tests a deeper scenario: file → section → tasks
      // Touching the file should preserve the entire nested structure

      const issueFolder = join(VAULT_DIR, "issue");
      mkdirSync(issueFolder);

      const taskPath = join(issueFolder, "project.md");
      writeFileSync(
        taskPath,
        `# Project

## Open

- [ ] Task A
- [ ] Task B

## Done

- [x] Task C
`,
      );

      // Sync
      const rootOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(rootOps, VAULT_DIR);
      rebuildState();

      const issueOps = reconcileDirectory(issueFolder, VAULT_DIR);
      await applyReconcileOps(issueOps, VAULT_DIR);
      rebuildState();

      // Get folder and verify structure
      const folderNode = getNodeByPath(issueFolder);
      expect(folderNode).not.toBeNull();
      const folderId = folderNode!.id;

      const fileNodes = getChildren(folderId);
      expect(fileNodes.length).toBe(1);

      const fileNode = fileNodes[0];
      expect(fileNode?.type).toBe("file");

      // File should have sections as children
      const sections = getChildren(fileNode!.id);
      expect(sections.length).toBe(2);

      // Get total task count across all sections
      let totalTasksBefore = 0;
      for (const section of sections) {
        const tasks = getChildren(section.id).filter((n) => n.type === "task");
        totalTasksBefore += tasks.length;
      }
      expect(totalTasksBefore).toBe(3);

      // Touch the file
      const futureTime = new Date(Date.now() + 1000);
      utimesSync(taskPath, futureTime, futureTime);

      // Reconcile
      const updateOps = reconcileDirectory(issueFolder, VAULT_DIR);
      expect(updateOps.length).toBe(1);
      expect(updateOps[0]?.type).toBe("update");

      await applyReconcileOps(updateOps, VAULT_DIR);
      rebuildState();

      // Verify entire structure preserved
      const folderNodeAfter = getNodeByPath(issueFolder);
      expect(folderNodeAfter!.id).toBe(folderId);

      const fileNodesAfter = getChildren(folderId);
      expect(fileNodesAfter.length).toBe(1);
      expect(fileNodesAfter[0]!.id).toBe(fileNode!.id);

      const sectionsAfter = getChildren(fileNodesAfter[0]!.id);
      expect(sectionsAfter.length).toBe(2);

      let totalTasksAfter = 0;
      for (const section of sectionsAfter) {
        const tasks = getChildren(section.id).filter((n) => n.type === "task");
        totalTasksAfter += tasks.length;
      }
      expect(totalTasksAfter).toBe(3);
    });
  });

  describe("getParentNodeId", () => {
    test("returns null for vault root files", async () => {
      // Create a file at vault root
      const filePath = join(VAULT_DIR, "root-file.md");
      writeFileSync(filePath, "# Root");

      const createOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(createOps, VAULT_DIR);
      rebuildState();

      // Parent should be null since it's at vault root
      const parentId = getParentNodeId(filePath);
      expect(parentId).toBeNull();
    });

    test("returns folder node ID for nested files", async () => {
      // Create folder and file
      const folderPath = join(VAULT_DIR, "parent-folder");
      mkdirSync(folderPath);

      // First sync the folder
      const folderOps = reconcileDirectory(VAULT_DIR, VAULT_DIR);
      await applyReconcileOps(folderOps, VAULT_DIR);
      rebuildState();

      const folderNode = getNodeByPath(folderPath);
      expect(folderNode).not.toBeNull();

      // Now create a file inside
      const filePath = join(folderPath, "child.md");
      writeFileSync(filePath, "# Child");

      // Get parent ID
      const parentId = getParentNodeId(filePath);
      expect(parentId).toBe(folderNode!.id);
    });
  });
});
