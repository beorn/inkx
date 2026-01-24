/**
 * Worker Thread Integration Test
 *
 * This is the ONLY test file using describe.serial - it tests the actual
 * worker thread watcher which can't use AsyncLocalStorage context.
 *
 * All other watcher tests use useWorker: false for parallel execution.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { SyncManager } from "../../src/watch/sync.ts";
import { resetDb, closeDb, getAllNodes, applyEvent } from "../../src/index.ts";
import { setKmDir, setDatabase } from "../../src/emit.ts";

const TEST_DIR = "/tmp/kmtest-worker-thread";
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_DIR = join(TEST_DIR, ".km");

describe.serial("Worker Thread Integration", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(VAULT_DIR, { recursive: true });
    mkdirSync(KM_DIR, { recursive: true });
    setKmDir(KM_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("worker watcher receives file change events", async () => {
    // Create initial file
    writeFileSync(join(VAULT_DIR, "test.md"), "# Test\n\n- [ ] Task\n");

    // Create SyncManager with default useWorker: true
    const syncManager = new SyncManager({
      vaultPath: VAULT_DIR,
      debounceFs: 100,
      debounceApply: 50,
      conflictStrategy: "last_write_wins",
      // useWorker defaults to true - uses real worker thread
    });

    try {
      // Initial sync
      await syncManager.syncFromFs();

      // Start watching
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Make an external edit
      const stateChanged = new Promise<void>((resolve) => {
        syncManager.once("state-change", (state) => {
          if (state === "idle") resolve();
        });
      });

      writeFileSync(join(VAULT_DIR, "test.md"), "# Test\n\n- [x] Task\n");

      // Wait for worker to detect and sync
      await Promise.race([
        stateChanged,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000)
        ),
      ]);

      // Verify the change was synced
      const nodes = getAllNodes();
      const task = nodes.find((n) => n.type === "task");
      expect(task).toBeDefined();
      expect(task!.task_status).toBe("done");
    } finally {
      await syncManager.stop();
    }
  });
});
