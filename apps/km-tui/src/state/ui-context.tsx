/**
 * UI Hooks for Board Components
 *
 * Provides UI state selectors via the signal store.
 * TreeRenderContext provides global rendering config to TreeNode
 * without per-node store subscriptions.
 */

import React, { createContext, useContext, useMemo } from "react"
import { useApp as useAppStore, useAppShallow } from "@silvery/create/create-app"
import type { UIState, PaneUI, IconStyle, BorderMode } from "./ui-reducer.ts"
import { createEmptyFilterProperties } from "./ui-reducer.ts"
import { Workspace, type BoardAppStore } from "./board-app-store.ts"
import { mergePaneUI, type PerPaneUIFields } from "../board/board-types.ts"

/** Default per-pane UI field values (used when no board pane is focused) */
const DEFAULT_PANE_UI: PerPaneUIFields = {
  viewMode: "columns",
  maxContentLines: 3,
  collapsedColumns: new Set(),
  columnScrollAnchor: null,
  localSearch: null,
  searchReplace: null,
  showFilterDialog: false,
  filterText: "",
  filterProperties: createEmptyFilterProperties(),
  filterCursorRow: 0,
  filterCursorVal: 0,
  showHidden: false,
  hiddenVersion: 0,
  mouseSelection: null,
  isMouseDragging: false,
}
import { useRepo, type Repo } from "../repo-context.tsx"
import { getOwnColor } from "../board/board-pills.ts"
import type { JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"

// =============================================================================
// Core Hooks
// =============================================================================

/**
 * Select a slice of UI state with automatic memoization.
 * Only re-renders when the selected value changes (via store + React useState).
 *
 * @example
 * const showHelp = useUISelector(state => state.showHelp);
 * const isSelected = useUISelector(state => state.showHelp);
 */
export function useUISelector<T>(selector: (state: UIState) => T): T {
  return useAppStore<BoardAppStore, T>((s) => selector(s.ui))
}

/**
 * Get setUI function for direct partial UI state updates.
 * Routes per-pane fields to the focused BoardPaneState automatically.
 *
 * @example
 * const setUI = useSetUI();
 * setUI({ showHelp: false });
 */
export function useSetUI(): BoardAppStore["setUI"] {
  return useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
}

/**
 * Get the @silvery/selection store.
 * Use for reading/writing selection state (node selection, text editing, etc.).
 *
 * @example
 * const sel = useSel();
 * sel.text.deselect(); // exit text editing
 * sel.node.select([id as ID]); // select a node
 */
export function useSel(): import("@silvery/selection").SelectionStore {
  return useAppStore<BoardAppStore, import("@silvery/selection").SelectionStore>((s) => s.sel)
}

/**
 * Get the effective UI state — global UIState merged with per-pane fields from the focused BoardPaneState.
 * Uses shallow comparison so components only re-render when a field actually changes.
 *
 * Use this when a component needs both global UI fields (showHelp, etc.) and per-pane fields (viewMode, etc.).
 */
export function usePaneUI(): PaneUI {
  return useAppShallow<BoardAppStore, PaneUI>((s) => {
    const pane = Workspace.getActiveBoardPane(s)
    if (!pane) return { ...s.ui, ...DEFAULT_PANE_UI } as PaneUI
    return mergePaneUI(s.ui, pane)
  })
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
  return useAppShallow<BoardAppStore, TreeConfig>((s) => {
    const pane = Workspace.getActiveBoardPane(s)
    return deriveTreeConfig(pane?.viewMode ?? "columns", pane?.maxContentLines ?? 3, s.ui)
  })
}

/**
 * Walk up the tree from nodeId to find the nearest file-level ancestor.
 * File nodes have fs_path set. Returns nodeId itself if it's already a file node,
 * or the first ancestor with fs_path. Used to derive rootBoardId from a pane's rootId.
 */
export function findBoardRootId(
  repo: { getNode(id: string): { fs_path?: string; parent_id?: string | null } | null | undefined },
  nodeId: string | null,
): string | null {
  if (!nodeId) return null
  let id: string | null = nodeId
  while (id) {
    const node = repo.getNode(id)
    if (!node) return nodeId
    if (node.fs_path) return id
    id = node.parent_id ?? null
  }
  return nodeId
}

/**
 * Derive excluded sigils from a board root node. Pure computation, no subscription.
 * Checks fs_path for sigil prefix (@, #, +).
 */
export function deriveExcludedSigils(
  repo: { getNode(id: string): { fs_path?: string } | null | undefined },
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
 * Derive excluded sigils from a column node's display name, ID, or fs_path.
 * If any of these starts with a sigil prefix (@, #, +), that sigil
 * should be hidden from cards inside the column (redundant context).
 *
 * Example: column file `@next.md` with display name "Next Actions" —
 * the display name doesn't start with @, but the fs_path does → exclude "@next".
 */
export function deriveColumnExcludedSigils(columnName: string, nodeId?: string, fsPath?: string): string[] {
  if (/^[@#\+]/.test(columnName)) return [columnName]
  if (nodeId && /^[@#\+]/.test(nodeId)) return [nodeId]
  if (fsPath) {
    const filename = fsPath.split("/").pop() || ""
    const name = filename.replace(/\.md$/, "")
    if (/^[@#\+]/.test(name)) return [name]
  }
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
export function useExcludedSigils(rootBoardId: string | null): string[] {
  const repo = useRepo()
  return useMemo(() => deriveExcludedSigils(repo, rootBoardId), [rootBoardId, repo])
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
  maxContentLines: number
  variant: "oneliner" | "multiline"
  iconStyle: IconStyle
  borderMode: BorderMode
  /** Inner width of a card (column width minus padding). Used for line-aware title truncation. */
  cardInnerWidth: number
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
  resolveSigilColor: (sigil: string) => string | undefined
  setUI: BoardAppStore["setUI"]
  sel: import("@silvery/selection").SelectionStore
  rootBoardId: string | null
  /** Node IDs matching the current local search query (empty set when no search) */
  searchMatchNodeIds: ReadonlySet<string>
  /** The currently focused match node ID (highlighted differently from other matches) */
  currentMatchNodeId: string | null
  /** Board-wide: job runner for background operations (no per-node subscription needed) */
  jobRunner: JobRunner
  /** Board-wide: undo handle for undo/redo operations */
  undoHandle: UndoableRepoHandle
  /** Board-wide: task status filter (same for all nodes) */
  taskStatusFilter: ReadonlySet<string>
  /** Board-wide: whether the board pane has focus (for cursor dimming) */
  boardFocused: boolean
  /** Current local search query (for text-span highlighting in cards) */
  searchQuery: string | null
}

const TreeRenderContext = createContext<TreeRenderCtx | null>(null)

/**
 * Read global tree rendering config from context.
 * Must be called inside a TreeRenderProvider.
 */
export function useTreeRenderContext(): TreeRenderCtx {
  const ctx = useContext(TreeRenderContext)
  if (!ctx) {
    throw new Error("useTreeRenderContext must be used inside TreeRenderProvider")
  }
  return ctx
}

/**
 * Derive TreeConfig from UI state. Pure computation.
 * Per-pane fields (viewMode, maxContentLines) must be passed explicitly.
 */
export function deriveTreeConfig(
  viewMode: import("../types.ts").ViewMode,
  maxContentLines: number,
  ui: { iconStyle: IconStyle; borderMode: BorderMode },
  cardInnerWidth = 30,
): TreeConfig {
  return {
    maxContentLines: viewMode === "cards" ? maxContentLines : 1,
    variant: viewMode === "cards" ? "multiline" : "oneliner",
    iconStyle: ui.iconStyle,
    borderMode: ui.borderMode,
    cardInnerWidth,
  }
}

/**
 * Create a sigil color resolver that looks up nodes in the repo.
 * For sigils like @name, #name, +name — strips the prefix, resolves the node,
 * and returns the node's own color (from rules.color).
 */
function createSigilColorResolver(repo: Repo): (sigil: string) => string | undefined {
  // Cache resolved colors within a single render cycle
  const cache = new Map<string, string | undefined>()
  return (sigil: string) => {
    if (cache.has(sigil)) return cache.get(sigil)
    // Strip the sigil prefix (@, #, +) to get the node name
    const name = sigil.slice(1)
    // Use in-memory name index (O(1)) instead of resolveNode (6+ SQL queries)
    const node = repo.resolveByName?.(name) ?? repo.getNode(name)
    const color = node ? getOwnColor(node) : undefined
    cache.set(sigil, color)
    return color
  }
}

/**
 * Provider for tree rendering context.
 * Placed at the Board level to give all TreeNode instances
 * access to global config without per-node store subscriptions.
 */
const EMPTY_SET: ReadonlySet<string> = new Set()

export function TreeRenderProvider({
  treeConfig,
  setUI,
  sel,
  rootBoardId,
  searchMatchNodeIds,
  currentMatchNodeId,
  jobRunner,
  undoHandle,
  taskStatusFilter,
  boardFocused,
  searchQuery,
  children,
}: {
  treeConfig: TreeConfig
  setUI: BoardAppStore["setUI"]
  sel: import("@silvery/selection").SelectionStore
  rootBoardId: string | null
  searchMatchNodeIds?: ReadonlySet<string>
  currentMatchNodeId?: string | null
  jobRunner: JobRunner
  undoHandle: UndoableRepoHandle
  taskStatusFilter: ReadonlySet<string>
  boardFocused: boolean
  searchQuery?: string | null
  children: React.ReactNode
}): React.ReactElement {
  const repo = useRepo()
  // Dynamic sigil resolver: resolves sigils not in the static GTD map
  // by looking up the node in the repo and getting its color
  const resolveSigilColor = useMemo(() => createSigilColorResolver(repo), [repo])
  const matchIds = searchMatchNodeIds ?? EMPTY_SET
  const matchNode = currentMatchNodeId ?? null
  const effectiveSearchQuery = searchQuery ?? null
  const ctx = useMemo(
    () => ({
      treeConfig,
      sigilColors: STATIC_SIGIL_COLORS,
      resolveSigilColor,
      setUI,
      sel,
      rootBoardId,
      searchMatchNodeIds: matchIds,
      currentMatchNodeId: matchNode,
      jobRunner,
      undoHandle,
      taskStatusFilter,
      boardFocused,
      searchQuery: effectiveSearchQuery,
    }),
    [
      treeConfig,
      resolveSigilColor,
      setUI,
      sel,
      rootBoardId,
      matchIds,
      matchNode,
      jobRunner,
      undoHandle,
      taskStatusFilter,
      boardFocused,
      effectiveSearchQuery,
    ],
  )
  return <TreeRenderContext.Provider value={ctx}>{children}</TreeRenderContext.Provider>
}
