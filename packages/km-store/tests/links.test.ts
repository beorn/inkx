/**
 * Links and Backlinks Tests
 *
 * Tests for wikilink parsing from markdown content.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { MemoryStore } from "../src/store.ts";

const TEST_DIR = join(import.meta.dir, ".test-links");

describe("Links and Backlinks", () => {
  let store: MemoryStore | null = null;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("Wikilink Parsing in Content", () => {
    test("should parse simple wikilinks from task content", () => {
      writeFileSync(
        join(TEST_DIR, "tasks.md"),
        "# Tasks\n\n- [ ] Review [[project notes]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();
      const task = nodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task?.content).toContain("[[project notes]]");
    });

    test("should preserve wikilinks with aliases", () => {
      writeFileSync(
        join(TEST_DIR, "doc.md"),
        "# Document\n\n- [ ] See [[Real Target|Display Name]] for details",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();
      const task = nodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task?.content).toContain("[[Real Target|Display Name]]");
    });

    test("should preserve section links", () => {
      writeFileSync(
        join(TEST_DIR, "page.md"),
        "# Page\n\n- [ ] Link to [[other#section]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();
      const task = nodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task?.content).toContain("[[other#section]]");
    });

    test("should handle multiple wikilinks in same task", () => {
      writeFileSync(
        join(TEST_DIR, "multi.md"),
        "# Multi\n\n- [ ] Links to [[one]] and [[two]] and [[three]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();
      const task = nodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task?.content).toContain("[[one]]");
      expect(task?.content).toContain("[[two]]");
      expect(task?.content).toContain("[[three]]");
    });
  });

  describe("Node Resolution by Path", () => {
    test("should find nodes by file path", () => {
      writeFileSync(join(TEST_DIR, "target.md"), "# Target\n\nContent here.");

      store = new MemoryStore(TEST_DIR);

      const node = store.getNodeByPath(join(TEST_DIR, "target.md"));
      expect(node).toBeDefined();
      expect(node?.type).toBe("file");
    });

    test("should return null for non-existent paths", () => {
      writeFileSync(join(TEST_DIR, "exists.md"), "# Exists\n\nContent.");

      store = new MemoryStore(TEST_DIR);

      const node = store.getNodeByPath(join(TEST_DIR, "nonexistent.md"));
      expect(node).toBeNull();
    });
  });

  describe("Node Hierarchy", () => {
    test("should track parent-child relationships", () => {
      writeFileSync(
        join(TEST_DIR, "parent.md"),
        "# Parent\n\n- [ ] Child task 1\n- [ ] Child task 2",
      );

      store = new MemoryStore(TEST_DIR);

      // File has sections as children, sections have tasks
      const allNodes = store.getAllNodes();
      const tasks = allNodes.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);

      // Each task should have a parent
      for (const task of tasks) {
        expect(task.parent_id).toBeDefined();
      }
    });

    test("should build ancestor chain correctly", () => {
      mkdirSync(join(TEST_DIR, "folder"), { recursive: true });
      writeFileSync(
        join(TEST_DIR, "folder", "nested.md"),
        "# Nested\n\n- [ ] Deep task",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();
      const task = nodes.find(
        (n) => n.type === "task" && n.content?.includes("Deep task"),
      );
      expect(task).toBeDefined();

      const ancestors = store.getAncestors(task!.id);
      expect(ancestors.length).toBeGreaterThan(0);
    });
  });
});
