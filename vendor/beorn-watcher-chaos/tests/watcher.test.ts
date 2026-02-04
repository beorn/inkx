import { describe, it, expect, beforeEach } from "vitest";
import {
  ChaosWatcher,
  createChaosWatcher,
  SeededRandom,
  queueOverflow,
  slowDisk,
  editorAtomic,
  reorderChaos,
  fseventsCoalesce,
  NO_CHAOS,
} from "../src/index.ts";

describe("ChaosWatcher", () => {
  let watcher: ChaosWatcher;

  beforeEach(() => {
    watcher = createChaosWatcher();
  });

  describe("basic functionality", () => {
    it("emits ready event on start", async () => {
      let ready = false;
      watcher.on("ready", () => {
        ready = true;
      });
      watcher.start("/repo");
      await new Promise((r) => setImmediate(r));
      expect(ready).toBe(true);
    });

    it("emits sync event with injected events", async () => {
      let syncData: { paths: string[]; directories: string[] } | null = null;
      watcher.on("sync", (data) => {
        syncData = data;
      });

      watcher.start("/repo");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      expect(syncData).not.toBeNull();
      expect(syncData!.paths).toContain("/repo/test.md");
      expect(syncData!.directories).toContain("/repo");
    });

    it("tracks emitted events", async () => {
      watcher.start("/repo");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(1);
      expect(watcher.getEmittedEvents()[0]!.path).toBe("/repo/test.md");
    });
  });

  describe("in-flight writes", () => {
    it("skips in-flight paths", async () => {
      watcher.start("/repo");
      watcher.markInFlight("/repo/test.md");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(0);
    });

    it("processes after clearing in-flight", async () => {
      watcher.start("/repo");
      watcher.markInFlight("/repo/test.md");
      watcher.clearInFlight("/repo/test.md");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(1);
    });
  });

  describe("scenarios", () => {
    it("NO_CHAOS passes events unchanged", async () => {
      watcher.setScenario(NO_CHAOS);
      watcher.start("/repo");
      watcher.injectBatch([
        { type: "change", path: "/repo/a.md" },
        { type: "change", path: "/repo/b.md" },
      ]);
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(2);
      expect(watcher.getDroppedEvents()).toHaveLength(0);
    });

    it("queueOverflow drops events", async () => {
      // 100% drop rate for deterministic test
      watcher.setScenario(queueOverflow(1.0));
      watcher.start("/repo");
      watcher.injectBatch([
        { type: "change", path: "/repo/a.md" },
        { type: "change", path: "/repo/b.md" },
      ]);
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(0);
      expect(watcher.getDroppedEvents()).toHaveLength(2);
    });

    it("editorAtomic converts change to unlink+add sequence", async () => {
      watcher.setScenario(editorAtomic(10));
      watcher.start("/repo");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      const events = watcher.getEmittedEvents();
      // Should have: add (temp), unlink (original), add (final), unlink (temp)
      expect(events.length).toBeGreaterThanOrEqual(3);
      const types = events.map((e) => e.type);
      expect(types).toContain("add");
      expect(types).toContain("unlink");
    });

    it("fseventsCoalesce merges many file events to directory event", async () => {
      watcher.setScenario(fseventsCoalesce(3)); // Coalesce when > 3 files
      watcher.start("/repo");

      // Inject 5 file changes in same directory
      watcher.injectBatch([
        { type: "change", path: "/repo/dir/a.md" },
        { type: "change", path: "/repo/dir/b.md" },
        { type: "change", path: "/repo/dir/c.md" },
        { type: "change", path: "/repo/dir/d.md" },
        { type: "change", path: "/repo/dir/e.md" },
      ]);
      await watcher.flush();

      // Should coalesce to single directory event
      const events = watcher.getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.path).toBe("/repo/dir");
    });
  });

  describe("virtual time", () => {
    it("advanceTime processes delayed events", async () => {
      watcher.setScenario(slowDisk(100, 100)); // Fixed 100ms delay
      watcher.start("/repo");
      watcher.inject({ type: "change", path: "/repo/test.md" });

      // Before advancing time, event is pending
      expect(watcher.getEmittedEvents()).toHaveLength(0);

      // Advance past delay
      await watcher.advanceTime(150);
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(1);
    });

    it("getVirtualTime tracks time advancement", async () => {
      watcher.start("/repo");
      expect(watcher.getVirtualTime()).toBe(0);

      await watcher.advanceTime(100);
      expect(watcher.getVirtualTime()).toBe(100);

      await watcher.advanceTime(50);
      expect(watcher.getVirtualTime()).toBe(150);
    });
  });

  describe("reset", () => {
    it("clears all state", async () => {
      watcher.start("/repo");
      watcher.inject({ type: "change", path: "/repo/test.md" });
      await watcher.flush();

      expect(watcher.getEmittedEvents()).toHaveLength(1);

      watcher.reset();

      expect(watcher.getEmittedEvents()).toHaveLength(0);
      expect(watcher.getDroppedEvents()).toHaveLength(0);
      expect(watcher.getPendingEvents()).toHaveLength(0);
      expect(watcher.getVirtualTime()).toBe(0);
    });
  });
});

describe("SeededRandom", () => {
  it("produces reproducible sequences", () => {
    const r1 = new SeededRandom(12345);
    const r2 = new SeededRandom(12345);

    for (let i = 0; i < 10; i++) {
      expect(r1.next()).toBe(r2.next());
    }
  });

  it("nextInt returns values in range", () => {
    const random = new SeededRandom(12345);
    for (let i = 0; i < 100; i++) {
      const val = random.nextInt(0, 10);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(10);
    }
  });

  it("chance returns true with given probability", () => {
    const random = new SeededRandom(12345);
    let trueCount = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
      if (random.chance(0.5)) trueCount++;
    }

    // Should be roughly 50% (allow 10% margin)
    expect(trueCount).toBeGreaterThan(trials * 0.4);
    expect(trueCount).toBeLessThan(trials * 0.6);
  });

  it("shuffle produces deterministic results", () => {
    const r1 = new SeededRandom(12345);
    const r2 = new SeededRandom(12345);

    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];

    const shuffled1 = r1.shuffle(arr1);
    const shuffled2 = r2.shuffle(arr2);

    expect(shuffled1).toEqual(shuffled2);
  });
});

describe("Service interface", () => {
  it("status starts as stopped", () => {
    const watcher = createChaosWatcher();
    expect(watcher.status).toBe("stopped");
  });

  it("status transitions to running after start", async () => {
    const watcher = createChaosWatcher();
    await watcher.start("/repo");
    expect(watcher.status).toBe("running");
  });

  it("status transitions to stopped after stop", async () => {
    const watcher = createChaosWatcher();
    await watcher.start("/repo");
    await watcher.stop();
    expect(watcher.status).toBe("stopped");
  });

  it("start is idempotent (no-op when running)", async () => {
    const watcher = createChaosWatcher();
    await watcher.start("/repo");
    expect(watcher.status).toBe("running");

    // Second start should be no-op
    await watcher.start("/repo");
    expect(watcher.status).toBe("running");
  });

  it("stop is idempotent (no-op when stopped)", async () => {
    const watcher = createChaosWatcher();
    expect(watcher.status).toBe("stopped");

    // Stop when already stopped should be no-op
    await watcher.stop();
    expect(watcher.status).toBe("stopped");
  });

  it("supports AsyncDisposable", async () => {
    const watcher = createChaosWatcher();
    await watcher.start("/repo");
    expect(watcher.status).toBe("running");

    await watcher[Symbol.asyncDispose]();
    expect(watcher.status).toBe("stopped");
  });

  it("can use repoPath from config", async () => {
    const watcher = createChaosWatcher({ repoPath: "/configured/repo" });
    await watcher.start(); // No repoPath argument
    expect(watcher.repoPath).toBe("/configured/repo");
  });

  it("start argument overrides config repoPath", async () => {
    const watcher = createChaosWatcher({ repoPath: "/configured/repo" });
    await watcher.start("/override/repo");
    expect(watcher.repoPath).toBe("/override/repo");
  });
});
