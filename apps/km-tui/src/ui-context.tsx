/**
 * UI Hooks for Board Components
 *
 * Provides UI state selectors via the Zustand store.
 * TreeRenderContext provides global rendering config to TreeNode
 * without per-node store subscriptions.
 */

import React, { createContext, useContext, useMemo } from "react"
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
  return useAppShallow<BoardAppStore, TreeConfig>((s) => deriveTreeConfig(s.ui))
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

const STATIC_SIGIL_COLORS = new Map(Object.entries(GTD_SIGIL_COLORS))

/**
 * Get colors for sigils based on GTD defaults or node colors.
 *
 * @returns Map of sigil to color (e.g., { "@next": "cyan" })
 */
export function useSigilColors(): Map<string, string> {
  return STATIC_SIGIL_COLORS
}

// =============================================================================
// TreeRenderContext — Global rendering config for TreeNode
// =============================================================================

/**
 * Tree rendering config computed from UI state.
 * Stable across cursor moves (only changes on view mode / outline changes).
 */
export interface TreeConfig {
  maxOutlineDepth: number
  maxContentLines: number
  inOutlineMode: boolean
  currentSubIndex: number
  variant: "oneliner" | "multiline"
}

/**
 * Global rendering context for the tree component tree.
 * Eliminates per-node store subscriptions for global state.
 *
 * Values change rarely (view mode switch, outline toggle, etc.)
 * and when they do, all nodes need re-render anyway.
 */
export interface TreeRenderCtx {
  treeConfig: TreeConfig
  sigilColors: Map<string, string>
  setUI: BoardAppStore["setUI"]
  rootBoardId: string | null
}

const TreeRenderContext = createContext<TreeRenderCtx | null>(null)

/**
 * Read global tree rendering config from context.
 * Must be called inside a TreeRenderProvider.
 */
export function useTreeRenderContext(): TreeRenderCtx {
  const ctx = useContext(TreeRenderContext)
  if (!ctx) {
    throw new Error(
      "useTreeRenderContext must be used inside TreeRenderProvider",
    )
  }
  return ctx
}

/**
 * Derive TreeConfig from UI state. Pure computation.
 */
export function deriveTreeConfig(ui: UIState): TreeConfig {
  const viewMode = ui.viewMode
  return {
    maxOutlineDepth:
      viewMode === "cards"
        ? ui.maxOutlineDepth
        : Math.min(1, ui.maxOutlineDepth),
    maxContentLines: viewMode === "cards" ? ui.maxContentLines : 1,
    inOutlineMode: ui.inOutlineMode,
    currentSubIndex: ui.subIndex,
    variant: viewMode === "cards" ? "multiline" : "oneliner",
  }
}

/**
 * Provider for tree rendering context.
 * Placed at the Board level to give all TreeNode instances
 * access to global config without per-node store subscriptions.
 */
export function TreeRenderProvider({
  treeConfig,
  setUI,
  rootBoardId,
  children,
}: {
  treeConfig: TreeConfig
  setUI: BoardAppStore["setUI"]
  rootBoardId: string | null
  children: React.ReactNode
}): React.ReactElement {
  const ctx = useMemo(
    () => ({
      treeConfig,
      sigilColors: STATIC_SIGIL_COLORS,
      setUI,
      rootBoardId,
    }),
    [treeConfig, setUI, rootBoardId],
  )
  return (
    <TreeRenderContext.Provider value={ctx}>
      {children}
    </TreeRenderContext.Provider>
  )
}
