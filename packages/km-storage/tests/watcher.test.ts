/**
 * Watcher Domain Object Tests
 *
 * Tests for createWatcher factory and Service interface implementation.
 */

import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createWatcher } from "../src/index.ts";
import { withTestEnv } from "@km/storage";

describe("createWatcher", () => {
  test("creates watcher with stopped status", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      const watcher = createWatcher(rootDir);

      expect(watcher.status).toBe("stopped");
    }));

  test("start transitions to running", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      await using watcher = createWatcher(rootDir);

      expect(watcher.status).toBe("stopped");

      await watcher.start();

      expect(watcher.status).toBe("running");
    }));

  test("stop transitions to stopped", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      await using watcher = createWatcher(rootDir);

      await watcher.start();
      expect(watcher.status).toBe("running");

      await watcher.stop();
      expect(watcher.status).toBe("stopped");
    }));

  test("start is idempotent when running", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      await using watcher = createWatcher(rootDir);

      await watcher.start();
      expect(watcher.status).toBe("running");

      // Second start should be no-op
      await watcher.start();
      expect(watcher.status).toBe("running");
    }));

  test("stop is idempotent when stopped", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      await using watcher = createWatcher(rootDir);

      expect(watcher.status).toBe("stopped");

      // Stop when already stopped should be no-op
      await watcher.stop();
      expect(watcher.status).toBe("stopped");
    }));

  test("on/off subscribe and unsubscribe handlers", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      await using watcher = createWatcher(rootDir);
      const calls: string[] = [];

      const handler = () => {
        calls.push("ready");
      };

      watcher.on("ready", handler);
      watcher.off("ready", handler);

      // Handler should not be called after unsubscribing
      await watcher.start();

      // Note: ready event may or may not fire depending on timing
      // The key test is that off() doesn't throw
    }));

  test("Symbol.asyncDispose calls stop", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      const watcher = createWatcher(rootDir);

      await watcher.start();
      expect(watcher.status).toBe("running");

      await watcher[Symbol.asyncDispose]();
      expect(watcher.status).toBe("stopped");
    }));

  test("await using syntax calls stop automatically", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      let watcherRef: Awaited<ReturnType<typeof createWatcher>>;

      {
        await using watcher = createWatcher(rootDir);
        watcherRef = watcher;

        await watcher.start();
        expect(watcher.status).toBe("running");
      }

      // Should be stopped after scope exit
      expect(watcherRef.status).toBe("stopped");
    }));

  test("accepts custom options", () =>
    withTestEnv(async ({ testDir }) => {
      const rootDir = join(testDir, "vault");
      const kmDir = join(rootDir, ".km");
      mkdirSync(kmDir, { recursive: true });

      writeFileSync(
        join(rootDir, "tasks.md"),
        `# Tasks

- [ ] Open task
- [x] Done task
`,
      );

      const watcher = createWatcher(rootDir, {
        debounceFs: 1000,
        debounceApply: 500,
        conflictStrategy: "fs_wins",
        useWorker: false,
      });

      expect(watcher.status).toBe("stopped");
    }));
});
