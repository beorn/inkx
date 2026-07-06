import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { AgNode, Cell, Rect } from "@silvery/ag/types"
import type { CellBuffer, ViewportRect } from "@silvery/ag/viewport-types"
import type { IslandHandle, IslandMouseEvent, IslandNodeState } from "@silvery/ag/island-types"
import {
  assertIslandRenderInvariants,
  ensureIslandStrictInstrumentation,
  ISLAND_PAINT_BUDGET_CELLS,
} from "../src/strict-island"
import { resetStrictCache } from "../src/strict-mode"

// ---------------------------------------------------------------------------
// SILVERY_STRICT env harness — mirror text-trailing-clear.test.tsx: save +
// restore process.env.SILVERY_STRICT, and reset the parse cache both before
// and after so a stale cached tier can't bleed across tests.
// ---------------------------------------------------------------------------

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
  resetStrictCache()
})

afterEach(() => {
  if (prevStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = prevStrict
  resetStrictCache()
})

function strict(value: string): void {
  process.env.SILVERY_STRICT = value
  resetStrictCache()
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cell(char: string, opts: Partial<Cell> = {}): Cell {
  return { char, fg: null, bg: null, attrs: {}, wide: false, continuation: false, ...opts }
}

function buffer(cols: number, rows: number, getCell?: (c: number, r: number) => Cell): CellBuffer {
  return { cols, rows, getCell: getCell ?? (() => cell(" ")) }
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

/**
 * A fully-wired fake IslandHandle. Every owner method the strict checks touch
 * is present so `ensureIslandStrictInstrumentation` can wrap all of them and
 * `assertIslandRenderInvariants` can read through them. The subscription /
 * mouse owners record the (wrapped) listener so a test can invoke it later to
 * simulate a post-dispose or out-of-bounds callback.
 */
interface FakeHandle {
  handle: IslandHandle
  /** Invoke the latest output.subscribe listener (post-wrap). */
  fireOutput: () => void
  /** Invoke the latest input.onMouse handler (post-wrap). */
  fireMouse: (event: IslandMouseEvent) => void
  /** Records whether the underlying (user) listener/handler actually ran. */
  seen: { output: number; mouse: IslandMouseEvent[] }
}

function fakeHandle(opts: {
  size: { cols: number; rows: number }
  source?: CellBuffer
  cursor?: { row: number; col: number; style: "block" | "underline" | "bar" } | null
  cursorVisible?: boolean
}): FakeHandle {
  let outputListener: (() => void) | null = null
  let mouseHandler: ((event: IslandMouseEvent) => void) | null = null
  const seen = { output: 0, mouse: [] as IslandMouseEvent[] }

  const handle = {
    size: {
      cols: opts.size.cols,
      rows: opts.size.rows,
      subscribe: () => () => {},
      requestResize: () => {},
    },
    output: {
      buffer: opts.source ?? buffer(opts.size.cols, opts.size.rows),
      cursor: opts.cursor ?? null,
      cursorVisible: opts.cursorVisible ?? false,
      subscribe: (listener: () => void) => {
        outputListener = listener
        return () => {}
      },
      writeCells: (_rects: readonly ViewportRect[], _src: CellBuffer) => {},
      invalidateAll: () => {},
    },
    input: {
      onMouse: (handler: (event: IslandMouseEvent) => void) => {
        mouseHandler = handler
        return () => {}
      },
    },
    dispose: () => {},
  } as unknown as IslandHandle

  return {
    handle,
    fireOutput: () => outputListener?.(),
    fireMouse: (event) => mouseHandler?.(event),
    seen,
  }
}

function islandNode(state: Partial<IslandNodeState>): AgNode {
  return {
    type: "silvery-island",
    islandState: {
      lifecycle: "ready",
      abortController: new AbortController(),
      ...state,
    },
  } as unknown as AgNode
}

// ===========================================================================
// island-resize-race — guest output larger than the acknowledged size owner
// ===========================================================================

describe("island-resize-race slug", () => {
  it("fires when guest output exceeds the size-owner acknowledgement", () => {
    strict("island-resize-race")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 }, source: buffer(20, 5) })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).toThrow(
      /island-resize-race/,
    )
  })

  it("does not fire when output fits within the acknowledged size", () => {
    strict("island-resize-race")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 }, source: buffer(10, 5) })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).not.toThrow()
  })

  it("stays silent at tier 1 (slug is tier 2)", () => {
    strict("1")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 }, source: buffer(20, 5) })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).not.toThrow()
  })
})

// ===========================================================================
// island-paint-budget — one frame paints more than the per-frame cell budget
// ===========================================================================

describe("island-paint-budget slug", () => {
  it("fires when painted cells exceed the budget", () => {
    strict("island-paint-budget")
    // 300*300 = 90_000 > 65_536 budget. Size is big enough that resize-race
    // would not fire even if enabled.
    const fake = fakeHandle({ size: { cols: 400, rows: 400 }, source: buffer(300, 300) })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 300, 300))).toThrow(
      /island-paint-budget/,
    )
  })

  it("does not fire at exactly the budget", () => {
    strict("island-paint-budget")
    const side = 256 // 256*256 == 65_536 == ISLAND_PAINT_BUDGET_CELLS
    expect(side * side).toBe(ISLAND_PAINT_BUDGET_CELLS)
    const fake = fakeHandle({ size: { cols: 300, rows: 300 }, source: buffer(side, side) })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, side, side))).not.toThrow()
  })
})

// ===========================================================================
// island-grapheme-width — guest cell metadata inconsistent with measured width
// ===========================================================================

describe("island-grapheme-width slug", () => {
  it("fires on a continuation cell with no leading wide cell", () => {
    strict("island-grapheme-width")
    const src = buffer(1, 1, () => cell(" ", { continuation: true }))
    const node = islandNode({
      handle: fakeHandle({ size: { cols: 1, rows: 1 }, source: src }).handle,
    })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 1, 1))).toThrow(
      /island-grapheme-width/,
    )
  })

  it("fires on a wide grapheme missing wide+continuation metadata", () => {
    strict("island-grapheme-width")
    // "中" measures width 2 but is flagged wide=false → mismatch.
    const src = buffer(2, 1, (c) => (c === 0 ? cell("中") : cell(" ")))
    const node = islandNode({
      handle: fakeHandle({ size: { cols: 2, rows: 1 }, source: src }).handle,
    })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 2, 1))).toThrow(
      /island-grapheme-width/,
    )
  })

  it("does not fire on a correctly-encoded wide grapheme", () => {
    strict("island-grapheme-width")
    const src = buffer(2, 1, (c) =>
      c === 0 ? cell("中", { wide: true }) : cell(" ", { continuation: true }),
    )
    const node = islandNode({
      handle: fakeHandle({ size: { cols: 2, rows: 1 }, source: src }).handle,
    })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 2, 1))).not.toThrow()
  })
})

// ===========================================================================
// island-boundary-limits — guest cursor / mouse escapes the island rect
// ===========================================================================

describe("island-boundary-limits slug (cursor)", () => {
  it("fires when a visible guest cursor escapes the island rect", () => {
    strict("island-boundary-limits")
    const fake = fakeHandle({
      size: { cols: 10, rows: 5 },
      cursor: { row: 99, col: 0, style: "block" },
      cursorVisible: true,
    })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).toThrow(
      /island-boundary-limits/,
    )
  })

  it("does not fire when the cursor is within bounds", () => {
    strict("island-boundary-limits")
    const fake = fakeHandle({
      size: { cols: 10, rows: 5 },
      cursor: { row: 1, col: 1, style: "block" },
      cursorVisible: true,
    })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).not.toThrow()
  })

  it("does not fire when an out-of-bounds cursor is hidden", () => {
    strict("island-boundary-limits")
    const fake = fakeHandle({
      size: { cols: 10, rows: 5 },
      cursor: { row: 99, col: 0, style: "block" },
      cursorVisible: false,
    })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).not.toThrow()
  })
})

describe("island-boundary-limits slug (mouse)", () => {
  it("fires when a delivered mouse event escapes the island rect", () => {
    strict("island-boundary-limits")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    // Register a guest handler through the (now-wrapped) onMouse, then deliver
    // an out-of-bounds event to the wrapped handler.
    fake.handle.input?.onMouse?.(() => {})
    expect(() => fake.fireMouse({ row: 99, col: 0, button: "left" })).toThrow(
      /island-boundary-limits/,
    )
  })

  it("does not fire when the mouse event is inside the island rect", () => {
    strict("island-boundary-limits")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    let delivered: IslandMouseEvent | null = null
    fake.handle.input?.onMouse?.((event) => {
      delivered = event
    })
    expect(() => fake.fireMouse({ row: 2, col: 3, button: "left" })).not.toThrow()
    expect(delivered).toEqual({ row: 2, col: 3, button: "left" })
  })
})

// ===========================================================================
// island-paint-oob — guest dirty rect escapes the island bounds
// ===========================================================================

describe("island-paint-oob slug", () => {
  it("fires when a guest dirty rect escapes the island bounds", () => {
    strict("island-paint-oob")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    expect(() =>
      fake.handle.output.writeCells([{ col: 0, row: 0, width: 100, height: 1 }], buffer(10, 5)),
    ).toThrow(/island-paint-oob/)
  })

  it("fires on a negative / non-integer dirty rect", () => {
    strict("island-paint-oob")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    expect(() =>
      fake.handle.output.writeCells([{ col: -1, row: 0, width: 2, height: 1 }], buffer(10, 5)),
    ).toThrow(/island-paint-oob/)
  })

  it("does not fire for an in-bounds dirty rect (and forwards to the original)", () => {
    strict("island-paint-oob")
    let forwarded = false
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    // Swap the underlying writeCells for a spy BEFORE instrumentation wraps it.
    ;(fake.handle.output as { writeCells: unknown }).writeCells = () => {
      forwarded = true
    }
    const node = islandNode({ handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    expect(() =>
      fake.handle.output.writeCells([{ col: 0, row: 0, width: 5, height: 2 }], buffer(10, 5)),
    ).not.toThrow()
    expect(forwarded).toBe(true)
  })
})

// ===========================================================================
// island-dispose-leak — callback / render after the island is disposed
// ===========================================================================

describe("island-dispose-leak slug", () => {
  it("fires when a disposed island reaches the render phase", () => {
    strict("island-dispose-leak")
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle, lifecycle: "disposed" })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).toThrow(
      /island-dispose-leak/,
    )
  })

  it("fires when an output-subscription callback fires after dispose", () => {
    strict("island-dispose-leak")
    const state: Partial<IslandNodeState> = { lifecycle: "ready" }
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ ...state, handle: fake.handle })
    ensureIslandStrictInstrumentation(node)
    // Guest subscribes while live; then the island is disposed; a late
    // callback must trip the leak check.
    fake.handle.output.subscribe(() => {})
    ;(node.islandState as IslandNodeState).lifecycle = "disposed"
    expect(() => fake.fireOutput()).toThrow(/island-dispose-leak/)
  })

  it("fires when a callback fires after the abort signal aborts", () => {
    strict("island-dispose-leak")
    const controller = new AbortController()
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({
      handle: fake.handle,
      lifecycle: "ready",
      abortController: controller,
    })
    ensureIslandStrictInstrumentation(node)
    fake.handle.output.subscribe(() => {})
    controller.abort()
    expect(() => fake.fireOutput()).toThrow(/island-dispose-leak/)
  })

  it("does not fire for a live-island render or callback", () => {
    strict("island-dispose-leak")
    let ran = false
    const fake = fakeHandle({ size: { cols: 10, rows: 5 } })
    const node = islandNode({ handle: fake.handle, lifecycle: "ready" })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 10, 5))).not.toThrow()
    ensureIslandStrictInstrumentation(node)
    fake.handle.output.subscribe(() => {
      ran = true
    })
    expect(() => fake.fireOutput()).not.toThrow()
    expect(ran).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// island-host-frame (20831) — the pane-host frame contract. The Island residue
// class (20625 herdr-Island residue, 19406 swallowed same-size SIGWINCH) is a
// HOST frame that diverges from what the guest believes: the host re-framed
// the pane but the guest size-owner never acknowledged, so stale-dim paints
// blit into a different-sized rect. One frame of divergence is legal (the
// resize-ack window: "guest acknowledges via next paint"); a PERSISTENT
// divergence is the desync signature and must fail loud under STRICT.
// ---------------------------------------------------------------------------

describe("island-host-frame (20831 — pane-host frame contract)", () => {
  it("fires when the host layout persistently diverges from the size-owner (two consecutive renders)", () => {
    strict("island-host-frame")
    const fake = fakeHandle({ size: { cols: 80, rows: 24 } })
    const node = islandNode({ handle: fake.handle })
    // Frame 1: divergence tolerated — the resize-ack window.
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
    // Frame 2: still divergent — the host reframed but the guest never followed.
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).toThrow(
      /island-host-frame/,
    )
  })

  it("names both sides of the contract in the violation", () => {
    strict("island-host-frame")
    const fake = fakeHandle({ size: { cols: 80, rows: 24 } })
    const node = islandNode({ handle: fake.handle })
    assertIslandRenderInvariants(node, rect(0, 0, 100, 30))
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).toThrow(
      /100x30[\s\S]*80x24/,
    )
  })

  it("stays quiet for a one-frame transient (guest catches up on next paint)", () => {
    strict("island-host-frame")
    const fake = fakeHandle({ size: { cols: 80, rows: 24 } })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
    // Guest acknowledged: size owner now matches the host frame.
    const size = fake.handle.size as { cols: number; rows: number }
    size.cols = 100
    size.rows = 30
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
    // A later re-divergence starts a FRESH tolerance window (streak reset on match).
    size.cols = 80
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
  })

  it("a divergence to a DIFFERENT host frame restarts the tolerance window", () => {
    strict("island-host-frame")
    const fake = fakeHandle({ size: { cols: 80, rows: 24 } })
    const node = islandNode({ handle: fake.handle })
    assertIslandRenderInvariants(node, rect(0, 0, 100, 30))
    // Host frame changed AGAIN before the guest could answer — new window.
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 120, 40))).not.toThrow()
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 120, 40))).toThrow(
      /island-host-frame/,
    )
  })

  it("does nothing when the slug is off (tier 1 only)", () => {
    strict("1")
    const fake = fakeHandle({ size: { cols: 80, rows: 24 } })
    const node = islandNode({ handle: fake.handle })
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
    expect(() => assertIslandRenderInvariants(node, rect(0, 0, 100, 30))).not.toThrow()
  })
})
