/**
 * Signal Store Tests — verify Zustand StoreApi compatibility.
 */

import { describe, test, expect, vi } from "vitest"
import { createSignalStore } from "../src/state/signal-store.ts"

describe("createSignalStore", () => {
  test("creates store with initial state", () => {
    const store = createSignalStore(() => ({ count: 0, name: "test" }))
    expect(store.getState()).toEqual({ count: 0, name: "test" })
  })

  test("getInitialState returns the initial state", () => {
    const store = createSignalStore(() => ({ count: 0 }))
    store.setState({ count: 5 })
    expect(store.getInitialState()).toEqual({ count: 0 })
    expect(store.getState()).toEqual({ count: 5 })
  })

  test("setState with partial object", () => {
    const store = createSignalStore(() => ({ count: 0, name: "test" }))
    store.setState({ count: 1 })
    expect(store.getState()).toEqual({ count: 1, name: "test" })
  })

  test("setState with function updater", () => {
    const store = createSignalStore(() => ({ count: 0 }))
    store.setState((prev) => ({ count: prev.count + 1 }))
    expect(store.getState()).toEqual({ count: 1 })
  })

  test("setState with replace=true", () => {
    const store = createSignalStore(() => ({ count: 0, name: "test" }))
    store.setState({ count: 5, name: "replaced" }, true)
    expect(store.getState()).toEqual({ count: 5, name: "replaced" })
  })

  test("subscribe is called on state changes", () => {
    const store = createSignalStore(() => ({ count: 0 }))
    const listener = vi.fn()
    store.subscribe(listener)

    store.setState({ count: 1 })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 1 }, { count: 0 })
  })

  test("unsubscribe stops notifications", () => {
    const store = createSignalStore(() => ({ count: 0 }))
    const listener = vi.fn()
    const unsub = store.subscribe(listener)

    store.setState({ count: 1 })
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    store.setState({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1) // No additional call
  })

  test("no notification when state is same reference", () => {
    const obj = { count: 0 }
    const store = createSignalStore(() => obj)
    const listener = vi.fn()
    store.subscribe(listener)

    // Same reference — should not notify
    store.setState(obj, true)
    expect(listener).not.toHaveBeenCalled()
  })

  test("factory receives set and get", () => {
    const store = createSignalStore<{ count: number; increment: () => void }>((set, get) => ({
      count: 0,
      increment() {
        set({ count: get().count + 1 })
      },
    }))

    store.getState().increment()
    expect(store.getState().count).toBe(1)

    store.getState().increment()
    expect(store.getState().count).toBe(2)
  })

  test("factory receives api for self-reference", () => {
    const store = createSignalStore<{ count: number }>((set, get, api) => {
      // Can access api.subscribe during creation
      expect(typeof api.subscribe).toBe("function")
      expect(typeof api.getState).toBe("function")
      return { count: 0 }
    })
    expect(store.getState()).toEqual({ count: 0 })
  })

  test("setState with function returning partial", () => {
    const store = createSignalStore(() => ({ a: 1, b: 2 }))
    store.setState((prev) => ({ a: prev.a + 10 }))
    expect(store.getState()).toEqual({ a: 11, b: 2 })
  })

  test("multiple subscribers all notified", () => {
    const store = createSignalStore(() => ({ count: 0 }))
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    store.subscribe(listener1)
    store.subscribe(listener2)

    store.setState({ count: 1 })

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })
})
