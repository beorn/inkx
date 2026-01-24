/**
 * Worker Thread Integration Test
 *
 * This is the ONLY test file using describe.serial for watcher tests - it tests
 * the actual worker thread watcher which can't use AsyncLocalStorage context.
 *
 * All other watcher tests use useWorker: false for parallel execution.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
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
    const events = new EventEmitter();

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

    syncManager.on("state-change", (state) => {
      events.emit("state-change", state);
    });

    try {
      // Initial sync
      await syncManager.syncFromFs();

      // Start watching and wait for ready
      syncManager.start();
      await new Promise<void>((resolve) => {
        syncManager.once("ready", resolve);
      });

      // Wait for full sync cycle: reconciling → idle
      const stateChanged = new Promise<void>((resolve) => {
        let sawReconciling = false;
        const handler = (state: string) => {
          if (state === "reconciling") {
            sawReconciling = true;
          }
          if (state === "idle" && sawReconciling) {
            events.off("state-change", handler);
            resolve();
          }
        };
        events.on("state-change", handler);
      });

      // Make an external edit
      writeFileSync(join(VAULT_DIR, "test.md"), "# Test\n\n- [x] Task\n");

      // Wait for worker to detect and sync (with timeout)
      await Promise.race([
        stateChanged,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout waiting for sync")), 5000),
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
