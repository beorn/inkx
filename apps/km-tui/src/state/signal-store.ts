/**
 * Signal Store — Zustand StoreApi-compatible store backed by alien-signals.
 *
 * Drop-in replacement for Zustand's createStore(). Implements the same
 * StoreApi<T> interface (setState, getState, getInitialState, subscribe)
 * so that silvery's useApp()/StoreContext and all existing consumers
 * keep working without changes.
 *
 * Internally uses a single alien-signals signal to hold state.
 * Subscriptions are implemented via effect() which tracks the signal read.
 *
 * @example
 * ```ts
 * import { createSignalStore } from "./signal-store.ts"
 *
 * const store = createSignalStore<MyState>((set, get) => ({
 *   count: 0,
 *   increment() { set({ count: get().count + 1 }) },
 * }))
 *
 * store.subscribe((state, prev) => console.log(state.count))
 * store.getState().increment()
 * ```
 */

import { signal } from "alien-signals"
import { useState, useEffect, useRef } from "react"

/**
 * Zustand-compatible StoreApi interface.
 * Matches zustand/vanilla's StoreApi<T> exactly.
 */
export interface SignalStoreApi<T> {
  setState: SetStateInternal<T>
  getState: () => T
  getInitialState: () => T
  subscribe: (listener: (state: T, prevState: T) => void) => () => void
}

type SetStateInternal<T> = {
  (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: false): void
  (state: T | ((state: T) => T), replace: true): void
}

/**
 * Zustand-compatible StateCreator type.
 * The factory function that creates the initial state.
 */
export type StateCreator<T> = (
  set: SignalStoreApi<T>["setState"],
  get: SignalStoreApi<T>["getState"],
  api: SignalStoreApi<T>,
) => T

/**
 * Create a signal-backed store with Zustand's StoreApi interface.
 *
 * Accepts a StateCreator factory (same signature as Zustand's createStore).
 * State changes trigger subscriptions synchronously, matching Zustand's behavior.
 */
export function createSignalStore<T>(factory: StateCreator<T>): SignalStoreApi<T> {
  // Listeners set — subscribers are notified on state changes
  const listeners = new Set<(state: T, prevState: T) => void>()

  // The state signal — call with no args to read, with arg to write.
  // alien-signals: sig() → read, sig(value) → write
  const state$ = signal<T>(undefined as T)

  // Track initial state for getInitialState()
  let initialState: T

  const setState: SetStateInternal<T> = (partial: unknown, replace?: boolean) => {
    const prev = state$()
    let next: T

    if (typeof partial === "function") {
      next = (partial as (state: T) => T | Partial<T>)(prev)
    } else {
      next = partial as T
    }

    // Merge partial update (unless replace=true)
    if (!replace && next !== null && typeof next === "object" && !Array.isArray(next)) {
      // Shallow merge (same as Zustand)
      next = { ...prev, ...(next as Partial<T>) } as T
    }

    // Only update if something changed (reference check, same as Zustand)
    if (Object.is(prev, next)) return

    state$(next)

    // Notify subscribers synchronously (matches Zustand behavior)
    for (const listener of listeners) {
      listener(next, prev)
    }
  }

  const getState = (): T => state$()

  const getInitialState = (): T => initialState

  const subscribe = (listener: (state: T, prevState: T) => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const api: SignalStoreApi<T> = {
    setState,
    getState,
    getInitialState,
    subscribe,
  }

  // Run the factory to create initial state
  const created = factory(setState, getState, api)
  state$(created)
  initialState = created

  return api
}

/**
 * React hook to subscribe to a signal store with a selector.
 * Drop-in replacement for Zustand's useStore(store, selector).
 *
 * @example
 * ```tsx
 * const content = useSignalStore(store, (s) => s.content)
 * ```
 */
export function useSignalStore<T, U>(store: SignalStoreApi<T>, selector: (state: T) => U): U {
  const [state, setState] = useState(() => selector(store.getState()))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selectorRef.current(newState)
      setState((prev) => (Object.is(prev, next) ? prev : next))
    })
  }, [store])

  return state
}
