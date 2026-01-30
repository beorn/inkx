/**
 * Layout Context
 *
 * Provides card position registry to child components.
 * Components register their positions during useLayoutEffect,
 * which are then available for h/l navigation to find cards by Y position.
 */

import React, { createContext, useContext } from "react"
import type { LayoutRegistry } from "./card-positions.ts"

// =============================================================================
// Context
// =============================================================================

const LayoutContext = createContext<LayoutRegistry | null>(null)

// =============================================================================
// Provider
// =============================================================================

interface LayoutProviderProps {
  /** The position registry instance (created by parent) */
  registry: LayoutRegistry
  children: React.ReactNode
}

/**
 * Provider that makes the card position registry available to child components.
 * The registry is created by the parent (Board) so it can also be passed to TUIContext.
 */
export function LayoutProvider({
  registry,
  children,
}: LayoutProviderProps): React.ReactElement {
  return (
    <LayoutContext.Provider value={registry}>{children}</LayoutContext.Provider>
  )
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the layout registry, returning null if not within LayoutProvider.
 * Use this for optional position tracking (e.g., in tests).
 */
export function useLayoutRegistryOptional(): LayoutRegistry | null {
  return useContext(LayoutContext)
}
