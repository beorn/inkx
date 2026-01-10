/**
 * Node CRUD Operations Tests
 *
 * Comprehensive tests for creating, reading, updating, deleting, and moving nodes.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Test directory - KM_DIR is set in beforeEach via setKmDir()
const TEST_DIR = join(import.meta.dir, ".test-km");

import {
  getDb,
  closeDb,
  resetDb,
  applyEvent,
  getNode,
  getNodeByPath,
  getChildren,
  getSubtree,
  getTasksByStatus,
  getAllTasks,
  search,
  getAllNodes,
} from "../src/node/db.ts";

import {
  emit,
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitTaskCompleted,
  setKmDir,
  setDatabase,
} from "../src/node/emit.ts";

import { applyEvent } from "../src/node/db.ts";

import type { NodeType, TaskStatus, Event } from "../src/node/types.ts";
import { ulid } from "ulid";

// Test helpers
function createTestNode(
  type: NodeType,
  content?: string,
  parentId?: string | null,
  extra?: Record<string, unknown>,
): Event {
  const id = ulid();
  return emitNodeCreated("test-user", {
    id,
    type,
    parent_id: parentId ?? null,
    content,
    ...extra,
  });
}

describe("Node CRUD Operations", () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Configure emit to use test directory and connect to database
    setKmDir(TEST_DIR);
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

  describe("Create Operations", () => {
    test("should create folder node", () => {
      const event = createTestNode("folder", undefined, null, {
        fs_path: "/test/folder",
      });

      const node = getNode(event.data.id as string);
      expect(node).not.toBeNull();
      expect(node!.type).toBe("folder");
      expect(node!.fs_path).toBe("/test/folder");
    });

    test("should create file node", () => {
      const event = createTestNode("file", undefined, null, {
        fs_path: "/test/file.md",
        fs_ino: 12345,
      });

      const node = getNode(event.data.id as string);
      expect(node).not.toBeNull();
      expect(node!.type).toBe("file");
      expect(node!.fs_path).toBe("/test/file.md");
      expect(node!.fs_ino).toBe(12345);
    });

    test("should create section node", () => {
      const fileEvent = createTestNode("file", undefined, null, {
        fs_path: "/test/doc.md",
      });

      const sectionEvent = createTestNode(
        "section",
        "Introduction",
        fileEvent.data.id as string,
        {
          md_slug: "introduction",
          md_pos: 0,
        },
      );

      const section = getNode(sectionEvent.data.id as string);
      expect(section).not.toBeNull();
      expect(section!.type).toBe("section");
      expect(section!.content).toBe("Introduction");
      expect(section!.md_slug).toBe("introduction");
    });

    test("should create paragraph node", () => {
      const event = createTestNode(
        "paragraph",
        "This is a test paragraph with **bold** text.",
      );

      const node = getNode(event.data.id as string);
      expect(node).not.toBeNull();
      expect(node!.type).toBe("paragraph");
      expect(node!.content).toContain("bold");
    });

    test("should create quote node", () => {
      const event = createTestNode(
        "quote",
        "To be or not to be, that is the question.",
      );

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("quote");
    });

    test("should create code node", () => {
      const event = createTestNode("code", 'console.log("hello");', null, {
        data: { language: "javascript" },
      });

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("code");
      expect(node!.data.language).toBe("javascript");
    });

    test("should create unordered list node", () => {
      const event = createTestNode("ul", "- Item 1\n- Item 2\n- Item 3");

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("ul");
    });

    test("should create ordered list node", () => {
      const event = createTestNode("ol", "1. First\n2. Second\n3. Third");

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("ol");
    });

    test("should create task node with all statuses", () => {
      const statuses: TaskStatus[] = [
        "open",
        "in_progress",
        "done",
        "blocked",
        "waiting",
        "scheduled",
        "cancelled",
      ];

      for (const status of statuses) {
        const event = createTestNode(
          "task",
          `Task with status: ${status}`,
          null,
          {
            task_status: status,
          },
        );

        const node = getNode(event.data.id as string);
        expect(node!.task_status).toBe(status);
      }
    });

    test("should create task with full metadata", () => {
      const event = createTestNode("task", "Complex task", null, {
        task_status: "open",
        task_mark: " ",
        assigned_to: "alice",
        due_date: "2025-03-15",
        scheduled_date: "2025-03-10",
        priority: 1,
      });

      const node = getNode(event.data.id as string);
      expect(node!.task_status).toBe("open");
      expect(node!.assigned_to).toBe("alice");
      expect(node!.due_date).toBe("2025-03-15");
      expect(node!.scheduled_date).toBe("2025-03-10");
      expect(node!.priority).toBe(1);
    });

    test("should create table node", () => {
      const event = createTestNode("table", "| A | B |\n|---|---|\n| 1 | 2 |");

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("table");
    });

    test("should create hr (horizontal rule) node", () => {
      const event = createTestNode("hr", "---");

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("hr");
    });

    test("should create html node", () => {
      const event = createTestNode("html", '<div class="custom">Content</div>');

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("html");
    });

    test("should create agent node", () => {
      const event = createTestNode("agent", undefined, null, {
        data: {
          model: "claude-3-opus",
          systemPrompt: "You are a helpful assistant",
        },
      });

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("agent");
      expect(node!.data.model).toBe("claude-3-opus");
    });

    test("should create board node", () => {
      const event = createTestNode("board", undefined, null, {
        data: {
          columns: ["open", "in_progress", "done"],
          title: "Sprint Board",
        },
      });

      const node = getNode(event.data.id as string);
      expect(node!.type).toBe("board");
      expect(node!.data.columns).toEqual(["open", "in_progress", "done"]);
    });

    test("should create nested hierarchy", () => {
      // Create folder -> file -> section -> paragraph hierarchy
      const folderEvent = createTestNode("folder", undefined, null, {
        fs_path: "/projects",
      });

      const fileEvent = createTestNode(
        "file",
        undefined,
        folderEvent.data.id as string,
        {
          fs_path: "/projects/readme.md",
        },
      );

      const sectionEvent = createTestNode(
        "section",
        "Getting Started",
        fileEvent.data.id as string,
        {
          md_slug: "getting-started",
        },
      );

      const paragraphEvent = createTestNode(
        "paragraph",
        "Welcome to the project!",
        sectionEvent.data.id as string,
      );

      // Verify hierarchy
      const folder = getNode(folderEvent.data.id as string);
      const file = getNode(fileEvent.data.id as string);
      const section = getNode(sectionEvent.data.id as string);
      const paragraph = getNode(paragraphEvent.data.id as string);

      expect(file!.parent_id).toBe(folder!.id);
      expect(section!.parent_id).toBe(file!.id);
      expect(paragraph!.parent_id).toBe(section!.id);

      // Verify children query
      const folderChildren = getChildren(folder!.id);
      expect(folderChildren.length).toBe(1);
      expect(folderChildren[0].id).toBe(file!.id);

      // Verify subtree query
      const subtree = getSubtree(folder!.id);
      expect(subtree.length).toBe(4);
    });
  });

  describe("Read Operations", () => {
    test("should get node by ID", () => {
      const event = createTestNode("paragraph", "Test content");
      const node = getNode(event.data.id as string);

      expect(node).not.toBeNull();
      expect(node!.id).toBe(event.data.id);
    });

    test("should return null for non-existent node", () => {
      const node = getNode("non-existent-id");
      expect(node).toBeNull();
    });

    test("should get node by filesystem path", () => {
      const event = createTestNode("file", undefined, null, {
        fs_path: "/unique/path/file.md",
      });

      const node = getNodeByPath("/unique/path/file.md");
      expect(node).not.toBeNull();
      expect(node!.id).toBe(event.data.id);
    });

    test("should get children of a node", () => {
      const parentEvent = createTestNode("folder");

      createTestNode("file", undefined, parentEvent.data.id as string);
      createTestNode("file", undefined, parentEvent.data.id as string);
      createTestNode("file", undefined, parentEvent.data.id as string);

      const children = getChildren(parentEvent.data.id as string);
      expect(children.length).toBe(3);
    });

    test("should get root-level nodes", () => {
      createTestNode("folder");
      createTestNode("file");

      const roots = getChildren(null);
      expect(roots.length).toBeGreaterThanOrEqual(2);
    });

    test("should get tasks by status", () => {
      createTestNode("task", "Open 1", null, { task_status: "open" });
      createTestNode("task", "Open 2", null, { task_status: "open" });
      createTestNode("task", "Done", null, { task_status: "done" });
      createTestNode("task", "Blocked", null, { task_status: "blocked" });

      const openTasks = getTasksByStatus("open");
      expect(openTasks.length).toBe(2);

      const multiStatus = getTasksByStatus(["open", "blocked"]);
      expect(multiStatus.length).toBe(3);
    });

    test("should get all tasks", () => {
      createTestNode("task", "Task 1", null, { task_status: "open" });
      createTestNode("task", "Task 2", null, { task_status: "done" });
      createTestNode("paragraph", "Not a task");

      const tasks = getAllTasks();
      expect(tasks.length).toBe(2);
    });

    test("should search nodes by content", () => {
      createTestNode("paragraph", "The quick brown fox");
      createTestNode("paragraph", "The lazy dog");
      createTestNode("task", "Fix the fox issue", null, {
        task_status: "open",
      });

      const results = search("fox");
      expect(results.length).toBe(2);
    });
  });

  describe("Update Operations", () => {
    test("should update node content", () => {
      const event = createTestNode("paragraph", "Original content");
      const nodeId = event.data.id as string;

      emitNodeUpdated("test-user", nodeId, { content: "Updated content" });

      const node = getNode(nodeId);
      expect(node!.content).toBe("Updated content");
    });

    test("should update task status", () => {
      const event = createTestNode("task", "Test task", null, {
        task_status: "open",
      });
      const nodeId = event.data.id as string;

      emitNodeUpdated("test-user", nodeId, { task_status: "in_progress" });

      const node = getNode(nodeId);
      expect(node!.task_status).toBe("in_progress");
    });

    test("should update task metadata", () => {
      const event = createTestNode("task", "Test task", null, {
        task_status: "open",
      });
      const nodeId = event.data.id as string;

      emitNodeUpdated("test-user", nodeId, {
        assigned_to: "bob",
        due_date: "2025-06-01",
        priority: 2,
      });

      const node = getNode(nodeId);
      expect(node!.assigned_to).toBe("bob");
      expect(node!.due_date).toBe("2025-06-01");
      expect(node!.priority).toBe(2);
    });

    test("should update node metadata (data field)", () => {
      const event = createTestNode("code", "const x = 1;", null, {
        data: { language: "javascript" },
      });
      const nodeId = event.data.id as string;

      emitNodeUpdated("test-user", nodeId, {
        data: { language: "typescript", highlighted: true },
      });

      const node = getNode(nodeId);
      // Note: json_patch merges, so both should be present
      expect(node!.data.language).toBe("typescript");
      expect(node!.data.highlighted).toBe(true);
    });

    test("should track version on update", () => {
      const event = createTestNode("paragraph", "Original");
      const nodeId = event.data.id as string;

      const originalNode = getNode(nodeId);
      const originalVersion = originalNode!.version;

      const updateEvent = emitNodeUpdated("test-user", nodeId, {
        content: "Updated",
      });

      const updatedNode = getNode(nodeId);
      expect(updatedNode!.version).toBe(updateEvent.id);
      expect(updatedNode!.version).not.toBe(originalVersion);
    });
  });

  describe("Move Operations", () => {
    test("should move node to new parent", () => {
      const folder1 = createTestNode("folder");
      const folder2 = createTestNode("folder");
      const file = createTestNode("file", undefined, folder1.data.id as string);

      const fileId = file.data.id as string;

      // Verify initial parent
      expect(getNode(fileId)!.parent_id).toBe(folder1.data.id);

      // Move to folder2
      emitNodeMoved("test-user", fileId, {
        parent_id: folder2.data.id as string,
      });

      const movedNode = getNode(fileId);
      expect(movedNode!.parent_id).toBe(folder2.data.id);

      // Verify children updated
      expect(getChildren(folder1.data.id as string).length).toBe(0);
      expect(getChildren(folder2.data.id as string).length).toBe(1);
    });

    test("should move node to root", () => {
      const folder = createTestNode("folder");
      const file = createTestNode("file", undefined, folder.data.id as string);

      const fileId = file.data.id as string;

      emitNodeMoved("test-user", fileId, { parent_id: null });

      const movedNode = getNode(fileId);
      expect(movedNode!.parent_id).toBeNull();
    });

    test("should update sort order on move", () => {
      const folder = createTestNode("folder");
      const file1 = createTestNode("file", undefined, folder.data.id as string);
      const file2 = createTestNode("file", undefined, folder.data.id as string);

      const file1Id = file1.data.id as string;

      // Move file1 with new sort order
      emitNodeMoved("test-user", file1Id, {
        parent_id: folder.data.id as string,
        parent_idx: 100,
      });

      const node = getNode(file1Id);
      expect(node!.parent_idx).toBe(100);
    });

    test("should preserve subtree on move", () => {
      const folder1 = createTestNode("folder");
      const folder2 = createTestNode("folder");

      const section = createTestNode(
        "section",
        "Parent",
        folder1.data.id as string,
      );
      const paragraph = createTestNode(
        "paragraph",
        "Child",
        section.data.id as string,
      );

      const sectionId = section.data.id as string;
      const paragraphId = paragraph.data.id as string;

      // Move section to folder2
      emitNodeMoved("test-user", sectionId, {
        parent_id: folder2.data.id as string,
      });

      // Paragraph should still be child of section
      const para = getNode(paragraphId);
      expect(para!.parent_id).toBe(sectionId);

      // Subtree should be intact
      const subtree = getSubtree(sectionId);
      expect(subtree.length).toBe(2);
    });
  });

  describe("Delete Operations", () => {
    test("should delete node", () => {
      const event = createTestNode("paragraph", "To be deleted");
      const nodeId = event.data.id as string;

      expect(getNode(nodeId)).not.toBeNull();

      emitNodeDeleted("test-user", nodeId);

      expect(getNode(nodeId)).toBeNull();
    });

    test("should handle deleting node with children (orphans children)", () => {
      const parent = createTestNode("folder");
      const child = createTestNode("file", undefined, parent.data.id as string);

      const parentId = parent.data.id as string;
      const childId = child.data.id as string;

      emitNodeDeleted("test-user", parentId);

      // Parent should be gone
      expect(getNode(parentId)).toBeNull();

      // Child still exists but now orphaned
      const orphan = getNode(childId);
      expect(orphan).not.toBeNull();
      // Parent reference still points to deleted node
      expect(orphan!.parent_id).toBe(parentId);
    });
  });

  describe("Task Lifecycle Operations", () => {
    test("should claim task", () => {
      const task = createTestNode("task", "Unclaimed task", null, {
        task_status: "open",
      });
      const taskId = task.data.id as string;

      emitTaskClaimed(taskId, "alice");

      const node = getNode(taskId);
      expect(node!.assigned_to).toBe("alice");
      expect(node!.task_status).toBe("in_progress");
    });

    test("should release task", () => {
      const task = createTestNode("task", "Claimed task", null, {
        task_status: "in_progress",
        assigned_to: "alice",
      });
      const taskId = task.data.id as string;

      emitTaskReleased(taskId, "alice", "Need more info");

      const node = getNode(taskId);
      expect(node!.assigned_to).toBeNull();
      expect(node!.task_status).toBe("open");
    });

    test("should complete task", () => {
      const task = createTestNode("task", "In progress task", null, {
        task_status: "in_progress",
        assigned_to: "alice",
      });
      const taskId = task.data.id as string;

      emitTaskCompleted(taskId, "alice", "All done!");

      const node = getNode(taskId);
      expect(node!.task_status).toBe("done");
      expect(node!.task_mark).toBe("x");
    });
  });

  describe("Complex Scenarios", () => {
    test("should handle rapid create-update-delete cycle", () => {
      const ids: string[] = [];

      // Create 10 nodes
      for (let i = 0; i < 10; i++) {
        const event = createTestNode("paragraph", `Content ${i}`);
        ids.push(event.data.id as string);
      }

      expect(getAllNodes().length).toBe(10);

      // Update all nodes
      for (const id of ids) {
        emitNodeUpdated("test-user", id, { content: "Updated!" });
      }

      // Delete half
      for (let i = 0; i < 5; i++) {
        emitNodeDeleted("test-user", ids[i]);
      }

      expect(getAllNodes().length).toBe(5);
    });

    test("should handle deep nesting", () => {
      let parentId: string | null = null;

      // Create 10 levels deep
      for (let i = 0; i < 10; i++) {
        const event = createTestNode("section", `Level ${i}`, parentId);
        parentId = event.data.id as string;
      }

      // Get deepest node
      const deepest = getNode(parentId!);
      expect(deepest).not.toBeNull();

      // Walk up to root
      let current = deepest;
      let depth = 0;
      while (current!.parent_id) {
        current = getNode(current!.parent_id);
        depth++;
      }
      expect(depth).toBe(9);
    });

    test("should handle task workflow: create -> claim -> work -> complete", () => {
      // Create task
      const taskEvent = createTestNode("task", "Implement feature X", null, {
        task_status: "open",
        priority: 1,
        due_date: "2025-02-01",
      });
      const taskId = taskEvent.data.id as string;

      let task = getNode(taskId);
      expect(task!.task_status).toBe("open");

      // Claim task
      emitTaskClaimed(taskId, "developer-1");
      task = getNode(taskId);
      expect(task!.task_status).toBe("in_progress");
      expect(task!.assigned_to).toBe("developer-1");

      // Add some notes (update)
      emitNodeUpdated("developer-1", taskId, {
        content: "Implement feature X\n\nProgress: 50% complete",
      });

      // Complete task
      emitTaskCompleted(
        taskId,
        "developer-1",
        "Feature implemented and tested",
      );
      task = getNode(taskId);
      expect(task!.task_status).toBe("done");
      expect(task!.task_mark).toBe("x");
    });

    test("should maintain referential integrity with symlinks", () => {
      // Create original node
      const original = createTestNode("task", "Original task", null, {
        task_status: "open",
      });
      const originalId = original.data.id as string;

      // Create symlink to original
      const symlink = createTestNode("task", undefined, null, {
        symlink_to: originalId,
      });

      const symlinkNode = getNode(symlink.data.id as string);
      expect(symlinkNode!.symlink_to).toBe(originalId);
    });

    test("should handle concurrent-like updates (sequential simulation)", () => {
      const task = createTestNode("task", "Shared task", null, {
        task_status: "open",
      });
      const taskId = task.data.id as string;

      // Simulate two users updating different fields
      emitNodeUpdated("user-a", taskId, { priority: 1 });
      emitNodeUpdated("user-b", taskId, { due_date: "2025-05-01" });

      const node = getNode(taskId);
      expect(node!.priority).toBe(1);
      expect(node!.due_date).toBe("2025-05-01");
    });
  });
});
