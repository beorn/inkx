import { describe, test, expect } from "bun:test"
import { runGenerator, runWithProgress } from "../src/service.ts"

describe("runGenerator", () => {
  test("runs generator to completion and returns final value", () => {
    function* countdown(): Generator<number, string, unknown> {
      yield 3
      yield 2
      yield 1
      return "done"
    }

    const result = runGenerator(countdown())
    expect(result).toBe("done")
  })

  test("handles generator with no yields", () => {
    function* immediate(): Generator<never, number, unknown> {
      return 42
    }

    const result = runGenerator(immediate())
    expect(result).toBe(42)
  })
})

describe("runWithProgress", () => {
  test("calls progress callback for each yield", () => {
    function* countdown(): Generator<number, string, unknown> {
      yield 3
      yield 2
      yield 1
      return "done"
    }

    const progress: number[] = []
    const result = runWithProgress(countdown(), (p) => {
      progress.push(p)
    })

    expect(result).toBe("done")
    expect(progress).toEqual([3, 2, 1])
  })

  test("handles generator with no yields", () => {
    function* immediate(): Generator<never, number, unknown> {
      return 42
    }

    const progress: never[] = []
    const result = runWithProgress(immediate(), (p) => {
      progress.push(p)
    })

    expect(result).toBe(42)
    expect(progress).toEqual([])
  })

  test("works with structured progress info", () => {
    interface ProgressInfo {
      phase: string
      current: number
      total: number
    }

    function* loadVault(): Generator<ProgressInfo, { name: string }, unknown> {
      yield { phase: "discover", current: 0, total: 10 }
      yield { phase: "discover", current: 10, total: 10 }
      yield { phase: "parse", current: 5, total: 10 }
      yield { phase: "parse", current: 10, total: 10 }
      return { name: "test-vault" }
    }

    const progress: ProgressInfo[] = []
    const result = runWithProgress(loadVault(), (p) => {
      progress.push(p)
    })

    expect(result).toEqual({ name: "test-vault" })
    expect(progress).toHaveLength(4)
    expect(progress[0]).toEqual({ phase: "discover", current: 0, total: 10 })
    expect(progress[3]).toEqual({ phase: "parse", current: 10, total: 10 })
  })
})
