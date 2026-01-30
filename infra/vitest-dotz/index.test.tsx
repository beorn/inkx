/**
 * DotzReporter Acceptance Tests
 *
 * Spec-level tests verifying the reporter renders correct output for various scenarios.
 * Uses inkx test renderer directly - no helpers needed.
 */

import { describe, it, expect, beforeEach } from "vitest"
import React from "react"
import { createTestRenderer } from "inkx/testing"

import {
  Report,
  DEFAULT_SYMBOLS,
  durationToSymbol,
  fmtDuration,
  fmtMs,
  type Options,
} from "./index.tsx"
import { createTestStore, type TestStore } from "./store.js"

const render = createTestRenderer({ columns: 100, rows: 50 })

function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    slowThreshold: 100,
    perfOutput: "",
    showSlow: true,
    symbols: DEFAULT_SYMBOLS,
    ...overrides,
  }
}

// =============================================================================
// Acceptance Tests: Report Rendering
// =============================================================================

describe("Report", () => {
  let store: TestStore
  let options: Options

  beforeEach(() => {
    store = createTestStore(100)
    options = createOptions()
  })

  describe("empty state", () => {
    it("shows legend and zero tests", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("Legend:")
      expect(app.text).toContain("fast")
      expect(app.text).toContain("slow")
      expect(app.text).toContain("fail")
      expect(app.text).toContain("skip")
      expect(app.text).toContain("Tests")
      expect(app.text).toContain("(0)")
    })

    it("does not show package table with single category", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).not.toContain("PACKAGE")
    })
  })

  describe("passing tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.addTest("test-2", "pkg-a", "file1.test.ts")
      store.addTest("test-3", "pkg-a", "file2.test.ts")
      store.updateTest("test-1", "passed", 10)
      store.updateTest("test-2", "passed", 50)
      store.updateTest("test-3", "passed", 200)
    })

    it("shows passing count in summary", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("3 passed")
      expect(app.text).toContain("(3)")
    })

    it("shows package name in dots section", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("pkg-a")
    })

    it("shows slow tests section for tests exceeding 2x threshold", () => {
      store.updateSlowest("slow test", "file2.test.ts", 10, 200, 100)
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("SLOW TESTS")
      expect(app.text).toContain("slow test")
    })
  })

  describe("failing tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.addTest("test-2", "pkg-a", "file1.test.ts")
      store.updateTest("test-1", "passed", 10)
      store.updateTest("test-2", "failed", 15, [
        { message: "Expected true to be false" },
      ])
    })

    it("shows failure count and details", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("1 failed")
      expect(app.text).toContain("1 passed")
      expect(app.text).toContain("FAILURES")
      expect(app.text).toContain("Expected true to be false")
    })
  })

  describe("skipped tests", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.addTest("test-2", "pkg-a", "file1.test.ts")
      store.updateTest("test-1", "passed", 10)
      store.updateTest("test-2", "skipped", 0)
    })

    it("shows skipped count in summary", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("1 skipped")
      expect(app.text).toContain("1 passed")
    })
  })

  describe("multiple packages", () => {
    beforeEach(() => {
      store.addTest("a-1", "package-a", "a1.test.ts")
      store.addTest("a-2", "package-a", "a2.test.ts")
      store.addTest("b-1", "package-b", "b1.test.ts")
      store.updateTest("a-1", "passed", 10)
      store.updateTest("a-2", "failed", 30, [{ message: "error" }])
      store.updateTest("b-1", "passed", 15)
    })

    it("shows package table with stats", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("PACKAGE")
      expect(app.text).toContain("TESTS")
      expect(app.text).toContain("TIME")
      expect(app.text).toContain("package-a")
      expect(app.text).toContain("package-b")
    })
  })

  describe("slow tests display", () => {
    beforeEach(() => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.updateTest("test-1", "passed", 500)
      store.updateSlowest("very slow test", "file1.test.ts", 42, 500, 100)
    })

    it("shows slow test with file location", () => {
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).toContain("SLOW TESTS")
      expect(app.text).toContain("very slow test")
      expect(app.text).toContain("file1.test.ts:42")
    })

    it("hides slow tests when showSlow is false", () => {
      options.showSlow = false
      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.text).not.toContain("SLOW TESTS")
    })
  })

  describe("locator queries", () => {
    it("can query sections by id", () => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.updateTest("test-1", "passed", 10)

      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.locator("#report").count()).toBe(1)
      expect(app.locator("#dots").count()).toBe(1)
      expect(app.locator("#summary").count()).toBe(1)
    })

    it("can query summary content", () => {
      store.addTest("test-1", "pkg-a", "file1.test.ts")
      store.updateTest("test-1", "passed", 10)

      const app = render(<Report store={store} options={options} width={100} />)

      expect(app.locator("#summary").textContent()).toContain("1 passed")
    })
  })
})

// =============================================================================
// Unit Tests: Pure Functions
// =============================================================================

describe("durationToSymbol", () => {
  const symbols = DEFAULT_SYMBOLS
  const threshold = 100

  it("maps duration to correct symbol", () => {
    expect(durationToSymbol(0, threshold, symbols).char).toBe("·")
    expect(durationToSymbol(400, threshold, symbols).char).toBe("•")
    expect(durationToSymbol(800, threshold, symbols).char).toBe("●")
  })

  it("marks tests exceeding max duration as bright", () => {
    const result = durationToSymbol(1500, threshold, symbols)
    expect(result.char).toBe("●")
    expect(result.bright).toBe(true)
  })
})

describe("fmtDuration", () => {
  it("formats milliseconds, seconds, and minutes", () => {
    expect(fmtDuration(50)).toBe("50ms")
    expect(fmtDuration(1500)).toBe("1.50s")
    expect(fmtDuration(90000)).toBe("1m 30s")
  })
})

describe("fmtMs", () => {
  it("formats milliseconds and seconds", () => {
    expect(fmtMs(50)).toBe("50ms")
    expect(fmtMs(2500)).toBe("2.5s")
  })
})

// =============================================================================
// Integration Tests: Store
// =============================================================================

describe("store integration", () => {
  let store: TestStore

  beforeEach(() => {
    store = createTestStore(100)
  })

  it("tracks test lifecycle correctly", () => {
    store.addTest("t1", "pkg", "file.test.ts")
    store.addTest("t2", "pkg", "file.test.ts")

    expect(store.getSnapshot().testStates.get("t1")).toBe("pending")

    store.updateTest("t1", "passed", 50)
    store.updateTest("t2", "failed", 100, [{ message: "oops" }])

    const state = store.getSnapshot()
    expect(state.passed).toBe(1)
    expect(state.failed).toBe(1)
    expect(state.testErrors.get("t2")?.errors[0]?.message).toBe("oops")
  })

  it("handles test retries by adjusting counters", () => {
    store.addTest("t1", "pkg", "file.test.ts")

    store.updateTest("t1", "failed", 50)
    expect(store.getSnapshot().failed).toBe(1)

    store.updateTest("t1", "passed", 60)
    const state = store.getSnapshot()
    expect(state.failed).toBe(0)
    expect(state.passed).toBe(1)
  })

  it("tracks slowest tests sorted by duration", () => {
    for (let i = 0; i < 25; i++) {
      store.updateSlowest(`test-${i}`, "file.test.ts", i, 200 + i * 10, 100)
    }

    const state = store.getSnapshot()
    expect(state.topSlowest).toHaveLength(20)
    expect(state.topSlowest[0]?.duration).toBeGreaterThan(
      state.topSlowest[19]?.duration ?? 0,
    )
  })
})
