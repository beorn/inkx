/**
 * withSource contract tests — the async-source → dispatch pump.
 *
 * Deterministic: no real timers. Sources are array generators (natural end)
 * or a "yield-then-block-forever" generator that can ONLY terminate if the
 * pump honours the abort — so a hang means the stop contract regressed.
 */

import { describe, expect, test, vi } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withSource } from "../src/withSource"
import type { SourcePump } from "../src/withSource"
import { fromArray } from "../src/streams"
import type { Op } from "../src/types"

/** A base whose apply records every dispatched op. */
function recordingBase(sink: Op[], onOp?: (op: Op) => void) {
  const app = createBaseApp()
  app.apply = (op: Op) => {
    sink.push(op)
    onOp?.(op)
    return false
  }
  return app
}

const tick = (n: number): Op => ({ type: "tick", n })

describe("withSource", () => {
  test("pumps every source item through toOp into dispatch", async () => {
    const dispatched: Op[] = []
    const app = withSource(fromArray([1, 2, 3]), tick)(recordingBase(dispatched))
    await app.start().done
    expect(dispatched).toEqual([tick(1), tick(2), tick(3)])
  })

  test("done resolves when the source is exhausted", async () => {
    const app = withSource(fromArray([1]), tick)(recordingBase([]))
    await expect(app.start().done).resolves.toBeUndefined()
  })

  // The "STOPS" tests use finite sources and trigger termination at a
  // deterministic item (via the apply hook), asserting the tail items are
  // never dispatched. A regressed stop contract fails as [1,2,3] (assertion),
  // never as a hang — the generator is only ever suspended at a `yield`, so
  // takeUntil's iterator.return() completes cleanly.

  test("STOPS on scope disposal (signal abort)", async () => {
    async function* three() {
      yield 1
      yield 2
      yield 3
    }
    const controller = new AbortController()
    const dispatched: Op[] = []
    // Dispose the owning scope the moment item 2 lands.
    const base = recordingBase(dispatched, (op) => {
      if (op.n === 2) controller.abort()
    })
    const app = withSource(three(), tick)(base)
    await app.start({ signal: controller.signal }).done
    expect(dispatched).toEqual([tick(1), tick(2)])
  })

  test("STOPS via [Symbol.asyncDispose]", async () => {
    async function* three() {
      yield 1
      yield 2
      yield 3
    }
    const dispatched: Op[] = []
    let pump: SourcePump
    const base = recordingBase(dispatched, (op) => {
      if (op.n === 2) void pump[Symbol.asyncDispose]()
    })
    const app = withSource(three(), tick)(base)
    pump = app.start()
    await pump.done
    expect(dispatched).toEqual([tick(1), tick(2)])
  })

  test("STOPS via stop()", async () => {
    async function* three() {
      yield 1
      yield 2
      yield 3
    }
    const dispatched: Op[] = []
    let pump: SourcePump
    const base = recordingBase(dispatched, (op) => {
      if (op.n === 2) pump.stop()
    })
    const app = withSource(three(), tick)(base)
    pump = app.start()
    await pump.done
    expect(dispatched).toEqual([tick(1), tick(2)])
  })

  test("a pre-aborted scope pumps nothing", async () => {
    const dispatched: Op[] = []
    const app = withSource(fromArray([1, 2, 3]), tick)(recordingBase(dispatched))
    const controller = new AbortController()
    controller.abort()
    await app.start({ signal: controller.signal }).done
    expect(dispatched).toEqual([])
  })

  test("a per-item dispatch error is logged and skipped (pump survives)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const dispatched: Op[] = []
    const base = recordingBase(dispatched, (op) => {
      if (op.n === 2) throw new Error("boom")
    })
    const app = withSource(fromArray([1, 2, 3]), tick)(base)
    await app.start().done
    // Item 2 threw and was recorded before throwing; the pump continued to 3.
    expect(dispatched.map((o) => o.n)).toEqual([1, 2, 3])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
