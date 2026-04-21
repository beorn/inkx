/**
 * Unit tests — withSearchDialog reducer + store.
 *
 * Pure semantics: every op × every reachable state. No React, no command
 * system, no dialog-guard. Verifies the invariants documented in the
 * plugin's apply():
 *
 * - show while visible is a no-op (ref-equal)
 * - hide while hidden is a no-op (ref-equal)
 * - hide clears initialInput, resets scope to "all", clears scopeNodeIds
 * - toggleScope / setScope while hidden is a no-op
 * - consumeInitialInput is a no-op if already empty
 *
 * Parity + integration semantics live in `search-mini-cutover.spec.ts`.
 */
import { describe, expect, test } from "vitest"
import {
  apply,
  createSearchStore,
  isTeaSearchEnabled,
  type SearchOp,
  type SearchState,
} from "../../src/plugins/with-search-dialog.ts"

const EMPTY: SearchState = { visible: false, initialInput: "", scope: "all", scopeNodeIds: [] }

describe("withSearchDialog — pure reducer", () => {
  describe("search.show", () => {
    test("opens from hidden with empty initialInput + scope=all + given scopeNodeIds", () => {
      const [next, effects] = apply({ type: "search.show", scopeNodeIds: ["root"] }, EMPTY)
      expect(next).toEqual({ visible: true, initialInput: "", scope: "all", scopeNodeIds: ["root"] })
      expect(effects).toEqual([])
    })

    test("opens with supplied initialInput", () => {
      const [next] = apply({ type: "search.show", scopeNodeIds: ["a"], initialInput: "x" }, EMPTY)
      expect(next.initialInput).toBe("x")
    })

    test("opening while already visible is a ref-equal no-op", () => {
      const opened: SearchState = { visible: true, initialInput: "", scope: "selected", scopeNodeIds: ["root"] }
      const [next, effects] = apply({ type: "search.show", scopeNodeIds: ["other"] }, opened)
      expect(next).toBe(opened) // ref-equal — no state churn
      expect(effects).toEqual([])
    })
  })

  describe("search.hide", () => {
    test("closes from visible; clears initialInput, resets scope, clears scopeNodeIds", () => {
      const state: SearchState = {
        visible: true,
        initialInput: "buf",
        scope: "selected",
        scopeNodeIds: ["root"],
      }
      const [next] = apply({ type: "search.hide" }, state)
      expect(next).toEqual({ visible: false, initialInput: "", scope: "all", scopeNodeIds: [] })
    })

    test("hiding while hidden is a ref-equal no-op", () => {
      const [next, effects] = apply({ type: "search.hide" }, EMPTY)
      expect(next).toBe(EMPTY)
      expect(effects).toEqual([])
    })
  })

  describe("search.toggleScope", () => {
    test("all → selected while visible", () => {
      const state: SearchState = { visible: true, initialInput: "", scope: "all", scopeNodeIds: ["a"] }
      const [next] = apply({ type: "search.toggleScope" }, state)
      expect(next.scope).toBe("selected")
      expect(next.scopeNodeIds).toEqual(["a"])
      expect(next.visible).toBe(true)
    })

    test("selected → all while visible", () => {
      const state: SearchState = { visible: true, initialInput: "", scope: "selected", scopeNodeIds: ["a"] }
      const [next] = apply({ type: "search.toggleScope" }, state)
      expect(next.scope).toBe("all")
    })

    test("toggling while hidden is a ref-equal no-op", () => {
      const [next] = apply({ type: "search.toggleScope" }, EMPTY)
      expect(next).toBe(EMPTY)
    })
  })

  describe("search.setScope", () => {
    test("sets scope while visible", () => {
      const state: SearchState = { visible: true, initialInput: "", scope: "all", scopeNodeIds: [] }
      const [next] = apply({ type: "search.setScope", scope: "selected" }, state)
      expect(next.scope).toBe("selected")
    })

    test("no-op if scope unchanged", () => {
      const state: SearchState = { visible: true, initialInput: "", scope: "all", scopeNodeIds: [] }
      const [next] = apply({ type: "search.setScope", scope: "all" }, state)
      expect(next).toBe(state)
    })

    test("setting scope while hidden is a ref-equal no-op", () => {
      const [next] = apply({ type: "search.setScope", scope: "selected" }, EMPTY)
      expect(next).toBe(EMPTY)
    })
  })

  describe("search.consumeInitialInput", () => {
    test("clears initialInput while visible", () => {
      const state: SearchState = { visible: true, initialInput: "x", scope: "all", scopeNodeIds: [] }
      const [next] = apply({ type: "search.consumeInitialInput" }, state)
      expect(next.initialInput).toBe("")
      expect(next.visible).toBe(true)
    })

    test("no-op if already empty", () => {
      const state: SearchState = { visible: true, initialInput: "", scope: "all", scopeNodeIds: [] }
      const [next] = apply({ type: "search.consumeInitialInput" }, state)
      expect(next).toBe(state)
    })
  })
})

describe("withSearchDialog — external store", () => {
  test("dispatch mutates state and notifies subscribers", () => {
    const store = createSearchStore()
    const transitions: SearchState[] = []
    const unsub = store.subscribe(() => transitions.push(store.getState()))

    store.dispatch({ type: "search.show", scopeNodeIds: ["r"] })
    store.dispatch({ type: "search.toggleScope" })
    store.dispatch({ type: "search.hide" })

    expect(transitions.length).toBe(3)
    expect(transitions[0]!.visible).toBe(true)
    expect(transitions[0]!.scope).toBe("all")
    expect(transitions[1]!.scope).toBe("selected")
    expect(transitions[2]!.visible).toBe(false)
    unsub()
  })

  test("no-op dispatches do not notify subscribers", () => {
    const store = createSearchStore()
    let count = 0
    const unsub = store.subscribe(() => count++)

    // show while hidden — valid
    store.dispatch({ type: "search.show", scopeNodeIds: [] })
    // show again while visible — no-op
    store.dispatch({ type: "search.show", scopeNodeIds: [] })

    expect(count).toBe(1)
    unsub()
  })

  test("unsubscribe stops notifications", () => {
    const store = createSearchStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    store.dispatch({ type: "search.show", scopeNodeIds: [] })
    unsub()
    store.dispatch({ type: "search.toggleScope" })
    expect(count).toBe(1)
  })

  test("reset returns to initial state and notifies", () => {
    const store = createSearchStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    store.dispatch({ type: "search.show", scopeNodeIds: ["a"] })
    store.reset()
    expect(store.getState()).toEqual(EMPTY)
    expect(count).toBe(2)
    unsub()
  })

  test("initial state can be overridden", () => {
    const init: SearchState = { visible: true, initialInput: "seed", scope: "selected", scopeNodeIds: ["r"] }
    const store = createSearchStore(init)
    expect(store.getState()).toEqual(init)
  })
})

describe("withSearchDialog — feature flag", () => {
  test("isTeaSearchEnabled reads KM_TEA_SEARCH per call (not cached)", () => {
    const prev = process.env.KM_TEA_SEARCH

    delete process.env.KM_TEA_SEARCH
    expect(isTeaSearchEnabled()).toBe(false)

    process.env.KM_TEA_SEARCH = "1"
    expect(isTeaSearchEnabled()).toBe(true)

    process.env.KM_TEA_SEARCH = "0"
    expect(isTeaSearchEnabled()).toBe(false)

    process.env.KM_TEA_SEARCH = "true"
    expect(isTeaSearchEnabled()).toBe(false) // only "1" matches

    if (prev === undefined) delete process.env.KM_TEA_SEARCH
    else process.env.KM_TEA_SEARCH = prev
  })
})

describe("withSearchDialog — op exhaustiveness (compile-time surface)", () => {
  test("every SearchOp type produces valid output", () => {
    const ops: SearchOp[] = [
      { type: "search.show", scopeNodeIds: [], initialInput: "" },
      { type: "search.hide" },
      { type: "search.toggleScope" },
      { type: "search.setScope", scope: "selected" },
      { type: "search.consumeInitialInput" },
    ]
    for (const op of ops) {
      const [next, effects] = apply(op, EMPTY)
      expect(next).toBeDefined()
      expect(Array.isArray(effects)).toBe(true)
    }
  })
})
