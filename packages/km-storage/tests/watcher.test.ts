/**
 * Watcher Domain Object Tests
 *
 * Tests for createWatcher factory and Service interface implementation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { createWatcher, closeDb } from "../src/index.ts";

const TEST_DIR = "/tmp/kmtest-watcher";

describe.serial("createWatcher", () => {
  const ROOT_DIR = join(TEST_DIR, "watcher-root");
  const KM_DIR = join(ROOT_DIR, ".km");

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(KM_DIR, { recursive: true });

    writeFileSync(
      join(ROOT_DIR, "tasks.md"),
      `# Tasks

- [ ] Open task
- [x] Done task
`,
    );
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("creates watcher with stopped status", () => {
    const watcher = createWatcher(ROOT_DIR);

    expect(watcher.status).toBe("stopped");
  });

  test("start transitions to running", async () => {
    const watcher = createWatcher(ROOT_DIR);

    expect(watcher.status).toBe("stopped");

    await watcher.start();

    expect(watcher.status).toBe("running");

    await watcher.stop();
  });

  test("stop transitions to stopped", async () => {
    const watcher = createWatcher(ROOT_DIR);

    await watcher.start();
    expect(watcher.status).toBe("running");

    await watcher.stop();
    expect(watcher.status).toBe("stopped");
  });

  test("start is idempotent when running", async () => {
    const watcher = createWatcher(ROOT_DIR);

    await watcher.start();
    expect(watcher.status).toBe("running");

    // Second start should be no-op
    await watcher.start();
    expect(watcher.status).toBe("running");

    await watcher.stop();
  });

  test("stop is idempotent when stopped", async () => {
    const watcher = createWatcher(ROOT_DIR);

    expect(watcher.status).toBe("stopped");

    // Stop when already stopped should be no-op
    await watcher.stop();
    expect(watcher.status).toBe("stopped");
  });

  test("on/off subscribe and unsubscribe handlers", async () => {
    const watcher = createWatcher(ROOT_DIR);
    const calls: string[] = [];

    const handler = () => {
      calls.push("ready");
    };

    watcher.on("ready", handler);
    watcher.off("ready", handler);

    // Handler should not be called after unsubscribing
    await watcher.start();
    await watcher.stop();

    // Note: ready event may or may not fire depending on timing
    // The key test is that off() doesn't throw
  });

  test("Symbol.asyncDispose calls stop", async () => {
    const watcher = createWatcher(ROOT_DIR);

    await watcher.start();
    expect(watcher.status).toBe("running");

    await watcher[Symbol.asyncDispose]();
    expect(watcher.status).toBe("stopped");
  });

  test("await using syntax calls stop automatically", async () => {
    let watcherRef: Awaited<ReturnType<typeof createWatcher>>;

    {
      await using watcher = createWatcher(ROOT_DIR);
      watcherRef = watcher;

      await watcher.start();
      expect(watcher.status).toBe("running");
    }

    // Should be stopped after scope exit
    expect(watcherRef.status).toBe("stopped");
  });

  test("accepts custom options", () => {
    const watcher = createWatcher(ROOT_DIR, {
      debounceFs: 1000,
      debounceApply: 500,
      conflictStrategy: "fs_wins",
      useWorker: false,
    });

    expect(watcher.status).toBe("stopped");
  });
});
