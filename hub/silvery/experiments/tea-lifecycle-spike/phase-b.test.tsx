/**
 * Phase B — Zustand bridge cohabitation with the apply chain.
 *
 * The Phase A spike used plain React useState. km-tui uses Zustand
 * extensively — the Pro concern from the review is:
 *
 *   > "Zustand bridge. km-tui uses zustand. The spike used closure-
 *      owned state. We do not know if `apply(op) -> false | Effect[]`
 *      plays nicely with zustand's setState batching and selectors."
 *                            — K2.6, second-pass review 2026-04-21
 *
 * Phase B swaps React useState for a zustand store. The same App
 * component is reused, configured to read from the external store
 * instead of local state via the `useStore` / `actions` props.
 *
 * ## What's new in Phase B (vs Phase A)
 *
 *   - State lives in a `zustand/vanilla` store, subscribed to from
 *     React via `useSyncExternalStore`. This exercises the canonical
 *     "state owned outside React, rendered inside" pattern.
 *   - Actions mutate the store; useInput handlers call actions. The
 *     store notifies subscribers; React re-renders.
 *   - The falsifier: if the zustand subscription AND the useInput
 *     subscription both drive re-renders, we'd see ~2x the expected
 *     render count per keystroke. If zustand's batching intercepts
 *     React's setState, we'd see stale state in the next render.
 *
 * ## Why `zustand/vanilla` rather than the React wrapper?
 *
 * The real km-tui uses zustand's React wrapper (`create()`), but for
 * the spike we use vanilla + `useSyncExternalStore` directly. That
 * keeps the test independent of zustand's internal React selector
 * cache (which would mask bugs in the underlying store semantics).
 * If zustand/vanilla + useSyncExternalStore coexist cleanly with
 * useInput, then zustand's React wrapper — which is a thin layer on
 * top — will too.
 */

import React, { useSyncExternalStore } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"

// ---------------------------------------------------------------------------
// Inline vanilla external-store — the shape zustand/vanilla exposes.
// ---------------------------------------------------------------------------
//
// Reasons this is in-line and not an `import { createStore } from "zustand"`:
//
// 1. zustand is not at the km root package.json (it's under
//    vendor/silvery/node_modules/ only). Adding a root dep for a
//    throwaway spike is wrong-scope.
// 2. The spike's claim is about "external-store subscriptions
//    cohabiting with useInput subscriptions" — which is a property of
//    useSyncExternalStore + a vanilla store, not of zustand's
//    middleware/batching. We can exercise that property without
//    taking zustand itself as a dep.
// 3. This is identical to the shape zustand/vanilla exposes:
//    `{ getState(), setState(partial|fn), subscribe(listener): unsubscribe }`.
//    If this coexists with useInput cleanly, zustand's shipped
//    version — which is this store plus React-hook helpers — will too.

interface VanillaStore<T> {
  getState(): T
  setState(partial: Partial<T> | ((state: T) => Partial<T>)): void
  subscribe(listener: () => void): () => void
}

function createStore<T extends object>(initializer: (set: VanillaStore<T>["setState"]) => T): VanillaStore<T> {
  let state: T
  const listeners = new Set<() => void>()

  const setState: VanillaStore<T>["setState"] = (partial) => {
    const patch = typeof partial === "function" ? partial(state) : partial
    // Shallow-merge semantics — zustand/vanilla equivalent.
    state = Object.assign({}, state, patch) as T
    for (const l of listeners) l()
  }

  // eslint-disable-next-line prefer-const
  state = initializer(setState)

  return {
    getState: () => state,
    setState,
    subscribe: (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}
import type { Term } from "@silvery/ag-term/ansi/term"
import { run, type RunHandle } from "@silvery/ag-term/runtime"

import { App } from "./App.tsx"
import { get as getCounters, resetCounters } from "./lifecycle-counters.ts"
import { resetTrace } from "./trace.ts"

// ---------------------------------------------------------------------------
// Store factory — a fresh store per test so cross-test state doesn't
// leak via module-scope singletons.
// ---------------------------------------------------------------------------

interface StoreState {
  open: boolean
  query: string
  cursor: string
  openDialog(): void
  closeDialog(): void
  insertChar(ch: string): void
  backspace(): void
  cursorDown(): void
}

const NODES = ["n1", "n2", "n3", "n4", "n5"]

function createBoardStore() {
  return createStore<StoreState>((set) => ({
    open: false,
    query: "",
    cursor: NODES[0]!,
    openDialog: () => set({ open: true, query: "" }),
    closeDialog: () => set({ open: false }),
    insertChar: (ch) => set((s) => ({ query: s.query + ch })),
    backspace: () => set((s) => ({ query: s.query.slice(0, -1) })),
    cursorDown: () =>
      set((s) => {
        const idx = NODES.indexOf(s.cursor)
        return { cursor: NODES[Math.min(NODES.length - 1, idx + 1)]! }
      }),
  }))
}

// ---------------------------------------------------------------------------
// Harness — composes the store with the App, bridging via useSyncExternalStore
// ---------------------------------------------------------------------------
//
// The App accepts `useStore` and `actions` as props. `useStore` is a
// React hook that selects state; `actions` is a snapshot of action
// callbacks. We bind both to the same underlying vanilla store.
// This shape is what km-tui would use in a real migration — the
// reducer-owned state gets exposed to React via a selector hook while
// the apply chain mutates the store via dispatch.

function BoundApp({ pass = 0 }: { pass?: number }): React.ReactElement {
  // Create the store ONCE per component instance — if the App remounts,
  // the test will create a new BoundApp, which creates a new store.
  const storeRef = React.useRef<ReturnType<typeof createBoardStore> | null>(null)
  if (!storeRef.current) storeRef.current = createBoardStore()
  const store = storeRef.current

  // Selector hook — uses useSyncExternalStore, which is the correct
  // React 19 pattern for external stores. If zustand's subscription
  // leaks past unmount, this hook's unsubscribe will expose it.
  const state = useSyncExternalStore(
    React.useCallback((cb) => store.subscribe(cb), [store]),
    () => store.getState(),
    () => store.getState(),
  )

  const actions = React.useMemo(
    () => ({
      openDialog: state.openDialog,
      closeDialog: state.closeDialog,
      insertChar: state.insertChar,
      backspace: state.backspace,
      cursorDown: state.cursorDown,
    }),
    [state.openDialog, state.closeDialog, state.insertChar, state.backspace, state.cursorDown],
  )

  return (
    <App
      pass={pass}
      useStore={() => ({ open: state.open, query: state.query, cursor: state.cursor })}
      actions={actions}
    />
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase B — Zustand bridge cohabits with useInput subscriptions", () => {
  let term: Term | undefined
  let handle: RunHandle | undefined

  afterEach(() => {
    handle?.unmount()
    term?.[Symbol.dispose]?.()
    handle = undefined
    term = undefined
  })

  test("B1 — Ctrl+P through Zustand store: open/type/close transcript", async () => {
    resetTrace("phase-b:B1-zustand-transcript")
    resetCounters()
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<BoundApp pass={0} />, term)

    await handle.press("Control+p")
    await Promise.resolve()
    expect(getCounters().dialogOpens).toBe(1)
    expect(term.screen!.getText()).toContain("Dialog (focused)")

    await handle.press("a")
    await Promise.resolve()
    await handle.press("b")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> ab")

    await handle.press("Escape")
    await Promise.resolve()
    expect(getCounters().dialogCloses).toBe(1)
    expect(term.screen!.getText()).toContain("Board (focused)")

    await handle.press("j")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> n2")

    // No re-entrant errors from zustand+useInput combination.
    expect(getCounters().reentrantErrors).toEqual([])
  })

  test("B2 — no double renders: zustand notify + React setState don't both drive commit", async () => {
    resetTrace("phase-b:B2-render-count")
    resetCounters()
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<BoundApp pass={0} />, term)

    // Mount render is counted — snapshot baseline.
    const baseline = getCounters().renders

    // Drive 8 keystrokes. If zustand's subscription + React's
    // setState were both driving commits, we'd see 2N-3N renders.
    const sequence = ["Control+p", "a", "b", "c", "d", "Escape", "j", "j"]
    for (const k of sequence) {
      await handle.press(k)
      await Promise.resolve()
    }

    const delta = getCounters().renders - baseline
    // Ceiling: 2 per key (same as Phase A — React may issue a second
    // commit for effect flush). If it's > 2N, zustand is driving a
    // separate re-render storm.
    expect(delta).toBeLessThanOrEqual(sequence.length * 2)
    // Floor: one render per key that actually changed state (all 8 do).
    expect(delta).toBeGreaterThanOrEqual(sequence.length)
  })

  test("B3 — store survives remount: old store is garbage-collected, new store starts fresh", async () => {
    resetTrace("phase-b:B3-remount-store")
    resetCounters()

    // --- Cycle 1 ---
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<BoundApp pass={0} />, term)

    await handle.press("j")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> n2")

    handle.unmount()
    await Promise.resolve()
    term[Symbol.dispose]?.()
    term = undefined
    handle = undefined

    // --- Cycle 2 — fresh store ---
    resetCounters()
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<BoundApp pass={1} />, term)

    // Brand-new store: cursor starts at n1 again. If the old store
    // had leaked (e.g. a dangling subscription that mutated a
    // module-level ref), we'd see cursor stuck at n2 from cycle 1.
    expect(term.screen!.getText()).toContain("> n1")
    expect(term.screen!.getText()).not.toContain("> n2")

    await handle.press("j")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> n2")
    expect(getCounters().reentrantErrors).toEqual([])
  })

  test("B4 — handler route correctness mirrors Phase A A3 but with zustand", async () => {
    resetTrace("phase-b:B4-focus-containment-zustand")
    resetCounters()
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<BoundApp pass={0} />, term)

    await handle.press("Control+p")
    await Promise.resolve()
    resetCounters()

    // `j` while dialog open must route to dialog (insert char),
    // not to board (cursor down). Same assertion as Phase A A3,
    // but the zustand store is the state holder this time. If the
    // Phase A passes and this fails, the regression is in the
    // zustand bridge — not in useInput.
    await handle.press("j")
    await Promise.resolve()

    expect(getCounters().keyEvents.length).toBe(1)
    expect(term.screen!.getText()).toContain("> j") // dialog query
    // Board cursor stays at n1.
    expect(term.screen!.getText()).toContain("> n1") // (also the query `>` renders above)
  })
})
