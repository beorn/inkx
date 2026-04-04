/**
 * Signal Store — re-exports @silvery/create's signal store with km-specific additions.
 *
 * The core createStore/StoreApi/StateCreator come from @silvery/create/signal-store.
 * This module adds:
 * - createSignalStore (alias for createStore — named export for clarity in km code)
 * - SignalStoreApi (alias for StoreApi)
 * - useSignalStore (React hook for subscribing to a signal store with a selector)
 */

import { useState, useEffect, useRef } from "react"

// Re-export silvery's signal store as the canonical implementation
export {
  createStore as createSignalStore,
  type StoreApi as SignalStoreApi,
  type StateCreator,
} from "@silvery/create/signal-store"

import type { StoreApi } from "@silvery/create/signal-store"

/**
 * React hook to subscribe to a signal store with a selector.
 * Drop-in replacement for Zustand's useStore(store, selector).
 *
 * @example
 * ```tsx
 * const content = useSignalStore(store, (s) => s.content)
 * ```
 */
export function useSignalStore<T, U>(store: StoreApi<T>, selector: (state: T) => U): U {
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
