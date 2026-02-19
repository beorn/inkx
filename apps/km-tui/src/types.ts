/**
 * Board Types — VIEW MODEL (not data model)
 *
 * These types describe how nodes are presented in the TUI, not how they're stored.
 * The data model is KNode (from @km/core) — a single tree of nodes.
 *
 * ColumnState/CardState are view model types that wrap KNode with
 * pre-fetched children. They exist because the board view needs columns/cards,
 * but the underlying model is just nodes.
 *
 * ColumnsLayout is a derived layout type that includes cursor position.
 */

import type { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"
import type { Repo } from "./repo-context.tsx"

/**
 * Initial board data returned by buildBoardState/initBoardState.
 * Contains the minimum data needed to initialize the TUI.
 */
export interface InitialBoardData {
  rootId: string | null
  rootPath: string | null
  columns: ColumnState[]
  collapsedColumns: Set<number>
  collapsedNodeIds: Set<string>
}

// VIEW MODEL: A "column" is just a parent KNode whose children render as cards.
// Target: eliminate this wrapper — components call repo.getChildren(node.id) directly.
// wipLimit/rules should move to node.rules (data model, parsed at storage layer).
// isVirtual body columns → view splits children by isItem(type), no synthetic nodes.
export interface ColumnState {
  node: KNode
  cards: CardState[]
  wipLimit?: number // Optional WIP limit from frontmatter
  rules?: SectionRules // Optional column rules parsed from heading
  /** True for virtual body column (displays leading non-section content) */
  isVirtual?: boolean
}

// VIEW MODEL: A "card" is just a child KNode rendered in card style.
// Target: eliminate this wrapper — children/childCount derived from repo on demand.
export interface CardState {
  node: KNode
  children: KNode[]
  /** Child count for lazy loading (may be > 0 even when children array is empty) */
  childCount?: number
  /** True for virtual body card (displays leading non-section content) */
  isVirtual?: boolean
}

/**
 * Special cardIndex value indicating cursor is at column header level.
 *
 * VIEW MODEL ARTIFACT: In the new node model, the column header IS a node —
 * navigating "above the first card" just means cursorNodeId points to the
 * parent node. No sentinel index needed. Target: eliminate.
 */
export const COLUMN_HEADER_INDEX = -1

/**
 * Check if a cardIndex represents the column header level.
 */
export function isAtColumnHeader(cardIndex: number): boolean {
  return cardIndex === COLUMN_HEADER_INDEX
}

/**
 * Derived columns layout with cursor position.
 * Used by cursor-context and Board to pass derived layout data.
 */
export interface ColumnsLayout {
  columns: ColumnState[]
  colIndex: number
  /** Card index within column, or COLUMN_HEADER_INDEX (-1) if at column header */
  cardIndex: number
  isAtCardLevel: boolean
  /** O(1) nodeId → position index, built alongside column derivation */
  nodeIndex?: Map<string, { colIndex: number; cardIndex: number }>
}

/**
 * View mode for the TUI
 * - cards: Kanban-style cards in columns (default)
 * - list: Full-width hierarchical list view (all columns stacked)
 * - columns: Tree/outline view within each column
 * - tabs: Tab-based view (one column at a time with tab bar)
 */
export type ViewMode = "cards" | "list" | "columns" | "tabs"

/**
 * Selection key format: "nodeId:subIndex"
 *
 * Node-based keys survive card movements (unlike positional "col:card:sub").
 * The nodeId identifies the specific node, subIndex is its position within
 * the card's outline tree (0 = card root).
 */
export type SelectionKey = `${string}:${number}`

/**
 * Create a selection key from a node ID and sub-index.
 */
export function makeSelectionKey(nodeId: string, sub: number): SelectionKey {
  return `${nodeId}:${sub}`
}

/**
 * Parse a selection key into its components.
 */
export function parseSelectionKey(key: SelectionKey): {
  nodeId: string
  sub: number
} {
  const colonIdx = key.lastIndexOf(":")
  return {
    nodeId: key.substring(0, colonIdx),
    sub: parseInt(key.substring(colonIdx + 1), 10),
  }
}

export interface RenderOptions {
  width: number
  height: number
  useColor: boolean
}

/**
 * Options for running the TUI
 */
export interface TuiOptions {
  /**
   * Run in interactive mode (default: true).
   * When false, renders static output and exits.
   */
  interactive?: boolean
  initialViewMode?: ViewMode
  /**
   * Enable file watching for live sync (default: true).
   * Set to false to disable watching - faster startup on large repos.
   * Can also be set via config (tui.watch).
   */
  watch?: boolean
  /**
   * Use worker thread for file watching (default: true).
   * Worker-based watching doesn't block the main thread during initialization.
   * Can also be set via config (tui.watchWorker).
   */
  watchWorker?: boolean
  /**
   * Loading spinner to stop when TUI is ready to render.
   * Passed from CLI to keep spinner running through board initialization.
   */
  spinner?: { stop(): void }
  /**
   * Repo domain object for storage operations.
   * When provided, TUI uses this instead of global getStore().
   */
  repo?: Repo
  /**
   * Called after alternate screen is active and patchConsole is set up.
   * CLI uses this to flush buffered debug output to Console component.
   */
  onReady?: () => void
  /**
   * Pre-created PatchedConsole instance.
   * When provided, runBoard uses this instead of creating its own.
   * Set up early (before loadRepo) to capture startup warnings.
   */
  patchedConsole?: import("inkx").PatchedConsole
}
