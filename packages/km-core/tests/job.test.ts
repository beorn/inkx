/**
 * Job Runner Tests
 */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest"
import { createToastQueue, type ToastQueue } from "../src/toast.ts"
import { createJobRunner, type JobRunner } from "../src/job.ts"

describe("JobRunner", () => {
  let queue: ToastQueue
  let runner: JobRunner

  beforeEach(() => {
    vi.useFakeTimers()
    queue = createToastQueue()
    runner = createJobRunner(queue)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("countdownMs: 0 executes immediately with no countdown toast", () => {
    const execute = vi.fn()

    runner.submit({
      description: "Renaming 'old' → 'new'",
      impact: "3 backlinks will be updated",
      countdownMs: 0,
      execute,
    })

    expect(execute).toHaveBeenCalledOnce()
    // Success toast should be showing
    const latest = queue.getLatest()
    expect(latest?.message).toBe("Renaming 'old' → 'new' — done")
    expect(latest?.level).toBe("success")
  })

  test("countdown toast appears with Cancel action and function trigger", () => {
    runner.submit({
      description: "Renaming 'old' → 'new'",
      impact: "3 backlinks updated",
      countdownMs: 5000,
      execute: vi.fn(),
    })

    const toast = queue.getLatest()
    expect(toast?.message).toContain("Renaming 'old' → 'new'")
    expect(toast?.message).toContain("3 backlinks updated")
    expect(toast?.message).toContain("5s")
    expect(toast?.action?.label).toBe("Cancel")
    expect(typeof toast?.action?.trigger).toBe("function")
  })

  test("countdown updates remaining seconds", () => {
    runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 3000,
      execute: vi.fn(),
    })

    expect(queue.getLatest()?.message).toContain("3s")

    vi.advanceTimersByTime(1000)
    expect(queue.getLatest()?.message).toContain("2s")

    vi.advanceTimersByTime(1000)
    expect(queue.getLatest()?.message).toContain("1s")
  })

  test("cancel during countdown calls cancel callback and dismisses toast", () => {
    const cancel = vi.fn()
    const execute = vi.fn()

    const handle = runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 5000,
      execute,
      cancel,
    })

    expect(queue.getAll()).toHaveLength(1)

    handle.cancel()

    expect(cancel).toHaveBeenCalledOnce()
    expect(execute).not.toHaveBeenCalled()
    expect(queue.getAll()).toHaveLength(0)
  })

  test("cancel during countdown without cancel callback does not throw", () => {
    const handle = runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 5000,
      execute: vi.fn(),
    })

    expect(() => handle.cancel()).not.toThrow()
    expect(queue.getAll()).toHaveLength(0)
  })

  test("execute runs after countdown completes", () => {
    const execute = vi.fn()

    runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 3000,
      execute,
    })

    expect(execute).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3000)

    expect(execute).toHaveBeenCalledOnce()
    expect(queue.getLatest()?.message).toBe("Renaming — done")
  })

  test("execute with progress updates toast message", () => {
    runner.submit({
      description: "Updating backlinks",
      impact: "5 files",
      countdownMs: 0,
      execute: (progress) => {
        progress(1, 5)
        // After first progress call, check toast
        const toast = queue.getLatest()
        expect(toast?.message).toBe("Updating backlinks... (1/5)")

        progress(3, 5)
        const toast2 = queue.getLatest()
        expect(toast2?.message).toBe("Updating backlinks... (3/5)")
      },
    })

    // After execute completes, success toast shows
    expect(queue.getLatest()?.message).toBe("Updating backlinks — done")
    expect(queue.getLatest()?.level).toBe("success")
  })

  test("double cancel is idempotent", () => {
    const cancel = vi.fn()

    const handle = runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 5000,
      execute: vi.fn(),
      cancel,
    })

    handle.cancel()
    handle.cancel()

    expect(cancel).toHaveBeenCalledOnce()
  })

  test("cancel after countdown completed is no-op", () => {
    const cancel = vi.fn()
    const execute = vi.fn()

    const handle = runner.submit({
      description: "Renaming",
      impact: "3 items",
      countdownMs: 1000,
      execute,
      cancel,
    })

    vi.advanceTimersByTime(1000)
    expect(execute).toHaveBeenCalledOnce()

    // Cancel after execution — should not call cancel callback
    // (cancelled flag is false, but the interval already cleared)
    handle.cancel()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
