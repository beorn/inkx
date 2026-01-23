/**
 * Database Rules Tests
 *
 * Tests for computed rule evaluation (add=, sync=, etc.)
 * Rules are evaluated at sync time and results stored in the links table.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { MemoryStore } from "../src/store.ts";
import {
  evaluateNodeRules,
  evaluateAllRules,
  getNodesWithRules,
  getNodesWithRule,
} from "../src/db-rules.ts";
import { getChildren, getChildCountsBatch } from "../src/db-queries/index.ts";
import { setDb } from "../src/db-instance.ts";

const TEST_DIR = join("/tmp", "kmtest-rules");

describe.serial("Database Rules", () => {
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

  describe.serial("getNodesWithRules", () => {
    test("should find nodes with add= rules", () => {
      // Create a file with sections that have add= rules
      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Open add="@issue status:todo"

## Done add="@issue status:done"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      const nodesWithRules = getNodesWithRules();
      expect(nodesWithRules.length).toBe(2);

      for (const node of nodesWithRules) {
        expect(node.type).toBe("section");
        expect(node.rules?.add).toBeDefined();
      }
    });

    test("should return empty array when no rules exist", () => {
      writeFileSync(
        join(TEST_DIR, "simple.md"),
        `# Simple

## Section 1

- [ ] Task 1

## Section 2

- [ ] Task 2
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      const nodesWithRules = getNodesWithRules();
      expect(nodesWithRules.length).toBe(0);
    });
  });

  describe.serial("getNodesWithRule", () => {
    test("should find nodes with specific rule type", () => {
      writeFileSync(
        join(TEST_DIR, "mixed.md"),
        `# Mixed Rules

## Open add="@issue status:todo"

## Collapsed collapse=true

## Limited limit=3
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      const addRuleNodes = getNodesWithRule("add");
      expect(addRuleNodes.length).toBe(1);
      expect(addRuleNodes[0]?.rules?.add).toBe("@issue status:todo");

      const collapseRuleNodes = getNodesWithRule("collapse");
      expect(collapseRuleNodes.length).toBe(1);
      expect(collapseRuleNodes[0]?.rules?.collapse).toBe(true);
    });
  });

  describe.serial("evaluateNodeRules - add= rule", () => {
    test("should create embed children for matching nodes", () => {
      // Create issues with @issue tag
      writeFileSync(
        join(TEST_DIR, "issues.md"),
        `# Issues

- [ ] Fix bug @issue
- [ ] Add feature @issue
- [x] Done task @issue
`,
      );

      // Create board with add= rule
      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Open add="@issue status:todo"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      // Find the "Open" section
      const allNodes = store.getAllNodes();
      const openSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@issue status:todo",
      );
      expect(openSection).toBeDefined();

      // Evaluate the rules for this section
      evaluateNodeRules(openSection!.id);

      // Check that embed children were created
      const children = getChildren(openSection!.id);
      const embeds = children.filter((c) => c.type === "embed");

      // Should have 2 embeds (the two todo tasks with @issue)
      expect(embeds.length).toBe(2);
      // Each embed should have a link_to pointing to a task
      expect(embeds.every((e) => e.link_to)).toBe(true);
    });

    test("should not create embeds for direct children", () => {
      // Create a section with both direct children AND add= rule
      writeFileSync(
        join(TEST_DIR, "mixed.md"),
        `# Mixed

## Open add="@issue status:todo"

- [ ] Direct child @issue

---

## Other

- [ ] Other task @issue
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      const allNodes = store.getAllNodes();
      const openSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@issue status:todo",
      );
      expect(openSection).toBeDefined();

      evaluateNodeRules(openSection!.id);

      // Check children - should have the direct task + 1 embed for "Other task"
      const children = getChildren(openSection!.id);
      const embeds = children.filter((c) => c.type === "embed");
      const directTasks = children.filter((c) => c.type === "task");

      // Should only have 1 embed (the other task, not the direct child)
      expect(embeds.length).toBe(1);
      // Direct child is already a direct child, not an embed
      expect(directTasks.length).toBe(1);
    });
  });

  describe.serial("evaluateAllRules", () => {
    test("should evaluate all rules in database", () => {
      writeFileSync(
        join(TEST_DIR, "tasks.md"),
        `# Tasks

- [ ] Task A @project
- [ ] Task B @project
- [x] Task C @project
`,
      );

      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Todo add="@project status:todo"

## Done add="@project status:done"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      // Evaluate all rules
      for (const _ of evaluateAllRules()) {
        /* exhaust generator */
      }

      // Check that both sections have embed children
      const allNodes = store.getAllNodes();
      const todoSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@project status:todo",
      );
      const doneSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@project status:done",
      );

      expect(todoSection).toBeDefined();
      expect(doneSection).toBeDefined();

      const todoEmbeds = getChildren(todoSection!.id).filter(
        (c) => c.type === "embed",
      );
      const doneEmbeds = getChildren(doneSection!.id).filter(
        (c) => c.type === "embed",
      );

      // 2 todo tasks as embeds in Todo section + 1 done task as embed in Done section
      expect(todoEmbeds.length).toBe(2);
      expect(doneEmbeds.length).toBe(1);
    });
  });

  describe.serial("getChildren with computed links", () => {
    test("should include embed children from add= rule", () => {
      writeFileSync(
        join(TEST_DIR, "issues.md"),
        `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
`,
      );

      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Open add="@issue status:todo"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      // Find the Open section
      const allNodes = store.getAllNodes();
      const openSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@issue status:todo",
      );
      expect(openSection).toBeDefined();

      // Evaluate rules
      evaluateNodeRules(openSection!.id);

      // Now getChildren should include the embed children
      const children = getChildren(openSection!.id);

      // Should have 2 children (embeds pointing to the issues)
      expect(children.length).toBe(2);
      expect(children.every((c) => c.type === "embed")).toBe(true);
      // Each embed should have a link_to
      expect(children.every((c) => c.link_to)).toBe(true);
    });

    test("should deduplicate direct children and linked children", () => {
      // This tests the UNION in getChildren - if a node is both
      // a direct child AND matched by a query, it should only appear once
      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Open add="status:todo"

- [ ] Direct task
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      const allNodes = store.getAllNodes();
      const openSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "status:todo",
      );
      expect(openSection).toBeDefined();

      // Evaluate rules - the direct task matches "status:todo"
      evaluateNodeRules(openSection!.id);

      // getChildren should return the task only once
      const children = getChildren(openSection!.id);
      expect(children.length).toBe(1);
    });
  });

  describe.serial("incremental updates", () => {
    test("should update links when task status changes", () => {
      writeFileSync(
        join(TEST_DIR, "tasks.md"),
        `# Tasks

- [ ] Task A @tag
- [ ] Task B @tag
`,
      );

      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Todo add="@tag status:todo"

## Done add="@tag status:done"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());
      for (const _ of evaluateAllRules()) {
        /* exhaust generator */
      }

      // Check initial state - both tasks in Todo
      const allNodes = store.getAllNodes();
      const todoSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@tag status:todo",
      );
      const doneSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@tag status:done",
      );

      expect(todoSection).toBeDefined();
      expect(doneSection).toBeDefined();

      let todoChildren = getChildren(todoSection!.id);
      let doneChildren = getChildren(doneSection!.id);

      expect(todoChildren.length).toBe(2);
      expect(doneChildren.length).toBe(0);

      // Mark Task A as done
      const taskA = allNodes.find(
        (n) => n.type === "task" && n.content?.includes("Task A"),
      );
      expect(taskA).toBeDefined();

      store.updateNode(taskA!.id, { task_status: "done", task_mark: "x" });

      // Re-evaluate rules (simulating what onNodeChanged does)
      for (const _ of evaluateAllRules()) {
        /* exhaust generator */
      }

      // Check updated state
      todoChildren = getChildren(todoSection!.id);
      doneChildren = getChildren(doneSection!.id);

      expect(todoChildren.length).toBe(1);
      expect(doneChildren.length).toBe(1);
    });
  });

  describe.serial("getChildCountsBatch with computed links", () => {
    test("should count linked children from query:add rules", () => {
      // This is a regression test for km-jusk bug:
      // getChildCountsBatch was only counting direct children, causing
      // sections with only add= linked children to appear empty.
      writeFileSync(
        join(TEST_DIR, "issues.md"),
        `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
- [ ] Bug 3 @issue
`,
      );

      writeFileSync(
        join(TEST_DIR, "board.md"),
        `# Board

## Open add="@issue status:todo"
`,
      );

      store = new MemoryStore(TEST_DIR);
      setDb(store.getDatabase());

      // Evaluate rules to create links
      for (const _ of evaluateAllRules()) {
        /* exhaust generator */
      }

      // Find the Open section (has no direct children, only linked via add=)
      const allNodes = store.getAllNodes();
      const openSection = allNodes.find(
        (n) => n.type === "section" && n.rules?.add === "@issue status:todo",
      );
      expect(openSection).toBeDefined();

      // getChildCountsBatch should count the linked children
      const counts = getChildCountsBatch([openSection!.id]);
      expect(counts.get(openSection!.id)).toBe(3);
    });
  });
});
