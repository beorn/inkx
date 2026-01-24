/**
 * Vault Domain Object Tests
 *
 * Tests for createVault factory and Vault interface.
 */

import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runGenerator } from "@km/core";
import { createVault } from "../src/index.ts";
import type { MutationContext, VaultHooks } from "../src/index.ts";
import { withTestEnv } from "./test-utils.ts";

describe("createVault", () => {
  test("creates vault in memory mode (no .km dir)", () =>
    withTestEnv(async ({ vaultDir }) => {
      // Write test content FIRST
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        expect(vault.mode).toBe("memory");
        expect(vault.path).toBe(vaultDir);
        expect(vault.stats.nodeCount).toBeGreaterThan(0);
      } finally {
        vault.close();
      }
    }));

  test("creates vault in disk mode (with .km dir)", () =>
    withTestEnv(async ({ vaultDir }) => {
      // Write test content FIRST
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );
      mkdirSync(join(vaultDir, ".km"), { recursive: true });

      const vault = runGenerator(createVault(vaultDir));
      try {
        expect(vault.mode).toBe("disk");
        expect(vault.path).toBe(vaultDir);
      } finally {
        vault.close();
      }
    }));

  test("getNode returns node by ID", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        const tasks = vault.getAllTasks();
        expect(tasks.length).toBeGreaterThan(0);

        const task = tasks[0];
        const fetched = vault.getNode(task.id);

        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(task.id);
        expect(fetched!.content).toBe(task.content);
      } finally {
        vault.close();
      }
    }));

  test("getChildren returns children of parent", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );
      writeFileSync(
        join(vaultDir, "notes.md"),
        `# Notes

Some content here.
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        // Root children
        const rootChildren = vault.getChildren(null);
        expect(rootChildren.length).toBeGreaterThan(0);

        const fileNames = rootChildren.map((n) => n.content);
        expect(fileNames).toContain("Tasks");
        expect(fileNames).toContain("Notes");
      } finally {
        vault.close();
      }
    }));

  test("getAllTasks returns all tasks", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
      );
      writeFileSync(
        join(vaultDir, "notes.md"),
        `# Notes

## Section One

Some content here with [[tasks]] link.

## Section Two

- [ ] Nested task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        const tasks = vault.getAllTasks();
        expect(tasks.length).toBe(4); // 3 in tasks.md, 1 in notes.md
      } finally {
        vault.close();
      }
    }));

  test("getTasksByStatus filters by status", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
      );
      writeFileSync(
        join(vaultDir, "notes.md"),
        `# Notes

- [ ] Nested task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        const todo = vault.getTasksByStatus("todo");
        expect(todo.length).toBe(2);

        const done = vault.getTasksByStatus("done");
        expect(done.length).toBe(1);

        const wip = vault.getTasksByStatus("wip");
        expect(wip.length).toBe(1);
      } finally {
        vault.close();
      }
    }));

  test("search finds nodes by text", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        const results = vault.search("Open task");
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((n) => n.content === "Open task")).toBe(true);
      } finally {
        vault.close();
      }
    }));

  test("updateNode modifies node", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        const tasks = vault.getAllTasks();
        const openTask = tasks.find((t) => t.content === "Open task")!;

        vault.updateNode(openTask.id, {
          task_status: "done",
          task_mark: "x",
        });

        const updated = vault.getNode(openTask.id);
        expect(updated!.task_status).toBe("done");
      } finally {
        vault.close();
      }
    }));

  test("close prevents further operations", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      vault.close();

      expect(() => vault.getAllTasks()).toThrow("Vault is closed");
      expect(() => vault.getNode("any-id")).toThrow("Vault is closed");
    }));

  test("close is idempotent", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));

      vault.close();
      vault.close(); // Should not throw

      expect(() => vault.getAllTasks()).toThrow("Vault is closed");
    }));

  test("Symbol.dispose calls close", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));

      // Manually call dispose
      vault[Symbol.dispose]();

      expect(() => vault.getAllTasks()).toThrow("Vault is closed");
    }));

  test("using syntax calls close automatically", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
      );
      writeFileSync(
        join(vaultDir, "notes.md"),
        `# Notes

- [ ] Nested task
`,
      );

      let vaultRef: ReturnType<
        typeof createVault extends Generator<any, infer R, any>
          ? () => R
          : never
      >;

      {
        using vault = runGenerator(createVault(vaultDir));
        vaultRef = vault;

        // Should work inside scope
        const tasks = vault.getAllTasks();
        expect(tasks.length).toBe(4);
      }

      // Should be closed after scope exit
      expect(() => vaultRef.getAllTasks()).toThrow("Vault is closed");
    }));

  test("watch throws in memory mode", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        expect(vault.mode).toBe("memory");
        expect(() => vault.watch()).toThrow("Cannot watch a memory vault");
      } finally {
        vault.close();
      }
    }));

  test("watch returns Watcher in disk mode", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );
      mkdirSync(join(vaultDir, ".km"), { recursive: true });

      const vault = runGenerator(createVault(vaultDir));
      try {
        expect(vault.mode).toBe("disk");

        const watcher = vault.watch();
        expect(watcher).toBeDefined();
        expect(watcher.status).toBe("stopped");
      } finally {
        vault.close();
      }
    }));

  test("yields progress info during loading", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );

      const progress: Array<string | { current?: number; total?: number }> = [];

      const gen = createVault(vaultDir);
      let result = gen.next();
      while (!result.done) {
        progress.push(result.value as any);
        result = gen.next();
      }
      const vault = result.value;

      try {
        expect(progress.length).toBeGreaterThan(0);
        // New format: strings for labels, objects for progress
        // First yield should be declare object, then "Discovering files" string
        expect(progress.some((p) => p === "Discovering files")).toBe(true);
      } finally {
        vault.close();
      }
    }));

  test("loadErrors captures non-fatal parse errors", () =>
    withTestEnv(async ({ vaultDir }) => {
      writeFileSync(
        join(vaultDir, "tasks.md"),
        `# Tasks

- [ ] Open task
`,
      );
      // Create a file with invalid content that won't crash but may have warnings
      writeFileSync(
        join(vaultDir, "weird.md"),
        `# Weird
- [ ] Task with [[broken link
`,
      );

      const vault = runGenerator(createVault(vaultDir));
      try {
        // loadErrors may or may not have content depending on parser behavior
        expect(vault.loadErrors).toBeDefined();
        expect(Array.isArray(vault.loadErrors)).toBe(true);
      } finally {
        vault.close();
      }
    }));

  describe("hooks", () => {
    test("afterQuery is called for query operations", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const queryCalls: Array<{ operation: string; result: unknown }> = [];
        const hooks: VaultHooks = {
          afterQuery: (operation, result) => {
            queryCalls.push({ operation, result });
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          vault.getAllTasks();
          vault.getNode(vault.getAllTasks()[0]!.id);
          vault.getChildren(null);
          vault.search("task");

          expect(queryCalls.length).toBe(5); // getAllTasks x2, getNode, getChildren, search
          expect(queryCalls.map((c) => c.operation)).toContain("getAllTasks");
          expect(queryCalls.map((c) => c.operation)).toContain("getNode");
          expect(queryCalls.map((c) => c.operation)).toContain("getChildren");
          expect(queryCalls.map((c) => c.operation)).toContain("search");
        } finally {
          vault.close();
        }
      }));

    test("beforeMutation is called before mutations", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const mutations: MutationContext[] = [];
        const hooks: VaultHooks = {
          beforeMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const tasks = vault.getAllTasks();
          const task = tasks[0]!;

          vault.updateNode(task.id, { task_status: "done" });

          expect(mutations.length).toBe(1);
          expect(mutations[0]!.type).toBe("update");
          expect(mutations[0]!.nodeId).toBe(task.id);
          expect(mutations[0]!.changes).toEqual({ task_status: "done" });
        } finally {
          vault.close();
        }
      }));

    test("afterMutation is called after mutations", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const mutations: MutationContext[] = [];
        const hooks: VaultHooks = {
          afterMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const tasks = vault.getAllTasks();
          const task = tasks[0]!;

          vault.updateNode(task.id, { task_status: "done" });

          expect(mutations.length).toBe(1);
          expect(mutations[0]!.type).toBe("update");
          expect(mutations[0]!.nodeId).toBe(task.id);
        } finally {
          vault.close();
        }
      }));

    test("beforeMutation can cancel mutations", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const hooks: VaultHooks = {
          beforeMutation: () => {
            return { cancel: true };
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const tasks = vault.getAllTasks();
          const task = tasks[0]!;
          const originalStatus = task.task_status;

          expect(() =>
            vault.updateNode(task.id, { task_status: "done" }),
          ).toThrow(/Mutation cancelled by hook/);

          // Verify mutation didn't happen
          const unchanged = vault.getNode(task.id);
          expect(unchanged!.task_status).toBe(originalStatus);
        } finally {
          vault.close();
        }
      }));

    test("beforeMutation can modify context", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

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

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const tasks = vault.getAllTasks();
          const task = tasks[0]!;

          // Request "done" but hook transforms to "wip"
          vault.updateNode(task.id, { task_status: "done" });

          const updated = vault.getNode(task.id);
          expect(updated!.task_status).toBe("wip");
        } finally {
          vault.close();
        }
      }));

    test("onClose is called when vault is closed", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        let closeCalled = false;
        const hooks: VaultHooks = {
          onClose: () => {
            closeCalled = true;
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));

        expect(closeCalled).toBe(false);
        vault.close();
        expect(closeCalled).toBe(true);
      }));

    test("onClose is called only once", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        let closeCount = 0;
        const hooks: VaultHooks = {
          onClose: () => {
            closeCount++;
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));

        vault.close();
        vault.close();
        vault.close();

        expect(closeCount).toBe(1);
      }));

    test("addNode triggers mutation hooks", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const mutations: MutationContext[] = [];
        const hooks: VaultHooks = {
          beforeMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
          afterMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const rootChildren = vault.getChildren(null);
          const fileNode = rootChildren[0]!;

          vault.addNode(fileNode.id, {
            type: "task",
            content: "New task from hook test",
          });

          expect(mutations.length).toBe(2); // before + after
          expect(mutations[0]!.type).toBe("add");
          expect(mutations[0]!.node?.content).toBe("New task from hook test");
        } finally {
          vault.close();
        }
      }));

    test("deleteNode triggers mutation hooks", () =>
      withTestEnv(async ({ vaultDir }) => {
        writeFileSync(
          join(vaultDir, "tasks.md"),
          `# Tasks

- [ ] Open task
`,
        );

        const mutations: MutationContext[] = [];
        const hooks: VaultHooks = {
          beforeMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
          afterMutation: (ctx) => {
            mutations.push({ ...ctx });
          },
        };

        const vault = runGenerator(createVault(vaultDir, { hooks }));
        try {
          const tasks = vault.getAllTasks();
          const task = tasks[0]!;

          vault.deleteNode(task.id);

          expect(mutations.length).toBe(2);
          expect(mutations[0]!.type).toBe("delete");
          expect(mutations[0]!.nodeId).toBe(task.id);
        } finally {
          vault.close();
        }
      }));
  });
});
