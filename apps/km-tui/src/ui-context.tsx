/**
 * UI Hooks for Board Components
 *
 * Provides UI state selectors via the Zustand store.
 */

import { useMemo } from "react"
import { useApp as useAppStore } from "inkx/runtime"
import type { UIState } from "./ui-reducer.ts"
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
 * Get setUI function for direct partial UI state updates.
 *
 * @example
 * const setUI = useSetUI();
 * setUI({ showHelp: false });
 * setUI(prev => ({ maxOutlineDepth: prev.maxOutlineDepth + 1 }));
 */
export function useSetUI(): BoardAppStore["setUI"] {
  return useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
}

// =============================================================================
// Convenience Hooks
// =============================================================================

/**
 * Get tree rendering config (memoized by individual field subscriptions).
 *
 * View-mode specific behavior:
 * - Cards view: multiline variant (parent context above, content can wrap)
 * - Other views (list, columns, tabs): oneliner variant (inline context, truncate)
 */
export function useTreeConfig() {
  const maxOutlineDepth = useUISelector((s) => s.maxOutlineDepth)
  const maxContentLines = useUISelector((s) => s.maxContentLines)
  const viewMode = useUISelector((s) => s.viewMode)
  const inOutlineMode = useUISelector((s) => s.inOutlineMode)
  const subIndex = useUISelector((s) => s.subIndex)

  return useMemo(
    () => ({
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
    [maxOutlineDepth, maxContentLines, viewMode, inOutlineMode, subIndex],
  )
}

/**
 * Get the current board's root ID (for excluding from board pills)
 */
export function useRootBoardId(): string | null {
  return useUISelector((s) => s.rootBoardId)
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
