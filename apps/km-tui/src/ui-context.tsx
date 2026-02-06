/**
 * UI Hooks for Board Components
 *
 * Provides UI state selectors and dispatch via the Zustand store.
 * Uses reselect for memoized compound selectors to prevent unnecessary re-renders.
 */

import { useMemo } from "react"
import { useApp as useAppStore } from "inkx/runtime"
import { createSelector } from "reselect"
import type { UIState, UIAction } from "./ui-reducer.ts"
import type { BoardAppStore } from "./board-app-store.ts"
import { useRepo } from "./repo-context.tsx"

// =============================================================================
// Core Hooks
// =============================================================================

/**
 * Select a slice of UI state with automatic memoization.
 * Only re-renders when the selected value changes (via Zustand + React useState).
 *
 * @example
 * const showHelp = useUISelector(state => state.showHelp);
 * const isSelected = useUISelector(state => state.multiSelected.has(myKey));
 */
export function useUISelector<T>(selector: (state: UIState) => T): T {
  return useAppStore<BoardAppStore, T>((s) => selector(s.ui))
}

/**
 * Get UI dispatch function (stable reference from store).
 */
export function useUIDispatch(): (action: UIAction) => void {
  return useAppStore<BoardAppStore, BoardAppStore["dispatchUI"]>(
    (s) => s.dispatchUI,
  )
}

// =============================================================================
// Pre-built Selectors (memoized with reselect)
// =============================================================================

// Base selectors
const selectMaxOutlineDepth = (state: UIState) => state.maxOutlineDepth
const selectMaxContentLines = (state: UIState) => state.maxContentLines
const selectViewMode = (state: UIState) => state.viewMode
const selectInOutlineMode = (state: UIState) => state.inOutlineMode
const selectSubIndex = (state: UIState) => state.subIndex
// Note: selectionLevel is now derived from cursor depth in Board.tsx, not stored in UIState
const selectRootBoardId = (state: UIState) => state.rootBoardId

/**
 * Get tree rendering config (commonly used together)
 *
 * View-mode specific behavior:
 * - Cards view: multiline variant (parent context above, content can wrap)
 * - Other views (list, columns, tabs): oneliner variant (inline context, truncate)
 */
const selectTreeConfig = createSelector(
  [
    selectMaxOutlineDepth,
    selectMaxContentLines,
    selectInOutlineMode,
    selectSubIndex,
    selectViewMode,
  ],
  (maxOutlineDepth, maxContentLines, inOutlineMode, subIndex, viewMode) => ({
    // Cards view shows full outline depth (default 2)
    // Oneliner views (columns/tabs/list) limit to depth 1 to show immediate children
    // but not grandchildren, reducing node count from 6668 to ~1400 and improving
    // j-press from 235ms to ~50ms (vs 14ms at depth=0)
    maxOutlineDepth:
      viewMode === "cards" ? maxOutlineDepth : Math.min(1, maxOutlineDepth),
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
  const repo = useRepo()
  return useMemo(() => {
    if (!rootBoardId) return []

    const node = repo.getNode(rootBoardId)
    if (!node?.fs_path) return []

    // Extract filename without extension (e.g., "@issue.md" → "@issue")
    const filename = node.fs_path.split("/").pop() || ""
    const name = filename.replace(/\.md$/, "")

    // If the filename starts with a sigil (@, #, +), include it
    if (/^[@#\+]/.test(name)) {
      return [name]
    }

    return []
  }, [rootBoardId, repo])
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
