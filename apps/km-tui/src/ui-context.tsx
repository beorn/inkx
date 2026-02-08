/**
 * UI Hooks for Board Components
 *
 * Provides UI state selectors via the Zustand store.
 */

import { useMemo } from "react"
import { useApp as useAppStore, useAppShallow } from "inkx/runtime"
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
 * Get tree rendering config (single shallow subscription for all fields).
 *
 * View-mode specific behavior:
 * - Cards view: multiline variant (parent context above, content can wrap)
 * - Other views (list, columns, tabs): oneliner variant (inline context, truncate)
 */
export function useTreeConfig() {
  return useAppShallow<
    BoardAppStore,
    {
      maxOutlineDepth: number
      maxContentLines: number
      inOutlineMode: boolean
      currentSubIndex: number
      variant: "oneliner" | "multiline"
    }
  >((s) => {
    const viewMode = s.ui.viewMode
    return {
      // Cards view shows full outline depth (default 2)
      // Oneliner views (columns/tabs/list) limit to depth 1 to show immediate children
      // but not grandchildren, reducing node count from 6668 to ~1400 and improving
      // j-press from 235ms to ~50ms (vs 14ms at depth=0)
      maxOutlineDepth:
        viewMode === "cards"
          ? s.ui.maxOutlineDepth
          : Math.min(1, s.ui.maxOutlineDepth),
      // Cards view allows multi-line content, other views truncate to one line
      maxContentLines: viewMode === "cards" ? s.ui.maxContentLines : 1,
      inOutlineMode: s.ui.inOutlineMode,
      currentSubIndex: s.ui.subIndex,
      // Cards view uses multiline (parent above), other views use oneliner (inline)
      variant: viewMode === "cards" ? "multiline" : "oneliner",
    }
  })
}

/**
 * Get the current board's root ID (for excluding from board pills)
 */
export function useRootBoardId(): string | null {
  return useUISelector((s) => s.rootBoardId)
}

/**
 * Derive excluded sigils from rootBoardId. Pure computation, no subscription.
 */
export function deriveExcludedSigils(
  repo: { getNode(id: string): { fs_path?: string } | undefined },
  rootBoardId: string | null,
): string[] {
  if (!rootBoardId) return []
  const node = repo.getNode(rootBoardId)
  if (!node?.fs_path) return []
  const filename = node.fs_path.split("/").pop() || ""
  const name = filename.replace(/\.md$/, "")
  if (/^[@#\+]/.test(name)) return [name]
  return []
}

/**
 * Get the board's excluded sigils (for filtering from card content).
 *
 * For boards named with sigil patterns (e.g., @issue.md, @next.md),
 * returns the sigil to exclude from card rendering.
 *
 * @returns Array of sigils to exclude (e.g., ["@issue"])
 */
export function useExcludedSigils(rootBoardIdParam?: string | null): string[] {
  const rootBoardId = useRootBoardId()
  const effectiveId =
    rootBoardIdParam !== undefined ? rootBoardIdParam : rootBoardId
  const repo = useRepo()
  return useMemo(
    () => deriveExcludedSigils(repo, effectiveId),
    [effectiveId, repo],
  )
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
