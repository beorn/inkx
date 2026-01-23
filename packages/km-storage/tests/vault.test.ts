/**
 * Vault Domain Object Tests
 *
 * Tests for createVault factory and Vault interface.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { runGenerator } from "@km/core";
import { createVault, closeDb } from "../src/index.ts";
import type { MutationContext, VaultHooks } from "../src/index.ts";

const TEST_DIR = "/tmp/kmtest-vault";

describe.serial("createVault", () => {
  const ROOT_DIR = join(TEST_DIR, "vault-root");

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(ROOT_DIR, { recursive: true });

    // Create test content
    writeFileSync(
      join(ROOT_DIR, "tasks.md"),
      `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
    );

    writeFileSync(
      join(ROOT_DIR, "notes.md"),
      `# Notes

## Section One

Some content here with [[tasks]] link.

## Section Two

- [ ] Nested task
`,
    );
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("creates vault in memory mode (no .km dir)", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    expect(vault.mode).toBe("memory");
    expect(vault.path).toBe(ROOT_DIR);
    expect(vault.stats.nodeCount).toBeGreaterThan(0);

    vault.close();
  });

  test("creates vault in disk mode (with .km dir)", () => {
    mkdirSync(join(ROOT_DIR, ".km"), { recursive: true });

    const vault = runGenerator(createVault(ROOT_DIR));

    expect(vault.mode).toBe("disk");
    expect(vault.path).toBe(ROOT_DIR);

    vault.close();
  });

  test("getNode returns node by ID", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    const tasks = vault.getAllTasks();
    expect(tasks.length).toBeGreaterThan(0);

    const task = tasks[0];
    const fetched = vault.getNode(task.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(task.id);
    expect(fetched!.content).toBe(task.content);

    vault.close();
  });

  test("getChildren returns children of parent", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    // Root children
    const rootChildren = vault.getChildren(null);
    expect(rootChildren.length).toBeGreaterThan(0);

    const fileNames = rootChildren.map((n) => n.content);
    expect(fileNames).toContain("Tasks");
    expect(fileNames).toContain("Notes");

    vault.close();
  });

  test("getAllTasks returns all tasks", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    const tasks = vault.getAllTasks();
    expect(tasks.length).toBe(4); // 3 in tasks.md, 1 in notes.md

    vault.close();
  });

  test("getTasksByStatus filters by status", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    const todo = vault.getTasksByStatus("todo");
    expect(todo.length).toBe(2);

    const done = vault.getTasksByStatus("done");
    expect(done.length).toBe(1);

    const wip = vault.getTasksByStatus("wip");
    expect(wip.length).toBe(1);

    vault.close();
  });

  test("search finds nodes by text", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    const results = vault.search("Open task");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((n) => n.content === "Open task")).toBe(true);

    vault.close();
  });

  test("updateNode modifies node", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    const tasks = vault.getAllTasks();
    const openTask = tasks.find((t) => t.content === "Open task")!;

    vault.updateNode(openTask.id, {
      task_status: "done",
      task_mark: "x",
    });

    const updated = vault.getNode(openTask.id);
    expect(updated!.task_status).toBe("done");

    vault.close();
  });

  test("close prevents further operations", () => {
    const vault = runGenerator(createVault(ROOT_DIR));
    vault.close();

    expect(() => vault.getAllTasks()).toThrow("Vault is closed");
    expect(() => vault.getNode("any-id")).toThrow("Vault is closed");
  });

  test("close is idempotent", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    vault.close();
    vault.close(); // Should not throw

    expect(() => vault.getAllTasks()).toThrow("Vault is closed");
  });

  test("Symbol.dispose calls close", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    // Manually call dispose
    vault[Symbol.dispose]();

    expect(() => vault.getAllTasks()).toThrow("Vault is closed");
  });

  test("using syntax calls close automatically", () => {
    let vaultRef: ReturnType<
      typeof createVault extends Generator<any, infer R, any> ? () => R : never
    >;

    {
      using vault = runGenerator(createVault(ROOT_DIR));
      vaultRef = vault;

      // Should work inside scope
      const tasks = vault.getAllTasks();
      expect(tasks.length).toBe(4);
    }

    // Should be closed after scope exit
    expect(() => vaultRef.getAllTasks()).toThrow("Vault is closed");
  });

  test("watch throws in memory mode", () => {
    const vault = runGenerator(createVault(ROOT_DIR));

    expect(vault.mode).toBe("memory");
    expect(() => vault.watch()).toThrow("Cannot watch a memory vault");

    vault.close();
  });

  test("watch returns Watcher in disk mode", () => {
    mkdirSync(join(ROOT_DIR, ".km"), { recursive: true });

    const vault = runGenerator(createVault(ROOT_DIR));

    expect(vault.mode).toBe("disk");

    const watcher = vault.watch();
    expect(watcher).toBeDefined();
    expect(watcher.status).toBe("stopped");

    vault.close();
  });

  test("yields progress info during loading", () => {
    const progress: Array<string | { current?: number; total?: number }> = [];

    const gen = createVault(ROOT_DIR);
    let result = gen.next();
    while (!result.done) {
      progress.push(result.value as any);
      result = gen.next();
    }
    const vault = result.value;

    expect(progress.length).toBeGreaterThan(0);
    // New format: strings for labels, objects for progress
    // First yield should be declare object, then "Discovering files" string
    expect(progress.some((p) => p === "Discovering files")).toBe(true);

    vault.close();
  });

  test("loadErrors captures non-fatal parse errors", () => {
    // Create a file with invalid content that won't crash but may have warnings
    writeFileSync(
      join(ROOT_DIR, "weird.md"),
      `# Weird
- [ ] Task with [[broken link
`,
    );

    const vault = runGenerator(createVault(ROOT_DIR));

    // loadErrors may or may not have content depending on parser behavior
    expect(vault.loadErrors).toBeDefined();
    expect(Array.isArray(vault.loadErrors)).toBe(true);

    vault.close();
  });

  describe("hooks", () => {
    test("afterQuery is called for query operations", () => {
      const queryCalls: Array<{ operation: string; result: unknown }> = [];
      const hooks: VaultHooks = {
        afterQuery: (operation, result) => {
          queryCalls.push({ operation, result });
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      vault.getAllTasks();
      vault.getNode(vault.getAllTasks()[0]!.id);
      vault.getChildren(null);
      vault.search("task");

      expect(queryCalls.length).toBe(5); // getAllTasks x2, getNode, getChildren, search
      expect(queryCalls.map((c) => c.operation)).toContain("getAllTasks");
      expect(queryCalls.map((c) => c.operation)).toContain("getNode");
      expect(queryCalls.map((c) => c.operation)).toContain("getChildren");
      expect(queryCalls.map((c) => c.operation)).toContain("search");

      vault.close();
    });

    test("beforeMutation is called before mutations", () => {
      const mutations: MutationContext[] = [];
      const hooks: VaultHooks = {
        beforeMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const tasks = vault.getAllTasks();
      const task = tasks[0]!;

      vault.updateNode(task.id, { task_status: "done" });

      expect(mutations.length).toBe(1);
      expect(mutations[0]!.type).toBe("update");
      expect(mutations[0]!.nodeId).toBe(task.id);
      expect(mutations[0]!.changes).toEqual({ task_status: "done" });

      vault.close();
    });

    test("afterMutation is called after mutations", () => {
      const mutations: MutationContext[] = [];
      const hooks: VaultHooks = {
        afterMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const tasks = vault.getAllTasks();
      const task = tasks[0]!;

      vault.updateNode(task.id, { task_status: "done" });

      expect(mutations.length).toBe(1);
      expect(mutations[0]!.type).toBe("update");
      expect(mutations[0]!.nodeId).toBe(task.id);

      vault.close();
    });

    test("beforeMutation can cancel mutations", () => {
      const hooks: VaultHooks = {
        beforeMutation: () => {
          return { cancel: true };
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const tasks = vault.getAllTasks();
      const task = tasks[0]!;
      const originalStatus = task.task_status;

      expect(() => vault.updateNode(task.id, { task_status: "done" })).toThrow(
        /Mutation cancelled by hook/,
      );

      // Verify mutation didn't happen
      const unchanged = vault.getNode(task.id);
      expect(unchanged!.task_status).toBe(originalStatus);

      vault.close();
    });

    test("beforeMutation can modify context", () => {
      const hooks: VaultHooks = {
        beforeMutation: (ctx) => {
          if (ctx.type === "update" && ctx.changes) {
            // Force all status updates to "wip"
            return {
              context: {
                ...ctx,
                changes: { ...ctx.changes, task_status: "wip" as const },
              },
            };
          }
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const tasks = vault.getAllTasks();
      const task = tasks[0]!;

      // Request "done" but hook transforms to "wip"
      vault.updateNode(task.id, { task_status: "done" });

      const updated = vault.getNode(task.id);
      expect(updated!.task_status).toBe("wip");

      vault.close();
    });

    test("onClose is called when vault is closed", () => {
      let closeCalled = false;
      const hooks: VaultHooks = {
        onClose: () => {
          closeCalled = true;
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      expect(closeCalled).toBe(false);
      vault.close();
      expect(closeCalled).toBe(true);
    });

    test("onClose is called only once", () => {
      let closeCount = 0;
      const hooks: VaultHooks = {
        onClose: () => {
          closeCount++;
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      vault.close();
      vault.close();
      vault.close();

      expect(closeCount).toBe(1);
    });

    test("addNode triggers mutation hooks", () => {
      const mutations: MutationContext[] = [];
      const hooks: VaultHooks = {
        beforeMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
        afterMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const rootChildren = vault.getChildren(null);
      const fileNode = rootChildren[0]!;

      vault.addNode(fileNode.id, {
        type: "task",
        content: "New task from hook test",
      });

      expect(mutations.length).toBe(2); // before + after
      expect(mutations[0]!.type).toBe("add");
      expect(mutations[0]!.node?.content).toBe("New task from hook test");

      vault.close();
    });

    test("deleteNode triggers mutation hooks", () => {
      const mutations: MutationContext[] = [];
      const hooks: VaultHooks = {
        beforeMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
        afterMutation: (ctx) => {
          mutations.push({ ...ctx });
        },
      };

      const vault = runGenerator(createVault(ROOT_DIR, { hooks }));

      const tasks = vault.getAllTasks();
      const task = tasks[0]!;

      vault.deleteNode(task.id);

      expect(mutations.length).toBe(2);
      expect(mutations[0]!.type).toBe("delete");
      expect(mutations[0]!.nodeId).toBe(task.id);

      vault.close();
    });
  });
});
