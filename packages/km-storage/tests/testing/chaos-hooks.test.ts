/**
 * ChaosHooks Tests
 *
 * Tests for the Vault lifecycle hooks chaos testing utility.
 *
 * Note: These tests use createVault which internally manages its own database
 * via loadVault. They CANNOT use withTestEnv because createVault's internal
 * setDb() call would overwrite the ALS context. Must remain serial.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { runGenerator } from "@km/core";
import {
  createVault,
  createChaosHooks,
  createSeededRandom,
  closeDb,
} from "../../src/index.ts";
import type { ChaosEvent, ChaosHooks } from "../../src/index.ts";

const TEST_DIR = "/tmp/kmtest-chaos-hooks";
const VAULT_DIR = join(TEST_DIR, "vault");

describe.serial("createChaosHooks", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates hooks with default config (no chaos)", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const hooks = createChaosHooks();
    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();
      expect(tasks.length).toBe(3);

      // Update should succeed
      vault.updateNode(tasks[0]!.id, { task_status: "done" });

      const updated = vault.getNode(tasks[0]!.id);
      expect(updated!.task_status).toBe("done");

      // No chaos events
      expect(hooks.getChaosEvents()).toHaveLength(0);
    } finally {
      vault.close();
    }
  });

  test("drops mutations at configured rate", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    // Use seeded random for deterministic test
    const random = createSeededRandom(12345);
    const events: ChaosEvent[] = [];

    const hooks = createChaosHooks({
      mutationDropRate: 1.0, // 100% drop rate for testing
      random,
      onChaosEvent: (e) => events.push(e),
    });

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();
      expect(tasks.length).toBe(3);

      // Update should be dropped
      expect(() =>
        vault.updateNode(tasks[0]!.id, { task_status: "done" }),
      ).toThrow(/Mutation cancelled by hook/);

      // Verify mutation was dropped
      const unchanged = vault.getNode(tasks[0]!.id);
      expect(unchanged!.task_status).toBe("todo");

      // Check chaos events
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("drop");
      expect(events[0]!.mutation.type).toBe("update");
    } finally {
      vault.close();
    }
  });

  test("corrupts mutations at configured rate", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const random = createSeededRandom(42);
    const events: ChaosEvent[] = [];

    const hooks = createChaosHooks({
      mutationDropRate: 0, // Don't drop
      mutationCorruptRate: 1.0, // 100% corruption rate
      random,
      onChaosEvent: (e) => events.push(e),
    });

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();
      const task = tasks[0]!;

      // Update will be corrupted
      vault.updateNode(task.id, { task_status: "done" });

      // Check that corruption event was logged
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("corrupt");
    } finally {
      vault.close();
    }
  });

  test("supports type-specific drop rates", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const hooks = createChaosHooks({
      dropRates: {
        update: 1.0, // Drop all updates
        add: 0, // Allow all adds
        delete: 0, // Allow all deletes
      },
    });

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();

      // Update should be dropped
      expect(() =>
        vault.updateNode(tasks[0]!.id, { task_status: "done" }),
      ).toThrow(/Mutation cancelled by hook/);

      // Add should succeed
      const rootChildren = vault.getChildren(null);
      const fileNode = rootChildren[0]!;
      const newId = vault.addNode(fileNode.id, {
        type: "task",
        content: "New task",
      });
      expect(newId).toBeDefined();
    } finally {
      vault.close();
    }
  });

  test("can be disabled and enabled", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const hooks = createChaosHooks({
      mutationDropRate: 1.0, // Would drop all mutations
    }) as ChaosHooks;

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();

      // With chaos enabled, update should fail
      expect(hooks.isEnabled()).toBe(true);
      expect(() =>
        vault.updateNode(tasks[0]!.id, { task_status: "done" }),
      ).toThrow(/Mutation cancelled by hook/);

      // Disable chaos
      hooks.disable();
      expect(hooks.isEnabled()).toBe(false);

      // Now update should succeed
      vault.updateNode(tasks[1]!.id, { task_status: "done" });
      const updated = vault.getNode(tasks[1]!.id);
      expect(updated!.task_status).toBe("done");

      // Re-enable chaos
      hooks.enable();
      expect(hooks.isEnabled()).toBe(true);

      // Now update should fail again
      expect(() =>
        vault.updateNode(tasks[2]!.id, { task_status: "done" }),
      ).toThrow(/Mutation cancelled by hook/);
    } finally {
      vault.close();
    }
  });

  test("tracks statistics", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const random = createSeededRandom(999);

    const hooks = createChaosHooks({
      mutationDropRate: 0.5, // 50% drop rate
      random,
    }) as ChaosHooks;

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();

      // Try multiple mutations
      for (const task of tasks) {
        try {
          vault.updateNode(task.id, { task_status: "done" });
        } catch {
          // Expected for dropped mutations
        }
      }

      const stats = hooks.getStats();
      expect(stats.totalMutations).toBe(3);
      expect(stats.droppedMutations + stats.successfulMutations).toBe(3);
    } finally {
      vault.close();
    }
  });

  test("clearChaosEvents resets event log", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    const hooks = createChaosHooks({
      mutationDropRate: 1.0,
    }) as ChaosHooks;

    const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

    try {
      const tasks = vault.getAllTasks();

      try {
        vault.updateNode(tasks[0]!.id, { task_status: "done" });
      } catch {
        // Expected
      }

      expect(hooks.getChaosEvents()).toHaveLength(1);

      hooks.clearChaosEvents();
      expect(hooks.getChaosEvents()).toHaveLength(0);
    } finally {
      vault.close();
    }
  });

  test("seeded random produces deterministic results", () => {
    writeFileSync(
      join(VAULT_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    );

    // Run same scenario twice with same seed
    const results1: string[] = [];
    const results2: string[] = [];

    for (const results of [results1, results2]) {
      const random = createSeededRandom(54321);
      const hooks = createChaosHooks({
        mutationDropRate: 0.5,
        random,
      });

      const vault = runGenerator(createVault(VAULT_DIR, { hooks }));

      try {
        const tasks = vault.getAllTasks();
        for (const task of tasks) {
          try {
            vault.updateNode(task.id, { task_status: "done" });
            results.push("success");
          } catch {
            results.push("dropped");
          }
        }
      } finally {
        vault.close();
      }
    }

    // Results should be identical with same seed
    expect(results1).toEqual(results2);
  });
});
