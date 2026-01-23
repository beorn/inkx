/**
 * Links and Backlinks Tests
 *
 * Tests for wikilink parsing from markdown content.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { MemoryStore } from "../src/store.ts";

const TEST_DIR = join("/tmp", "kmtest-links");

describe.serial("Links and Backlinks", () => {
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

  describe.serial("Wikilink Parsing in Content", () => {
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

  describe.serial("Node Resolution by Path", () => {
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

  describe.serial("Embedding Resolution", () => {
    test("should resolve embedding to specific task by content", () => {
      // Create target file with tasks
      writeFileSync(
        join(TEST_DIR, "tasks.md"),
        "# Tasks\n\n- [ ] Buy groceries @shopping\n- [x] Call mom\n- [ ] Review PR @work",
      );

      // Create board that embeds a specific task
      writeFileSync(
        join(TEST_DIR, "board.md"),
        "# My Board\n\n## Work\n- ![[tasks#Review PR]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();

      // Find the embedding node (the list item with ![[...]])
      const embedNode = nodes.find((n) =>
        n.content?.includes("![[tasks#Review PR]]"),
      );
      expect(embedNode).toBeDefined();

      // Find the target task (Review PR)
      const targetTask = nodes.find(
        (n) => n.type === "task" && n.content?.includes("Review PR @work"),
      );
      expect(targetTask).toBeDefined();

      // The embedding should have link_to pointing to the specific task, not the file
      expect(embedNode?.link_to).toBe(targetTask?.id);
    });

    test("should resolve embedding to file when no section match", () => {
      writeFileSync(
        join(TEST_DIR, "source.md"),
        "# Source\n\nSome content here.",
      );

      writeFileSync(
        join(TEST_DIR, "embed.md"),
        "# Embed\n\n- ![[source#nonexistent section]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();

      // Find the embedding node
      const embedNode = nodes.find((n) =>
        n.content?.includes("![[source#nonexistent section]]"),
      );
      expect(embedNode).toBeDefined();

      // Find the source file
      const sourceFile = nodes.find(
        (n) => n.type === "file" && n.fs_path?.endsWith("source.md"),
      );
      expect(sourceFile).toBeDefined();

      // The embedding should fall back to the file since section doesn't exist
      expect(embedNode?.link_to).toBe(sourceFile?.id);
    });

    test("should resolve embedding to section by title", () => {
      writeFileSync(
        join(TEST_DIR, "doc.md"),
        "# Document\n\n## Introduction\n\nIntro content.\n\n## Conclusion\n\nConclusion content.",
      );

      writeFileSync(
        join(TEST_DIR, "ref.md"),
        "# Reference\n\n- ![[doc#Conclusion]]",
      );

      store = new MemoryStore(TEST_DIR);

      const nodes = store.getAllNodes();

      // Find the embedding node
      const embedNode = nodes.find((n) =>
        n.content?.includes("![[doc#Conclusion]]"),
      );
      expect(embedNode).toBeDefined();

      // Find the Conclusion section
      const conclusionSection = nodes.find(
        (n) => n.type === "section" && n.title === "Conclusion",
      );
      expect(conclusionSection).toBeDefined();

      // The embedding should point to the specific section
      expect(embedNode?.link_to).toBe(conclusionSection?.id);
    });
  });

  describe.serial("Node Hierarchy", () => {
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
