/**
 * createSuspenseLoader — synchronous first-read contract.
 *
 * Regression test for the "show results immediately don't require typing"
 * picker bug (user dogfood 2026-04-15). Previously `load()` was deferred
 * via setTimeout(0) in production, so every picker open rendered a
 * Suspense fallback for a frame before the synchronous loader actually
 * ran. Users read that flash as "nothing until I type".
 *
 * The fix: first read runs load() synchronously. This test pins the
 * behavior so it can't regress.
 */
import { describe, expect, it } from "vitest"
import { createSuspenseLoader } from "../src/hooks/use-suspense-loader.ts"

describe("createSuspenseLoader — synchronous first-read", () => {
  it("runs load() synchronously on first read and caches the result", () => {
    let loadCount = 0
    const loader = createSuspenseLoader(() => {
      loadCount++
      return { items: ["a", "b", "c"] }
    })
    // Before first read, status is idle, load has not run
    expect(loader.status).toBe("idle")
    expect(loadCount).toBe(0)

    // First read — synchronous, returns the value, load runs exactly once
    const first = loader.read()
    expect(first).toEqual({ items: ["a", "b", "c"] })
    expect(loader.status).toBe("resolved")
    expect(loadCount).toBe(1)

    // Subsequent reads are cached — no re-invocation
    const second = loader.read()
    expect(second).toBe(first)
    expect(loadCount).toBe(1)
  })

  it("captures thrown errors and rethrows on subsequent reads", () => {
    const error = new Error("boom")
    const loader = createSuspenseLoader(() => {
      throw error
    })
    expect(() => loader.read()).toThrow("boom")
    expect(loader.status).toBe("error")
    // Second read rethrows the same error (not a new load attempt)
    expect(() => loader.read()).toThrow("boom")
  })

  it("does not throw a Promise (no Suspense fallback needed)", () => {
    // The Suspense protocol says "throw a promise if pending". Our loader
    // is always sync now, so it never throws a promise. Callers wrapped in
    // <React.Suspense> still work but the fallback never renders because
    // the read resolves immediately.
    const loader = createSuspenseLoader(() => 42)
    try {
      loader.read()
    } catch (e) {
      // If we get here and the thrown value is a Promise, the regression
      // is back — the test should fail loudly.
      if (e instanceof Promise) {
        throw new Error("createSuspenseLoader threw a Promise — deferred load regression")
      }
      throw e
    }
    // If we got here without throwing, the sync path worked.
    expect(loader.status).toBe("resolved")
  })
})
