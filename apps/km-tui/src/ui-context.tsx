/**
 * UI Context for Board Component
 *
 * Provides UI state and dispatch to child components via React context.
 * Uses reselect for memoized selectors to prevent unnecessary re-renders.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Dispatch,
} from "react"
import { createSelector } from "reselect"
import type { UIState, UIAction } from "./ui-reducer.ts"
import type { SelectionKey } from "./types.ts"
import { useVault } from "./vault-context.tsx"

// =============================================================================
// Context Types
// =============================================================================

interface UIContextValue {
  getState: () => UIState
  dispatch: Dispatch<UIAction>
  subscribe: (callback: () => void) => () => void
}

const UIContext = createContext<UIContextValue | null>(null)

// =============================================================================
// Provider Component
// =============================================================================

interface UIProviderProps {
  state: UIState
  dispatch: Dispatch<UIAction>
  children: React.ReactNode
}

/**
 * Provider that makes UI state available to child components.
 * Uses a subscription model for fine-grained re-renders.
 */
export function UIProvider({
  state,
  dispatch,
  children,
}: UIProviderProps): React.ReactElement {
  // Use ref to always have current state without causing re-renders
  const stateRef = useRef(state)
  const listenersRef = useRef(new Set<() => void>())

  // Update ref synchronously so getState() returns current value
  stateRef.current = state

  // Notify listeners AFTER render completes to avoid "Cannot update component
  // while rendering" React error. This is critical for inkx which re-renders
  // more aggressively than stock ink.
  useEffect(() => {
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [state])

  const value = useMemo(
    () => ({
      getState: () => stateRef.current,
      dispatch,
      // eslint-disable-next-line promise/prefer-await-to-callbacks -- subscribe pattern requires callback
      subscribe: (callback: () => void) => {
        listenersRef.current.add(callback)
        return () => listenersRef.current.delete(callback)
      },
    }),
    [dispatch],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the dispatch function only (never causes re-renders)
 */
export function useUIDispatch(): Dispatch<UIAction> {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error("useUIDispatch must be used within UIProvider")
  }
  return context.dispatch
}

/**
 * Select a slice of UI state with automatic memoization.
 * Only re-renders when the selected value changes.
 *
 * @example
 * const foldedNodes = useUISelector(state => state.foldedNodes);
 * const isSelected = useUISelector(state => state.multiSelected.has(myKey));
 */
export function useUISelector<T>(selector: (state: UIState) => T): T {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error("useUISelector must be used within UIProvider")
  }

  return useSyncExternalStore(
    context.subscribe,
    () => selector(context.getState()),
    () => selector(context.getState()),
  )
}

/**
 * Get the full UI state (causes re-render on any state change).
 * Prefer useUISelector for better performance.
 */
export function useUIState(): UIState {
  return useUISelector((state) => state)
}

// =============================================================================
// Pre-built Selectors (memoized with reselect)
// =============================================================================

// Base selectors
const selectFoldedNodes = (state: UIState) => state.foldedNodes
const selectMultiSelected = (state: UIState) => state.multiSelected
const selectSubIndex = (state: UIState) => state.subIndex
const selectInOutlineMode = (state: UIState) => state.inOutlineMode
const selectMaxOutlineDepth = (state: UIState) => state.maxOutlineDepth
const selectMaxContentLines = (state: UIState) => state.maxContentLines
const selectViewMode = (state: UIState) => state.viewMode
// Note: selectionLevel is now derived from cursor depth in Board.tsx, not stored in UIState
const selectRootBoardId = (state: UIState) => state.rootBoardId

/**
 * Check if a node is folded
 */
export const makeSelectIsFolded = (nodeId: string) =>
  createSelector([selectFoldedNodes], (foldedNodes) => foldedNodes.has(nodeId))

/**
 * Check if a selection key is multi-selected
 */
export const makeSelectIsMultiSelected = (key: SelectionKey) =>
  createSelector([selectMultiSelected], (multiSelected) =>
    multiSelected.has(key),
  )

/**
 * Get tree rendering config (commonly used together)
 *
 * View-mode specific behavior:
 * - Cards view: multiline variant (parent context above, content can wrap)
 * - Other views (list, columns, tabs): oneliner variant (inline context, truncate)
 */
export const selectTreeConfig = createSelector(
  [
    selectMaxOutlineDepth,
    selectMaxContentLines,
    selectInOutlineMode,
    selectSubIndex,
    selectViewMode,
  ],
  (maxOutlineDepth, maxContentLines, inOutlineMode, subIndex, viewMode) => ({
    maxOutlineDepth,
    // Cards view allows multi-line content, other views truncate to one line
    maxContentLines: viewMode === "cards" ? maxContentLines : 1,
    inOutlineMode,
    currentSubIndex: subIndex,
    // Cards view uses multiline (parent above), other views use oneliner (inline)
    variant: (viewMode === "cards" ? "multiline" : "oneliner") as
      | "oneliner"
      | "multiline",
  }),
)

// =============================================================================
// Convenience Hooks (using pre-built selectors)
// =============================================================================

/**
 * Get tree rendering config
 */
export function useTreeConfig() {
  return useUISelector(selectTreeConfig)
}

/**
 * Check if a node is folded
 */
export function useIsFolded(nodeId: string): boolean {
  const foldedNodes = useUISelector(selectFoldedNodes)
  return foldedNodes.has(nodeId)
}

/**
 * Check if a selection key is multi-selected
 */
export function useIsMultiSelected(key: SelectionKey): boolean {
  const multiSelected = useUISelector(selectMultiSelected)
  return multiSelected.has(key)
}

/**
 * Get selection-related state
 */
export function useSelectionState() {
  return useUISelector(
    createSelector(
      [selectMultiSelected, selectSubIndex, selectInOutlineMode],
      (multiSelected, subIndex, inOutlineMode) => ({
        multiSelected,
        currentSubIndex: subIndex,
        inOutlineMode,
      }),
    ),
  )
}

/**
 * Get the current board's root ID (for excluding from board pills)
 */
export function useRootBoardId(): string | null {
  return useUISelector(selectRootBoardId)
}

/**
 * Get the board's excluded sigils (for filtering from card content).
 *
 * For boards named with sigil patterns (e.g., @issue.md, @next.md),
 * returns the sigil to exclude from card rendering.
 *
 * @returns Array of sigils to exclude (e.g., ["@issue"])
 */
export function useExcludedSigils(): string[] {
  const rootBoardId = useRootBoardId()
  const vault = useVault()
  return useMemo(() => {
    if (!rootBoardId) return []

    const node = vault.getNode(rootBoardId)
    if (!node?.fs_path) return []

    // Extract filename without extension (e.g., "@issue.md" → "@issue")
    const filename = node.fs_path.split("/").pop() || ""
    const name = filename.replace(/\.md$/, "")

    // If the filename starts with a sigil (@, #, +), include it
    if (/^[@#\+]/.test(name)) {
      return [name]
    }

    return []
  }, [rootBoardId, vault])
}

/**
 * GTD board default colors for sigils
 * These are used when rendering sigils in card content
 */
const GTD_SIGIL_COLORS: Record<string, string> = {
  "@inbox": "white",
  "@next": "cyan",
  "@waiting": "yellow",
  "@someday": "gray",
  "@done": "green",
  "@dropped": "gray",
  "@blocked": "red",
}

/**
 * Get colors for sigils based on GTD defaults or node colors.
 *
 * @returns Map of sigil to color (e.g., { "@next": "cyan" })
 */
export function useSigilColors(): Map<string, string> {
  // Return static GTD colors for now
  // Future: could look up actual node colors from storage
  return useMemo(() => new Map(Object.entries(GTD_SIGIL_COLORS)), [])
}
