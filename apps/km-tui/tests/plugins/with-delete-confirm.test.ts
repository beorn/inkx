/**
 * Unit tests — withDeleteConfirm reducer + store.
 *
 * Pure semantics: every op × every reachable state. No React, no command
 * system. Verifies the invariants documented in the plugin's apply():
 *
 * - show writes the payload (overwrites any prior payload)
 * - hide while hidden is a ref-equal no-op
 * - hide clears the payload
 *
 * Parity + integration semantics live in `delete-confirm-mini-cutover.spec.ts`.
 */
import { describe, expect, test } from "vitest"
import {
  apply,
  createDeleteConfirmStore,
  isTeaDeleteConfirmEnabled,
  type DeleteConfirmOp,
  type DeleteConfirmPayload,
  type DeleteConfirmState,
} from "../../src/plugins/with-delete-confirm.ts"

const EMPTY: DeleteConfirmState = { payload: null }

const SAMPLE: DeleteConfirmPayload = {
  nodeIds: ["a", "b"],
  title: "Two nodes",
  childCount: 3,
  backlinkCount: 1,
  hasMetadata: true,
}

describe("withDeleteConfirm — pure reducer", () => {
  describe("deleteConfirm.show", () => {
    test("opens from hidden — sets the given payload", () => {
      const [next, effects] = apply({ type: "deleteConfirm.show", payload: SAMPLE }, EMPTY)
      expect(next).toEqual({ payload: SAMPLE })
      expect(effects).toEqual([])
    })

    test("overwrites an existing payload (rare re-entry)", () => {
      const prior: DeleteConfirmState = {
        payload: { nodeIds: ["old"], title: "old", childCount: 0, backlinkCount: 0 },
      }
      const [next] = apply({ type: "deleteConfirm.show", payload: SAMPLE }, prior)
      expect(next.payload).toEqual(SAMPLE)
    })

    test("does not mutate the original state", () => {
      const before: DeleteConfirmState = { payload: null }
      apply({ type: "deleteConfirm.show", payload: SAMPLE }, before)
      expect(before.payload).toBeNull()
    })
  })

  describe("deleteConfirm.hide", () => {
    test("clears the payload while visible", () => {
      const state: DeleteConfirmState = { payload: SAMPLE }
      const [next] = apply({ type: "deleteConfirm.hide" }, state)
      expect(next).toEqual({ payload: null })
    })

    test("hiding while hidden is a ref-equal no-op", () => {
      const [next, effects] = apply({ type: "deleteConfirm.hide" }, EMPTY)
      expect(next).toBe(EMPTY)
      expect(effects).toEqual([])
    })
  })
})

describe("withDeleteConfirm — external store", () => {
  test("dispatch mutates state and notifies subscribers", () => {
    const store = createDeleteConfirmStore()
    const transitions: (DeleteConfirmPayload | null)[] = []
    const unsub = store.subscribe(() => transitions.push(store.getState().payload))

    store.dispatch({ type: "deleteConfirm.show", payload: SAMPLE })
    store.dispatch({ type: "deleteConfirm.hide" })

    expect(transitions.length).toBe(2)
    expect(transitions[0]).toEqual(SAMPLE)
    expect(transitions[1]).toBeNull()
    unsub()
  })

  test("no-op dispatches do not notify subscribers", () => {
    const store = createDeleteConfirmStore()
    let count = 0
    const unsub = store.subscribe(() => count++)

    // hide while hidden — no-op
    store.dispatch({ type: "deleteConfirm.hide" })
    // show — valid
    store.dispatch({ type: "deleteConfirm.show", payload: SAMPLE })
    // hide while visible — valid
    store.dispatch({ type: "deleteConfirm.hide" })
    // hide again — no-op
    store.dispatch({ type: "deleteConfirm.hide" })

    expect(count).toBe(2)
    unsub()
  })

  test("unsubscribe stops notifications", () => {
    const store = createDeleteConfirmStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    store.dispatch({ type: "deleteConfirm.show", payload: SAMPLE })
    unsub()
    store.dispatch({ type: "deleteConfirm.hide" })
    expect(count).toBe(1)
  })

  test("reset returns to initial state and notifies", () => {
    const store = createDeleteConfirmStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    store.dispatch({ type: "deleteConfirm.show", payload: SAMPLE })
    store.reset()
    expect(store.getState()).toEqual(EMPTY)
    expect(count).toBe(2)
    unsub()
  })

  test("initial state can be overridden", () => {
    const init: DeleteConfirmState = { payload: SAMPLE }
    const store = createDeleteConfirmStore(init)
    expect(store.getState()).toEqual(init)
  })
})

describe("withDeleteConfirm — feature flag", () => {
  test("isTeaDeleteConfirmEnabled reads KM_TEA_DELETE_CONFIRM per call (not cached)", () => {
    const prev = process.env.KM_TEA_DELETE_CONFIRM

    delete process.env.KM_TEA_DELETE_CONFIRM
    expect(isTeaDeleteConfirmEnabled()).toBe(false)

    process.env.KM_TEA_DELETE_CONFIRM = "1"
    expect(isTeaDeleteConfirmEnabled()).toBe(true)

    process.env.KM_TEA_DELETE_CONFIRM = "0"
    expect(isTeaDeleteConfirmEnabled()).toBe(false)

    process.env.KM_TEA_DELETE_CONFIRM = "true"
    expect(isTeaDeleteConfirmEnabled()).toBe(false) // only "1" matches

    if (prev === undefined) delete process.env.KM_TEA_DELETE_CONFIRM
    else process.env.KM_TEA_DELETE_CONFIRM = prev
  })
})

describe("withDeleteConfirm — op exhaustiveness (compile-time surface)", () => {
  test("every DeleteConfirmOp type produces valid output", () => {
    const ops: DeleteConfirmOp[] = [{ type: "deleteConfirm.show", payload: SAMPLE }, { type: "deleteConfirm.hide" }]
    for (const op of ops) {
      const [next, effects] = apply(op, EMPTY)
      expect(next).toBeDefined()
      expect(Array.isArray(effects)).toBe(true)
    }
  })
})
