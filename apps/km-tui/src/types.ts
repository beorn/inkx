/**
 * Board Types
 *
 * Shared types for the boardliner TUI
 */

import type { KNode, TaskStatus, TaskMark } from "@km/core"
import type { Repo } from "./repo-context.tsx"

/**
 * TUI-specific board rendering state.
 * Contains columns/cards structure for rendering the board view.
 * Separate from @km/board's BoardState which is the navigation state.
 */
export interface TUIBoardState {
  rootId: string | null
  rootPath: string | null // Filesystem path to the board root (for display)
  columns: ColumnState[]
  selectedNodes: Set<string>
  visualMode: boolean
  foldedNodes: Set<string>
  collapsedColumns: Set<number> // Column indices that are collapsed (show count only)
  searchQuery: string
  searchMode: boolean
  helpMode: boolean
}

/**
 * WIP (Work In Progress) limit configuration for a column
 * Extracted from file frontmatter under columns.<column-name>.limit
 */
export interface WipConfig {
  limit?: number // Maximum cards allowed in this column
}

export interface ColumnState {
  node: KNode
  cards: CardState[]
  wipLimit?: number // Optional WIP limit from frontmatter
  rules?: ColumnRules // Optional column rules parsed from heading
  /** True for virtual body column (displays leading non-section content) */
  isVirtual?: boolean
}

export interface CardState {
  node: KNode
  children: KNode[]
  /** Child count for lazy loading (may be > 0 even when children array is empty) */
  childCount?: number
  /** True for virtual body card (displays leading non-section content) */
  isVirtual?: boolean
}

// Status cycle order
export const STATUS_CYCLE: TaskStatus[] = ["todo", "wip", "blocked", "done", "dropped"]

// Task marks by status
export const STATUS_MARKS: Record<TaskStatus, TaskMark> = {
  todo: " ",
  wip: "/",
  blocked: "!",
  done: "x",
  dropped: "-",
}

/**
 * Column rule configuration parsed from heading attributes
 */
export interface ColumnRules {
  add?: string | string[] // Query to auto-pull matching tasks (multiple allowed)
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  limit?: number // WIP limit
  default?: boolean // Default column for new items
}

export type BoardAction = "quit" | "refresh" | null

/**
 * Special cardIndex value indicating cursor is at column header level.
 *
 * When cardIndex === COLUMN_HEADER_INDEX, the cursor is on the column header
 * (not on any card within the column). This is used for:
 * - Navigating up from first card in column
 * - Direct column selection via h/l from another column header
 * - Visual distinction between column-level and card-level selection
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
 * Built from Repo + cursor state for rendering.
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
