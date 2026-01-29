/**
 * DotzReporter Tests
 *
 * Tests for vitest-dotz reporter covering:
 * - Pure functions (durationToSymbol, fmtDuration, fmtMs)
 * - Store integration (createTestStore)
 * - Component tests (skipped - see note below)
 *
 * Component tests are skipped because useContentRect triggers React act() warnings
 * that the bun-test-setup intercepts. The fix requires changes to inkx.
 */

import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { createTestRenderer, stripAnsi } from "inkx/testing";

import {
  Report,
  StyleContext,
  DEFAULT_SYMBOLS,
  DURATION_MULTIPLIER,
  STATUS_DOTS,
  durationToSymbol,
  fmtDuration,
  fmtMs,
  type Options,
} from "./index.tsx";
import { createTestStore, type TestStore } from "./store.js";

/**
 * Create a passthrough style chain for testing.
 * Each method returns the text unchanged, allowing assertions on structure.
 */
function createTestStyle() {
  const createChain = (): unknown => {
    const handler: ProxyHandler<object> = {
      get(_, prop) {
        // If it's a method call (e.g. red('text')), return identity function
        // If it's a chained property (e.g. bold.red), return another proxy
        return typeof prop === "string" ? createChain() : undefined;
      },
      apply(_, __, args) {
        // When called as function, return the first argument (the text)
        return args[0] ?? "";
      },
    };
    return new Proxy(function () {}, handler);
  };
  return createChain;
}

function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    slowThreshold: 100,
    perfOutput: "",
    showSlow: true,
    symbols: DEFAULT_SYMBOLS,
    ...overrides,
  };
}

// Use createTestRenderer which handles act() properly
const render = createTestRenderer({ columns: 100, rows: 50 });

function renderReport(store: TestStore, options: Options) {
  const testStyle = createTestStyle();
  const app = render(
    <StyleContext.Provider value={testStyle as never}>
      <Report store={store} options={options} width={100} />
    </StyleContext.Provider>,
  );
  return {
    raw: app.lastFrame() ?? "",
    text: stripAnsi(app.lastFrame() ?? ""),
  };
}

// Component tests are skipped because useContentRect triggers React act() warnings
// that the bun-test-setup intercepts. The inkx test renderer uses act() internally
// but layout feedback happens post-render. This is a known limitation.
// TODO: Fix inkx to not trigger state updates when dimensions are already known
describe.skip("Report component", () => {
  let store: TestStore;
  let options: Options;

  beforeEach(() => {
    store = createTestStore(100);
    options = createOptions();
  });

  describe("empty state", () => {
    it("renders legend with empty test area", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("Legend:");
      expect(text).toContain("fast");
      expect(text).toContain("slow");
      expect(text).toContain("fail");
      expect(text).toContain("skip");
      expect(text).toContain("pending");
      expect(text).toContain("noisy");
    });

    it("shows zero tests in summary", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("Tests");
      expect(text).toContain("(0)");
      expect(text).toContain("Time");
    });

    it("does not show package table with zero categories", async () => {
      const { text } = renderReport(store, options);

      expect(text).not.toContain("PACKAGE");
    });
  });

  describe("passing tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.addTest("test-2", "pkg-a", "file1.test.ts");
      store.addTest("test-3", "pkg-a", "file2.test.ts");
      store.updateTest("test-1", "passed", 10);
      store.updateTest("test-2", "passed", 50);
      store.updateTest("test-3", "passed", 200);
    });

    it("shows passing test dots grouped by package", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("pkg-a");
    });

    it("shows correct count in summary", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("3 passed");
      expect(text).toContain("(3)");
    });

    it("shows slow test section for tests exceeding 2x threshold", async () => {
      store.updateSlowest("slow test", "file2.test.ts", 10, 200, 100);
      const { text } = renderReport(store, options);

      expect(text).toContain("SLOW TESTS");
      expect(text).toContain("slow test");
    });
  });

  describe("failing tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.addTest("test-2", "pkg-a", "file1.test.ts");
      store.updateTest("test-1", "passed", 10);
      store.updateTest("test-2", "failed", 15, [{ message: "Expected true to be false" }]);
    });

    it("shows failure count in summary", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("1 failed");
      expect(text).toContain("1 passed");
    });

    it("renders FAILURES section with error details", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("FAILURES");
      expect(text).toContain("Expected true to be false");
    });

    it("shows failure dot character", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain(STATUS_DOTS.failed.char);
    });
  });

  describe("skipped tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.addTest("test-2", "pkg-a", "file1.test.ts");
      store.updateTest("test-1", "passed", 10);
      store.updateTest("test-2", "skipped", 0);
    });

    it("shows skipped count in summary", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("1 skipped");
      expect(text).toContain("1 passed");
    });

    it("shows skip dot character", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain(STATUS_DOTS.skipped.char);
    });
  });

  describe("noisy tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.updateTest("test-1", "passed", 10, undefined, true);
    });

    it("shows noisy dot for tests with console output", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain(STATUS_DOTS.noisy.char);
    });
  });

  describe("multiple packages", () => {
    beforeEach(() => {
      // Package A: 3 tests
      store.addTest("a-1", "package-a", "a1.test.ts");
      store.addTest("a-2", "package-a", "a2.test.ts");
      store.addTest("a-3", "package-a", "a3.test.ts");
      store.updateTest("a-1", "passed", 10);
      store.updateTest("a-2", "passed", 20);
      store.updateTest("a-3", "failed", 30, [{ message: "error" }]);

      // Package B: 2 tests
      store.addTest("b-1", "package-b", "b1.test.ts");
      store.addTest("b-2", "package-b", "b1.test.ts");
      store.updateTest("b-1", "passed", 15);
      store.updateTest("b-2", "skipped", 0);
    });

    it("shows package table header", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("PACKAGE");
      expect(text).toContain("TESTS");
      expect(text).toContain("TIME");
      expect(text).toContain("SLOW");
    });

    it("lists each package with stats", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("package-a");
      expect(text).toContain("package-b");
    });

    it("shows dots grouped by package", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("package-a");
      expect(text).toContain("package-b");
    });
  });

  describe("pending tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.addTest("test-2", "pkg-a", "file1.test.ts");
      store.updateTest("test-1", "passed", 10);
      // test-2 stays pending (not updated)
    });

    it("shows pending dot for unfinished tests", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain(STATUS_DOTS.pending.char);
    });
  });

  describe("slow tests display", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts");
      store.updateTest("test-1", "passed", 500);
      store.updateSlowest("very slow test", "file1.test.ts", 42, 500, 100);
    });

    it("shows slow test with file location", async () => {
      const { text } = renderReport(store, options);

      expect(text).toContain("SLOW TESTS");
      expect(text).toContain("very slow test");
      expect(text).toContain("file1.test.ts:42");
    });

    it("hides slow tests when showSlow is false", async () => {
      options.showSlow = false;
      const { text } = renderReport(store, options);

      expect(text).not.toContain("SLOW TESTS");
    });
  });

  describe("duration symbols in dots", () => {
    it("shows different symbols based on test duration", async () => {
      store.addTest("fast", "pkg", "file.test.ts");
      store.addTest("medium", "pkg", "file.test.ts");
      store.addTest("slow", "pkg", "file.test.ts");
      store.updateTest("fast", "passed", 10); // < 333ms = first symbol
      store.updateTest("medium", "passed", 400); // 333-666ms = second symbol
      store.updateTest("slow", "passed", 800); // 666-1000ms = third symbol

      const { raw } = renderReport(store, options);

      // Should contain different dot symbols (checking raw ANSI output for green dots)
      expect(raw).toContain("·");
      expect(raw).toContain("•");
      expect(raw).toContain("●");
    });
  });
});

describe("durationToSymbol", () => {
  const symbols = DEFAULT_SYMBOLS; // ["·", "•", "●"]
  const threshold = 100;

  it("returns first symbol for fast tests", () => {
    const result = durationToSymbol(0, threshold, symbols);
    expect(result.char).toBe("·");
    expect(result.bright).toBe(false);
  });

  it("returns middle symbol for medium tests", () => {
    // With 3 symbols and 10x multiplier, each symbol covers ~333ms
    const result = durationToSymbol(400, threshold, symbols);
    expect(result.char).toBe("•");
    expect(result.bright).toBe(false);
  });

  it("returns last symbol for slow tests", () => {
    const result = durationToSymbol(800, threshold, symbols);
    expect(result.char).toBe("●");
    expect(result.bright).toBe(false);
  });

  it("returns bright for tests exceeding max duration", () => {
    const result = durationToSymbol(1500, threshold, symbols);
    expect(result.char).toBe("●");
    expect(result.bright).toBe(true);
  });

  it("handles edge case at exact threshold boundaries", () => {
    // At exactly threshold * DURATION_MULTIPLIER / symbols.length
    const boundary = (threshold * DURATION_MULTIPLIER) / symbols.length;
    const result = durationToSymbol(boundary, threshold, symbols);
    expect(result.char).toBe("•"); // Second symbol
    expect(result.bright).toBe(false);
  });
});

describe("fmtDuration", () => {
  it("formats milliseconds under 1 second", () => {
    expect(fmtDuration(0)).toBe("0ms");
    expect(fmtDuration(50)).toBe("50ms");
    expect(fmtDuration(999)).toBe("999ms");
  });

  it("formats seconds under 1 minute", () => {
    expect(fmtDuration(1000)).toBe("1.00s");
    expect(fmtDuration(1500)).toBe("1.50s");
    expect(fmtDuration(59999)).toBe("60.00s");
  });

  it("formats minutes", () => {
    expect(fmtDuration(60000)).toBe("1m 0s");
    expect(fmtDuration(90000)).toBe("1m 30s");
    expect(fmtDuration(125000)).toBe("2m 5s");
  });
});

describe("fmtMs", () => {
  it("formats milliseconds", () => {
    expect(fmtMs(50)).toBe("50ms");
    expect(fmtMs(999)).toBe("999ms");
  });

  it("formats seconds for 1000ms or more", () => {
    expect(fmtMs(1000)).toBe("1s");
    expect(fmtMs(2500)).toBe("2.5s");
  });
});

describe("store integration", () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore(100);
  });

  it("updates state correctly through test lifecycle", () => {
    // Add tests
    store.addTest("t1", "pkg", "file.test.ts");
    store.addTest("t2", "pkg", "file.test.ts");

    let state = store.getSnapshot();
    expect(state.testStates.get("t1")).toBe("pending");
    expect(state.testStates.get("t2")).toBe("pending");

    // Update tests
    store.updateTest("t1", "passed", 50);
    store.updateTest("t2", "failed", 100, [{ message: "oops" }]);

    state = store.getSnapshot();
    expect(state.passed).toBe(1);
    expect(state.failed).toBe(1);
    expect(state.testDurations.get("t1")).toBe(50);
    expect(state.testErrors.get("t2")?.errors[0]?.message).toBe("oops");
  });

  it("tracks categories and files correctly", () => {
    store.addTest("t1", "pkg-a", "a.test.ts");
    store.addTest("t2", "pkg-a", "b.test.ts");
    store.addTest("t3", "pkg-b", "c.test.ts");

    const state = store.getSnapshot();
    expect(state.categoryOrder).toEqual(["pkg-a", "pkg-b"]);
    expect(state.categoryStats.get("pkg-a")?.testIds).toEqual(["t1", "t2"]);
    expect(state.categoryStats.get("pkg-a")?.fileOrder).toEqual(["a.test.ts", "b.test.ts"]);
  });

  it("tracks slowest tests", () => {
    store.addTest("t1", "pkg", "file.test.ts");
    store.updateTest("t1", "passed", 500);
    store.updateSlowest("slow one", "file.test.ts", 10, 500, 100);

    const state = store.getSnapshot();
    expect(state.topSlowest).toHaveLength(1);
    expect(state.topSlowest[0]?.name).toBe("slow one");
    expect(state.topSlowest[0]?.duration).toBe(500);
    expect(state.topSlowest[0]?.line).toBe(10);
  });

  it("limits slowest tests to 20", () => {
    for (let i = 0; i < 25; i++) {
      store.updateSlowest(`test-${i}`, "file.test.ts", i, 200 + i * 10, 100);
    }

    const state = store.getSnapshot();
    expect(state.topSlowest).toHaveLength(20);
    // Should be sorted by duration descending
    expect(state.topSlowest[0]?.duration).toBeGreaterThan(state.topSlowest[19]?.duration ?? 0);
  });

  it("resets state correctly", () => {
    store.addTest("t1", "pkg", "file.test.ts");
    store.updateTest("t1", "passed", 50);

    store.reset();

    const state = store.getSnapshot();
    expect(state.testStates.size).toBe(0);
    expect(state.passed).toBe(0);
    expect(state.categoryOrder).toHaveLength(0);
  });

  it("handles test retries correctly", () => {
    store.addTest("t1", "pkg", "file.test.ts");

    // First attempt: failed
    store.updateTest("t1", "failed", 50);
    let state = store.getSnapshot();
    expect(state.failed).toBe(1);
    expect(state.passed).toBe(0);

    // Retry: passed
    store.updateTest("t1", "passed", 60);
    state = store.getSnapshot();
    expect(state.failed).toBe(0);
    expect(state.passed).toBe(1);
  });

  it("tracks noisy tests", () => {
    store.addTest("t1", "pkg", "file.test.ts");
    store.updateTest("t1", "passed", 50, undefined, true);

    const state = store.getSnapshot();
    expect(state.noisyTestIds.has("t1")).toBe(true);
  });
});
