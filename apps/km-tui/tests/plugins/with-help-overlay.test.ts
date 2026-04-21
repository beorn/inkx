/**
 * Pure-reducer tests for the withHelpOverlay plugin.
 *
 * These tests exercise the TEA apply(op, state) → [state, effects]
 * reducer in isolation — no React, no app, no commands. Pure input /
 * output verification of the reducer semantics.
 *
 * Integration tests that drive the reducer through the command system
 * and check the actual rendered dialog live in `help-mini-cutover.spec.ts`.
 */
import { describe, expect, test } from "vitest"
import { apply, createHelpStore, isTeaHelpEnabled, type HelpState } from "../../src/plugins/with-help-overlay.ts"

const INITIAL: HelpState = { visible: false, scrollOffset: 0 }

describe("withHelpOverlay — apply() reducer", () => {
  describe("help.show", () => {
    test("hidden → visible with offset reset", () => {
      const [next, effects] = apply({ type: "help.show" }, INITIAL)
      expect(next).toEqual({ visible: true, scrollOffset: 0 })
      expect(effects).toEqual([])
    })

    test("hidden → visible resets offset even if it was nonzero (parity with legacy SHOW_HELP)", () => {
      const state: HelpState = { visible: false, scrollOffset: 42 }
      const [next] = apply({ type: "help.show" }, state)
      expect(next).toEqual({ visible: true, scrollOffset: 0 })
    })

    test("visible → visible is identity (no-op, same ref)", () => {
      const state: HelpState = { visible: true, scrollOffset: 7 }
      const [next] = apply({ type: "help.show" }, state)
      expect(next).toBe(state) // same ref — useSyncExternalStore won't commit
    })
  })

  describe("help.hide", () => {
    test("visible → hidden resets offset", () => {
      const state: HelpState = { visible: true, scrollOffset: 5 }
      const [next] = apply({ type: "help.hide" }, state)
      expect(next).toEqual({ visible: false, scrollOffset: 0 })
    })

    test("hidden → hidden is identity", () => {
      const [next] = apply({ type: "help.hide" }, INITIAL)
      expect(next).toBe(INITIAL)
    })
  })

  describe("help.toggle", () => {
    test("hidden → visible", () => {
      const [next] = apply({ type: "help.toggle" }, INITIAL)
      expect(next.visible).toBe(true)
      expect(next.scrollOffset).toBe(0)
    })

    test("visible → hidden", () => {
      const [next] = apply({ type: "help.toggle" }, { visible: true, scrollOffset: 3 })
      expect(next.visible).toBe(false)
      expect(next.scrollOffset).toBe(0)
    })
  })

  describe("help.scrollUp", () => {
    test("visible: decrements offset", () => {
      const [next] = apply({ type: "help.scrollUp" }, { visible: true, scrollOffset: 3 })
      expect(next).toEqual({ visible: true, scrollOffset: 2 })
    })

    test("visible: clamps at 0 (never goes negative)", () => {
      const [next] = apply({ type: "help.scrollUp" }, { visible: true, scrollOffset: 0 })
      expect(next).toEqual({ visible: true, scrollOffset: 0 })
    })

    test("hidden: no-op (offset unchanged even if nonzero)", () => {
      const state: HelpState = { visible: false, scrollOffset: 5 }
      const [next] = apply({ type: "help.scrollUp" }, state)
      expect(next).toBe(state)
    })
  })

  describe("help.scrollDown", () => {
    test("visible: increments offset", () => {
      const [next] = apply({ type: "help.scrollDown" }, { visible: true, scrollOffset: 0 })
      expect(next).toEqual({ visible: true, scrollOffset: 1 })
    })

    test("visible: unbounded (ceiling is enforced by the view, not the reducer)", () => {
      const [next] = apply({ type: "help.scrollDown" }, { visible: true, scrollOffset: 9999 })
      expect(next).toEqual({ visible: true, scrollOffset: 10000 })
    })

    test("hidden: no-op", () => {
      const state: HelpState = { visible: false, scrollOffset: 0 }
      const [next] = apply({ type: "help.scrollDown" }, state)
      expect(next).toBe(state)
    })
  })

  describe("sequencing — full open/scroll/close cycle", () => {
    test("open → scrollDown × 3 → scrollUp → close", () => {
      let s = INITIAL
      ;[s] = apply({ type: "help.show" }, s)
      expect(s).toEqual({ visible: true, scrollOffset: 0 })
      ;[s] = apply({ type: "help.scrollDown" }, s)
      ;[s] = apply({ type: "help.scrollDown" }, s)
      ;[s] = apply({ type: "help.scrollDown" }, s)
      expect(s).toEqual({ visible: true, scrollOffset: 3 })
      ;[s] = apply({ type: "help.scrollUp" }, s)
      expect(s).toEqual({ visible: true, scrollOffset: 2 })
      ;[s] = apply({ type: "help.hide" }, s)
      expect(s).toEqual({ visible: false, scrollOffset: 0 })
    })

    test("reopen after scroll restores to fresh state (matches legacy: SHOW_HELP zeros offset)", () => {
      let s = INITIAL
      ;[s] = apply({ type: "help.show" }, s)
      ;[s] = apply({ type: "help.scrollDown" }, s)
      ;[s] = apply({ type: "help.scrollDown" }, s)
      ;[s] = apply({ type: "help.hide" }, s)
      ;[s] = apply({ type: "help.show" }, s)
      expect(s).toEqual({ visible: true, scrollOffset: 0 })
    })
  })

  describe("no effects produced — Phase 0 invariant", () => {
    test("every op returns empty effects array", () => {
      const ops = [
        { type: "help.show" as const },
        { type: "help.hide" as const },
        { type: "help.toggle" as const },
        { type: "help.scrollUp" as const },
        { type: "help.scrollDown" as const },
      ]
      for (const op of ops) {
        const [, effects] = apply(op, { visible: true, scrollOffset: 3 })
        expect(effects).toEqual([])
      }
    })
  })
})

describe("withHelpOverlay — createHelpStore()", () => {
  test("dispatch mutates state and notifies subscribers", () => {
    const store = createHelpStore()
    const snapshots: boolean[] = []
    const unsub = store.subscribe(() => snapshots.push(store.getState().visible))

    store.dispatch({ type: "help.show" })
    store.dispatch({ type: "help.scrollDown" })
    store.dispatch({ type: "help.hide" })
    unsub()

    expect(snapshots).toEqual([true, true, false])
  })

  test("no-op dispatch does NOT notify subscribers (prevents render storms)", () => {
    const store = createHelpStore()
    let count = 0
    const unsub = store.subscribe(() => count++)

    // Already hidden, hide again — pure no-op.
    store.dispatch({ type: "help.hide" })
    // scrollUp while hidden — no-op.
    store.dispatch({ type: "help.scrollUp" })
    // scrollDown while hidden — no-op.
    store.dispatch({ type: "help.scrollDown" })

    unsub()
    expect(count).toBe(0)
  })

  test("subscribe returns unsubscribe that stops further notifications", () => {
    const store = createHelpStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    store.dispatch({ type: "help.show" })
    expect(count).toBe(1)
    unsub()
    store.dispatch({ type: "help.scrollDown" })
    expect(count).toBe(1) // still 1 — unsubscribed
  })

  test("reset() restores initial state and notifies", () => {
    const store = createHelpStore()
    store.dispatch({ type: "help.show" })
    store.dispatch({ type: "help.scrollDown" })
    expect(store.getState()).toEqual({ visible: true, scrollOffset: 1 })

    let notified = false
    const unsub = store.subscribe(() => {
      notified = true
    })
    store.reset()
    unsub()

    expect(store.getState()).toEqual({ visible: false, scrollOffset: 0 })
    expect(notified).toBe(true)
  })

  test("getState returns a stable ref when dispatch is a no-op", () => {
    // Critical for useSyncExternalStore: identical getSnapshot() return
    // values must be === to prevent re-render.
    const store = createHelpStore()
    const ref1 = store.getState()
    store.dispatch({ type: "help.hide" }) // no-op
    const ref2 = store.getState()
    expect(ref2).toBe(ref1)
  })
})

describe("withHelpOverlay — isTeaHelpEnabled()", () => {
  test("returns false by default (no env var)", () => {
    const prev = process.env.KM_TEA_HELP
    delete process.env.KM_TEA_HELP
    try {
      expect(isTeaHelpEnabled()).toBe(false)
    } finally {
      if (prev !== undefined) process.env.KM_TEA_HELP = prev
    }
  })

  test("returns true when KM_TEA_HELP=1", () => {
    const prev = process.env.KM_TEA_HELP
    process.env.KM_TEA_HELP = "1"
    try {
      expect(isTeaHelpEnabled()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP
      else process.env.KM_TEA_HELP = prev
    }
  })

  test("returns false for other values (only '1' enables)", () => {
    const prev = process.env.KM_TEA_HELP
    try {
      for (const v of ["0", "true", "yes", "on", ""]) {
        process.env.KM_TEA_HELP = v
        expect(isTeaHelpEnabled()).toBe(false)
      }
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP
      else process.env.KM_TEA_HELP = prev
    }
  })
})
