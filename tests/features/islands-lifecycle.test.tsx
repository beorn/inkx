/**
 * <Island> + createIsland lifecycle — factory + React binding contracts.
 *
 * Unit E of `@km/silvery/15646-islands` Phase 1. Pure lifecycle tests at
 * the factory + React-binding layer — does NOT depend on the pipeline
 * render-phase blit (which lives in `pipeline/render-phase.ts` and is
 * being added in parallel by the painter teammate). The end-to-end paint
 * tests land in `islands-render.test.tsx` (painter's file).
 *
 * Coverage:
 *   1. createIsland() factory: AgNode shape, IslandNodeState slot, lifecycle
 *      transitions pending → ready
 *   2. Capability intersection (per-island override narrows guest declarations)
 *   3. Palette policy resolution (freeze default for non-palette guests,
 *      inherit default for palette guests, explicit override wins)
 *   4. dispose() idempotency + abort-controller fires
 *   5. Init failure routes to onError (when present) or throws to caller
 *   6. <Island> React binding: mount → guest.init called → handle attached
 *      → ref resolves to IslandHandle
 *   7. <Island> unmount → handle.dispose() called via useScopeEffect
 *   8. cols/rows + flex props decoupling (Unit B' contract): explicit width
 *      overrides cols for layout while guest still gets cols as initial dim
 */

import React, { useRef, type ReactElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Island, ScopeProvider } from "@silvery/ag-react"
import { createIsland } from "@silvery/ag/island"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { createScope } from "@silvery/scope"
import type {
  IslandGuest,
  IslandHandle,
  IslandModesOwner,
  IslandOutputOwner,
  IslandSignal,
  IslandSizeOwner,
} from "@silvery/ag/island-types"

// ────────────────────────────────────────────────────────────────────────────
// Test fixtures — minimal IslandGuest implementation
// ────────────────────────────────────────────────────────────────────────────

interface MockGuestOptions {
  capabilities?: IslandGuest["capabilities"]
  /** If set, `init()` rejects with this error after a microtask. */
  initError?: Error
  /** Synchronous override — if set, init returns immediately (not via Promise hop). */
  syncInit?: boolean
  /** If set, `init()` awaits this gate before resolving the handle (resize-during-init race tests). */
  deferInit?: Promise<void>
}

function mockGuest(opts: MockGuestOptions = {}) {
  let initCount = 0
  let disposeCount = 0
  let capturedHandle: IslandHandle | null = null
  const resizeRequests: Array<{ cols: number; rows: number }> = []

  const guest: IslandGuest = {
    capabilities: opts.capabilities,
    async init(ctx) {
      initCount++
      if (opts.initError) throw opts.initError
      if (opts.deferInit) await opts.deferInit

      let cols = ctx.cols
      let rows = ctx.rows

      const size: IslandSizeOwner = {
        get cols() {
          return cols
        },
        get rows() {
          return rows
        },
        subscribe: () => () => {},
        requestResize(nextCols, nextRows) {
          resizeRequests.push({ cols: nextCols, rows: nextRows })
          cols = nextCols
          rows = nextRows
        },
      }

      const buffer = createCellBuffer(ctx.cols, ctx.rows)
      const output: IslandOutputOwner = {
        buffer,
        cursor: null,
        cursorVisible: false,
        subscribe: () => () => {},
        writeCells: () => {},
        invalidateAll: () => {},
      }

      const modes: IslandModesOwner = {
        modes: opts.capabilities?.modes ? { kittyKeyboard: true } : {},
        subscribe: () => () => {},
      }

      capturedHandle = {
        size,
        output,
        modes: opts.capabilities?.modes ? modes : undefined,
        dispose() {
          disposeCount++
        },
      }
      ctx.emit({ type: "ready" })
      return capturedHandle
    },
  }

  return {
    guest,
    get initCount() {
      return initCount
    },
    get disposeCount() {
      return disposeCount
    },
    get handle() {
      return capturedHandle
    },
    resizeRequests,
  }
}

async function flushMicrotasks(): Promise<void> {
  // createIsland chains `Promise.resolve().then(init).then(handle).catch(err)`
  // — 4+ microtask hops to settle. Drain via a macrotask boundary that's
  // guaranteed to flush all pending microtasks first.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * Wrap a React tree in a Scope so `<Island>`'s `useScopeEffect` finds an
 * ancestor scope (real apps use `withScope()` at the app root; tests don't
 * spin up the full create-app pipeline, so we provide one directly).
 *
 * Returns `ReactElement` (not `ReactNode`) because the silvery test
 * `render(tree)` API requires a concrete element — `ReactNode` includes
 * `null | undefined | boolean | string` which the reconciler rejects.
 */
function withTestScope(children: ReactNode): ReactElement {
  const scope = createScope("islands-test")
  return <ScopeProvider scope={scope}>{children}</ScopeProvider>
}

// ────────────────────────────────────────────────────────────────────────────
// 1. createIsland factory
// ────────────────────────────────────────────────────────────────────────────

describe("createIsland — factory contract", () => {
  test("builds a silvery-island AgNode with IslandNodeState slot", () => {
    const m = mockGuest()
    const result = createIsland({ guest: m.guest, cols: 40, rows: 10 })
    expect(result.node.type).toBe("silvery-island")
    expect(result.node.islandState).toBeTruthy()
    expect(result.node.islandState?.lifecycle).toBe("pending") // before init resolves
    expect(result.handle).toBeNull() // not yet attached
    result.dispose()
  })

  test("lifecycle transitions pending → ready after init resolves", async () => {
    const m = mockGuest()
    const result = createIsland({ guest: m.guest, cols: 40, rows: 10 })
    await flushMicrotasks()
    expect(m.initCount).toBe(1)
    expect(result.node.islandState?.lifecycle).toBe("ready")
    expect(result.handle).toBe(m.handle)
    expect(result.handle?.size.cols).toBe(40)
    expect(result.handle?.size.rows).toBe(10)
    result.dispose()
  })

  test("dispose() is idempotent + calls handle.dispose() once", async () => {
    const m = mockGuest()
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    await flushMicrotasks()
    result.dispose()
    result.dispose()
    result.dispose()
    expect(m.disposeCount).toBe(1)
    expect(result.node.islandState?.lifecycle).toBe("disposed")
  })

  test("dispose() before init resolves aborts the controller", async () => {
    const m = mockGuest()
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    const aborted = result.node.islandState?.abortController.signal.aborted
    expect(aborted).toBe(false)
    result.dispose()
    expect(result.node.islandState?.abortController.signal.aborted).toBe(true)
    // Init still resolves; the factory tears down the handle immediately.
    await flushMicrotasks()
    expect(m.disposeCount).toBe(1) // disposed after init resolved
  })

  test("init failure routes to onError when present (no throw)", async () => {
    const err = new Error("guest boom")
    const onError = vi.fn()
    const m = mockGuest({ initError: err })
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5, onError })
    await flushMicrotasks()
    expect(onError).toHaveBeenCalledWith(err)
    expect(result.node.islandState?.lifecycle).toBe("errored")
    expect(result.node.islandState?.lastError).toBe(err)
  })

  test("init failure without onError surfaces as unhandled rejection (caller's problem)", async () => {
    const err = new Error("guest boom")
    const m = mockGuest({ initError: err })
    // We don't pass onError; the factory rethrows inside the Promise chain.
    // This is what surfaces to the surrounding silvery ErrorBoundary in the
    // React binding. Here we just verify the lifecycle state.
    const unhandled: unknown[] = []
    const handler = (e: PromiseRejectionEvent | Error) => {
      unhandled.push(e)
    }
    process.on("unhandledRejection", handler)
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    await flushMicrotasks()
    await flushMicrotasks()
    process.off("unhandledRejection", handler)
    expect(result.node.islandState?.lifecycle).toBe("errored")
    expect(result.node.islandState?.lastError).toBe(err)
  })

  test("onSignal callback fires for ready / exit", async () => {
    const onSignal = vi.fn()
    const m = mockGuest()
    createIsland({ guest: m.guest, cols: 20, rows: 5, onSignal })
    await flushMicrotasks()
    expect(onSignal).toHaveBeenCalledWith({ type: "ready" })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Capability intersection
// ────────────────────────────────────────────────────────────────────────────

describe("createIsland — capability intersection", () => {
  test("per-island override narrows guest declarations (intersection)", async () => {
    const m = mockGuest({ capabilities: { input: true, modes: true, resize: true, palette: true } })
    const result = createIsland({
      guest: m.guest,
      cols: 20,
      rows: 5,
      capabilities: { input: false, modes: true }, // narrow: drop input
    })
    await flushMicrotasks()
    expect(result.node.islandState?.capabilities).toEqual({
      // input dropped
      modes: true,
      resize: true,
      palette: true,
    })
    result.dispose()
  })

  test("guest with no declared capabilities → empty effective set", async () => {
    const m = mockGuest() // no capabilities
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    await flushMicrotasks()
    expect(result.node.islandState?.capabilities).toEqual({})
    result.dispose()
  })

  test("per-island override CANNOT add capabilities the guest didn't declare", async () => {
    const m = mockGuest() // no capabilities declared
    const result = createIsland({
      guest: m.guest,
      cols: 20,
      rows: 5,
      capabilities: { input: true, modes: true }, // user trying to add; should be ignored
    })
    await flushMicrotasks()
    expect(result.node.islandState?.capabilities).toEqual({}) // empty — guest never declared
    result.dispose()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Palette policy resolution
// ────────────────────────────────────────────────────────────────────────────

describe("createIsland — palette policy resolution", () => {
  test("default = 'freeze' when guest does NOT declare palette capability", async () => {
    const m = mockGuest() // no palette capability
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    await flushMicrotasks()
    expect(result.node.islandState?.palettePolicy).toBe("freeze")
    result.dispose()
  })

  test("default = 'inherit' when guest declares palette capability", async () => {
    const m = mockGuest({ capabilities: { palette: true } })
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5 })
    await flushMicrotasks()
    expect(result.node.islandState?.palettePolicy).toBe("inherit")
    result.dispose()
  })

  test("explicit policy override wins over default", async () => {
    const m = mockGuest()
    const result = createIsland({ guest: m.guest, cols: 20, rows: 5, palettePolicy: "inherit" })
    await flushMicrotasks()
    expect(result.node.islandState?.palettePolicy).toBe("inherit")
    result.dispose()
  })

  test("frozen palette captures hostPalette snapshot when policy='freeze'", async () => {
    const m = mockGuest()
    const hostPalette = {
      background: "#000",
      foreground: "#fff",
      ansi16: ["#111", "#222", "#333"],
    }
    const result = createIsland({
      guest: m.guest,
      cols: 20,
      rows: 5,
      palettePolicy: "freeze",
      hostPalette,
    })
    await flushMicrotasks()
    expect(result.node.islandState?.frozenPalette).toEqual(hostPalette)
    result.dispose()
  })

  test("frozen palette is null when policy='inherit'", async () => {
    const m = mockGuest()
    const hostPalette = { background: "#000", foreground: "#fff" }
    const result = createIsland({
      guest: m.guest,
      cols: 20,
      rows: 5,
      palettePolicy: "inherit",
      hostPalette,
    })
    await flushMicrotasks()
    expect(result.node.islandState?.frozenPalette).toBeNull()
    result.dispose()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. <Island> React binding — mount + unmount
// ────────────────────────────────────────────────────────────────────────────

describe("<Island> React binding — mount / unmount", () => {
  let render: ReturnType<typeof createRenderer>
  beforeEach(() => {
    render = createRenderer({ cols: 80, rows: 24 })
  })
  afterEach(() => {
    render = undefined as never
  })

  test("mount → reconciler creates silvery-island AgNode with layoutNode", async () => {
    const m = mockGuest()
    const app = render(
      withTestScope(
        <Box>
          <Island guest={m.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    // Locate the silvery-island node in the tree
    const islandHits = app.locator("silvery-island").resolveAll()
    expect(islandHits.length).toBe(1)
    const islandNode = islandHits[0]!
    expect(islandNode.type).toBe("silvery-island")
    expect(islandNode.layoutNode).toBeTruthy()
    expect(islandNode.islandState).toBeTruthy()
  })

  test("mount → guest.init called exactly once", async () => {
    const m = mockGuest()
    render(
      withTestScope(
        <Box>
          <Island guest={m.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    expect(m.initCount).toBe(1)
  })

  test("cols/rows change while init is in flight reaches the guest once the handle resolves", async () => {
    // The resize effect early-returns when the handle is not ready yet; a
    // grid change landing in that window must be replayed on handle-resolve,
    // or the guest sits at its init-time dims until the NEXT host resize
    // (the hab reattach "keeps stale dims" symptom — 20992 geometry law).
    let releaseInit: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseInit = resolve
    })
    const m = mockGuest({ deferInit: gate })
    const scope = createScope("islands-test-resize-race")
    const tree = (cols: number, rows: number): ReactElement => (
      <ScopeProvider scope={scope}>
        <Box>
          <Island guest={m.guest} cols={cols} rows={rows} />
        </Box>
      </ScopeProvider>
    )
    const app = render(tree(40, 10))
    await flushMicrotasks()
    expect(m.initCount).toBe(1)
    expect(m.handle).toBeNull() // init still gated — the race window is open

    app.rerender(tree(30, 8))
    await flushMicrotasks()

    releaseInit()
    await flushMicrotasks()
    await flushMicrotasks()

    // Two-phase protocol: the host REQUESTS the latest grid; the guest
    // acknowledges on its next paint. The request itself must not be dropped.
    expect(m.resizeRequests).toContainEqual({ cols: 30, rows: 8 })
  })

  test("ref resolves to IslandHandle after init", async () => {
    const m = mockGuest()
    const refTarget: { current: IslandHandle | null } = { current: null }
    function App() {
      const ref = useRef<IslandHandle | null>(null)
      // Mirror ref into our test-visible target on each render.
      ;(refTarget as { current: IslandHandle | null }).current = ref.current
      return (
        <Box>
          <Island
            guest={m.guest}
            cols={20}
            rows={5}
            ref={(handle) => {
              ref.current = handle
              refTarget.current = handle
            }}
          />
        </Box>
      )
    }
    const app = render(withTestScope(<App />))
    await flushMicrotasks()
    // Force a rerender so React re-evaluates useImperativeHandle with the
    // now-attached handle.
    app.rerender(withTestScope(<App />))
    await flushMicrotasks()
    // The ref resolves to AN IslandHandle (object identity may differ across
    // strict-mode dev double-renders; structural assertion is sufficient).
    expect(refTarget.current).not.toBeNull()
    expect(refTarget.current?.size.cols).toBe(20)
    expect(refTarget.current?.size.rows).toBe(5)
  })

  test("callback ref receives the handle after init WITHOUT a manual rerender (19426)", async () => {
    // Regression for @km/silvery/19426: a callback-ref consumer (e.g. silvermux
    // pane registration) does NOT force a rerender after mount. The handle must
    // still arrive on its own once `guest.init()` resolves — otherwise the ref
    // is invoked once at mount with `null` and never refreshed, and the consumer
    // has no live handle (silvermux dropped all keyboard input until pane churn).
    const m = mockGuest({ capabilities: { input: true } })
    const received: Array<IslandHandle | null> = []
    render(
      withTestScope(
        <Box>
          <Island
            guest={m.guest}
            cols={20}
            rows={5}
            ref={(handle) => {
              received.push(handle)
            }}
          />
        </Box>,
      ),
    )
    await flushMicrotasks()
    // No app.rerender() — the handle must propagate via the handle-ready
    // refresh, not a caller-driven render.
    const resolved = received.filter(Boolean).at(-1) ?? null
    expect(resolved).not.toBeNull()
    expect(resolved?.size.cols).toBe(20)
  })

  test("unmount triggers handle.dispose() via useScopeEffect", async () => {
    const m = mockGuest()
    const app = render(
      withTestScope(
        <Box>
          <Island guest={m.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    expect(m.disposeCount).toBe(0)
    // Unmount by rerendering with the island removed.
    app.rerender(withTestScope(<Box />))
    await flushMicrotasks()
    expect(m.disposeCount).toBe(1)
  })

  test("guest identity change → tears down old, spawns new", async () => {
    const m1 = mockGuest()
    const m2 = mockGuest()
    const app = render(
      withTestScope(
        <Box>
          <Island guest={m1.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    expect(m1.initCount).toBe(1)
    expect(m2.initCount).toBe(0)

    app.rerender(
      withTestScope(
        <Box>
          <Island guest={m2.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    expect(m1.disposeCount).toBe(1) // old torn down
    expect(m2.initCount).toBe(1) // new spawned
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. cols/rows + flex props decoupling (Unit B')
// ────────────────────────────────────────────────────────────────────────────

describe("<Island> — cols/rows vs flex props (Unit B' contract)", () => {
  test("cols/rows alone pin the layout slot to those dimensions", async () => {
    const m = mockGuest()
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      withTestScope(
        <Box>
          <Island guest={m.guest} cols={20} rows={5} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    const islandNode = app.locator("silvery-island").resolveAll()[0]!
    expect(islandNode.boxRect?.width).toBe(20)
    expect(islandNode.boxRect?.height).toBe(5)
  })

  test("explicit width overrides cols for layout (guest still gets cols as initial)", async () => {
    const m = mockGuest()
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      withTestScope(
        <Box>
          <Island guest={m.guest} cols={20} rows={5} width={40} height={10} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    const islandNode = app.locator("silvery-island").resolveAll()[0]!
    expect(islandNode.boxRect?.width).toBe(40) // explicit width wins
    expect(islandNode.boxRect?.height).toBe(10) // explicit height wins
    // Guest still receives cols/rows as initial dims via IslandContext.
    expect(m.handle?.size.cols).toBe(20)
    expect(m.handle?.size.rows).toBe(5)
  })

  test("flexGrow makes the island consume parent's free space", async () => {
    const m = mockGuest()
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      withTestScope(
        <Box width={60} flexDirection="row">
          <Island guest={m.guest} cols={10} rows={5} flexGrow={1} />
        </Box>,
      ),
    )
    await flushMicrotasks()
    const islandNode = app.locator("silvery-island").resolveAll()[0]!
    // flexGrow=1 in a 60-wide parent — island absorbs all 60 cells.
    expect(islandNode.boxRect?.width).toBe(60)
  })

  test("cols/rows changes request resize on the live guest handle", async () => {
    const m = mockGuest()
    const render = createRenderer({ cols: 80, rows: 24 })
    const scope = createScope("island-resize-test")
    const wrap = (cols: number, rows: number) => (
      <ScopeProvider scope={scope}>
        <Box>
          <Island guest={m.guest} cols={cols} rows={rows} />
        </Box>
      </ScopeProvider>
    )

    const app = render(wrap(20, 5))
    await flushMicrotasks()
    expect(m.handle?.size.cols).toBe(20)
    expect(m.handle?.size.rows).toBe(5)

    app.rerender(wrap(32, 7))
    await flushMicrotasks()
    expect(m.handle?.size.cols).toBe(32)
    expect(m.handle?.size.rows).toBe(7)

    await scope[Symbol.asyncDispose]()
  })
})
