/**
 * Sync Integration Tests
 *
 * Tests the full sync workflow from filesystem to database.
 * These tests catch issues like swapped arguments in emit functions.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// Test directories - KM_PATH is set in beforeEach via setKmPath()
const TEST_DIR = join(import.meta.dir, ".test-sync");
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_PATH = join(TEST_DIR, ".km");

import {
  getDb,
  closeDb,
  resetDb,
  getNode,
  getNodeByPath,
  getAllNodes,
  applyEvent,
  getAncestors,
} from "../src/node/db.ts";

import { setKmPath, setDatabase } from "../src/node/emit.ts";
import { SyncManager } from "../src/watch/sync.ts";

describe("Sync Integration", () => {
  beforeEach(() => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_PATH, { recursive: true });

    // Configure emit to use test directory and connect to database
    setKmPath(KM_PATH);
    setDatabase({ applyEvent });

    // Reset database
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("syncFromFs", () => {
    test("should sync a simple markdown file to database", async () => {
      // Create a test markdown file
      const testFile = join(VAULT_DIR, "test.md");
      writeFileSync(
        testFile,
        `# Test Document

This is a paragraph.

- [ ] Open task
- [x] Completed task
`
      );

      // Sync from filesystem
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      const result = await manager.syncFromFs();
      expect(result.processed).toBeGreaterThan(0);

      // Verify nodes were created correctly
      const allNodes = getAllNodes();
      expect(allNodes.length).toBeGreaterThan(0);

      // Verify file node exists and has correct type
      const fileNode = getNodeByPath(testFile);
      expect(fileNode).not.toBeNull();
      expect(fileNode!.type).toBe("file");
      expect(fileNode!.fs_path).toBe(testFile);

      // Verify tasks were parsed
      const tasks = allNodes.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);

      // Verify task statuses
      const openTask = tasks.find((t) => t.task_status === "open");
      const doneTask = tasks.find((t) => t.task_status === "done");
      expect(openTask).toBeDefined();
      expect(doneTask).toBeDefined();
    });

    test("should sync files in subdirectories", async () => {
      // Create folder structure
      const subFolder = join(VAULT_DIR, "subfolder");
      mkdirSync(subFolder);

      const testFile = join(subFolder, "nested.md");
      writeFileSync(testFile, "# Nested File\n\nContent here.");

      // Sync from filesystem
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      const result = await manager.syncFromFs();

      // Verify sync processed something
      expect(result.processed).toBeGreaterThan(0);

      // Get all nodes to debug
      const allNodes = getAllNodes();

      // Verify file node was created (search by type first)
      const fileNodes = allNodes.filter((n) => n.type === "file");
      expect(fileNodes.length).toBeGreaterThan(0);

      // Check the file path matches
      const fileNode = fileNodes.find((n) => n.fs_path === testFile);
      expect(fileNode).toBeDefined();
    });

    test("should sync file with frontmatter correctly", async () => {
      const testFile = join(VAULT_DIR, "frontmatter.md");
      writeFileSync(
        testFile,
        `---
title: Test Document
type: daily
tags: [test, fixture]
---

# Content Section

Some content here.
`
      );

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const fileNode = getNodeByPath(testFile);
      expect(fileNode).not.toBeNull();
      expect(fileNode!.type).toBe("file");
      expect(fileNode!.data).toBeDefined();
      expect(fileNode!.data.title).toBe("Test Document");
      expect(fileNode!.data.type).toBe("daily");
    });

    test("should sync tasks with Obsidian metadata", async () => {
      const testFile = join(VAULT_DIR, "tasks.md");
      writeFileSync(
        testFile,
        `# Task List

- [ ] Task with due date 📅 2025-03-15
- [ ] High priority task ⏫
- [ ] Task with scheduled date ⏳ 2025-03-10
- [x] Completed task
`
      );

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");

      expect(tasks.length).toBe(4);

      // Verify task with due date
      const dueTask = tasks.find((t) => t.due_date === "2025-03-15");
      expect(dueTask).toBeDefined();

      // Verify high priority task
      const highPriorityTask = tasks.find((t) => t.priority === 1);
      expect(highPriorityTask).toBeDefined();

      // Verify task with scheduled date
      const scheduledTask = tasks.find((t) => t.scheduled_date === "2025-03-10");
      expect(scheduledTask).toBeDefined();
    });

    test("should create nodes with valid IDs", async () => {
      const testFile = join(VAULT_DIR, "ids.md");
      writeFileSync(testFile, "# Test\n\n- [ ] Task\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();

      // Every node should have a valid ID
      for (const node of allNodes) {
        expect(node.id).toBeDefined();
        expect(node.id.length).toBeGreaterThan(0);
        // ULIDs are 26 characters
        expect(node.id.length).toBe(26);
      }
    });

    test("should create nodes with valid types", async () => {
      const testFile = join(VAULT_DIR, "types.md");
      writeFileSync(
        testFile,
        `# Section

Paragraph text.

- [ ] Task
- List item

> Blockquote

\`\`\`javascript
code
\`\`\`
`
      );

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();

      // Every node should have a valid type
      const validTypes = [
        "folder",
        "file",
        "section",
        "paragraph",
        "task",
        "ul",
        "ol",
        "quote",
        "code",
        "table",
        "hr",
        "html",
        "agent",
        "board",
      ];

      for (const node of allNodes) {
        expect(node.type).toBeDefined();
        expect(validTypes).toContain(node.type);
      }
    });

    test("should handle nested task structure", async () => {
      const testFile = join(VAULT_DIR, "nested-tasks.md");
      writeFileSync(
        testFile,
        `# Project

- [ ] Parent task
  - [ ] Child task 1
  - [x] Child task 2
`
      );

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");

      // Should have 3 tasks
      expect(tasks.length).toBe(3);
    });
  });

  describe("Event format validation", () => {
    test("events should have actor as string, not object", async () => {
      const testFile = join(VAULT_DIR, "event-test.md");
      writeFileSync(testFile, "# Test\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Read events file directly
      const { readFileSync } = await import("fs");
      const { join: pathJoin } = await import("path");
      const eventsPath = pathJoin(TEST_DIR, ".km", "events.jsonl");

      if (existsSync(eventsPath)) {
        const content = readFileSync(eventsPath, "utf-8");
        const lines = content.trim().split("\n");

        for (const line of lines) {
          const event = JSON.parse(line);

          // Actor should be a string (like "fs-watch"), not an object
          expect(typeof event.actor).toBe("string");

          // Data should be an object with node properties
          expect(typeof event.data).toBe("object");

          // Data should have an id for node_created events
          if (event.type === "node_created") {
            expect(event.data.id).toBeDefined();
            expect(typeof event.data.id).toBe("string");

            // Data should have a type
            expect(event.data.type).toBeDefined();
            expect(typeof event.data.type).toBe("string");
          }
        }
      }
    });
  });

  describe("Folder hierarchy", () => {
    test("should create folder nodes for parent directories", async () => {
      // Create nested folder structure
      const subFolder = join(VAULT_DIR, "projects");
      const deepFolder = join(subFolder, "active");
      mkdirSync(deepFolder, { recursive: true });

      const testFile = join(deepFolder, "task.md");
      writeFileSync(testFile, "# Task\n\n- [ ] Do something\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();

      // Verify folder nodes were created
      const folderNodes = allNodes.filter((n) => n.type === "folder");
      expect(folderNodes.length).toBeGreaterThanOrEqual(2); // projects and active

      // Verify the folders exist by path
      const projectsFolder = getNodeByPath(subFolder);
      const activeFolder = getNodeByPath(deepFolder);

      expect(projectsFolder).not.toBeNull();
      expect(projectsFolder!.type).toBe("folder");

      expect(activeFolder).not.toBeNull();
      expect(activeFolder!.type).toBe("folder");
    });

    test("should link files to their parent folder via parent_id", async () => {
      // Create folder structure
      const subFolder = join(VAULT_DIR, "docs");
      mkdirSync(subFolder);

      const testFile = join(subFolder, "readme.md");
      writeFileSync(testFile, "# Documentation\n\nSome content.\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Get the file and folder nodes
      const fileNode = getNodeByPath(testFile);
      const folderNode = getNodeByPath(subFolder);

      expect(fileNode).not.toBeNull();
      expect(folderNode).not.toBeNull();

      // File should have parent_id pointing to folder
      expect(fileNode!.parent_id).toBe(folderNode!.id);
    });

    test("should create parent chain from nested folders to vault root", async () => {
      // Create deeply nested structure
      const level1 = join(VAULT_DIR, "level1");
      const level2 = join(level1, "level2");
      const level3 = join(level2, "level3");
      mkdirSync(level3, { recursive: true });

      const testFile = join(level3, "deep.md");
      writeFileSync(testFile, "# Deep File\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Get all the nodes
      const folder1 = getNodeByPath(level1);
      const folder2 = getNodeByPath(level2);
      const folder3 = getNodeByPath(level3);
      const file = getNodeByPath(testFile);

      expect(folder1).not.toBeNull();
      expect(folder2).not.toBeNull();
      expect(folder3).not.toBeNull();
      expect(file).not.toBeNull();

      // Verify parent chain
      expect(file!.parent_id).toBe(folder3!.id);
      expect(folder3!.parent_id).toBe(folder2!.id);
      expect(folder2!.parent_id).toBe(folder1!.id);
      // folder1's parent should be null (at vault root)
      expect(folder1!.parent_id).toBeNull();
    });

    test("getAncestors should return full path from root to parent", async () => {
      // Create nested structure with a task
      const subFolder = join(VAULT_DIR, "work");
      mkdirSync(subFolder);

      const testFile = join(subFolder, "tasks.md");
      writeFileSync(
        testFile,
        `# Project Tasks

## Sprint 1

- [ ] Complete the feature
`
      );

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Find the task node
      const allNodes = getAllNodes();
      const taskNode = allNodes.find((n) => n.type === "task");
      expect(taskNode).toBeDefined();

      // Get ancestors
      const ancestors = getAncestors(taskNode!.id);

      // Should have ancestors: folder -> file -> section (Project Tasks) -> section (Sprint 1)
      expect(ancestors.length).toBeGreaterThanOrEqual(3);

      // First ancestor should be the folder (root of chain)
      const folderAncestor = ancestors.find((a) => a.type === "folder");
      expect(folderAncestor).toBeDefined();
      expect(folderAncestor!.fs_path).toBe(subFolder);

      // Should have the file in the chain
      const fileAncestor = ancestors.find((a) => a.type === "file");
      expect(fileAncestor).toBeDefined();
      expect(fileAncestor!.fs_path).toBe(testFile);

      // Should have section(s) in the chain
      const sectionAncestors = ancestors.filter((a) => a.type === "section");
      expect(sectionAncestors.length).toBeGreaterThanOrEqual(1);
    });

    test("should handle multiple files in same folder efficiently", async () => {
      // Create folder with multiple files
      const subFolder = join(VAULT_DIR, "multi");
      mkdirSync(subFolder);

      writeFileSync(join(subFolder, "file1.md"), "# File 1\n");
      writeFileSync(join(subFolder, "file2.md"), "# File 2\n");
      writeFileSync(join(subFolder, "file3.md"), "# File 3\n");

      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      const allNodes = getAllNodes();

      // Should only have ONE folder node for 'multi'
      const folderNodes = allNodes.filter(
        (n) => n.type === "folder" && n.fs_path === subFolder
      );
      expect(folderNodes.length).toBe(1);

      // All three files should have the same parent_id
      const fileNodes = allNodes.filter(
        (n) => n.type === "file" && n.fs_path?.startsWith(subFolder)
      );
      expect(fileNodes.length).toBe(3);

      const folderId = folderNodes[0].id;
      for (const file of fileNodes) {
        expect(file.parent_id).toBe(folderId);
      }
    });
  });
});
