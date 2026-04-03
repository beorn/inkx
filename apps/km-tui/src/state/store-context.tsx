/**
 * StoreContext - Dependency Injection for Reactive Store Operations
 *
 * Provides the reactive Store (Store & Observable & Reactive) to TUI components
 * via React Context. This enables fine-grained per-node reactivity via signals.
 *
 * Wraps Repo as a Store via createStoreFromRepo(repo), then adds reactive
 * signals via withReactive(store).
 *
 * @example
 * // In component — subscribe to a specific node only
 * const store = useStore();
 * const nodeState = useNodeSignal(store, nodeId);
 *
 * // In production
 * const store = withReactive(createStoreFromRepo(repo))
 * <StoreProvider store={store}><Board /></StoreProvider>
 *
 * // In tests
 * <StoreProvider store={mockStore}><Board /></StoreProvider>
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { Store as StorageStore, Observable, Reactive } from "@km/storage"

export type Store = StorageStore & Observable & Reactive

const StoreContext = createContext<Store | null>(null)

/**
 * Hook to access the reactive store. Must be used within a StoreProvider.
 */
export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) {
    throw new Error("useStore must be used within a StoreProvider")
  }
  return ctx
}

/**
 * Provides the reactive store to child components.
 */
export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
