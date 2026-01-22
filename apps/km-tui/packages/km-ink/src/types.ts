/**
 * Board Types
 *
 * Shared types for the boardliner TUI
 */

import type { KNode, TaskStatus, TaskMark } from "@km/core";

export interface BoardState {
  rootId: string | null;
  rootPath: string | null; // Filesystem path to the board root (for display)
  columns: ColumnState[];
  colIndex: number;
  cardIndex: number;
  selectedCards: Set<string>;
  visualMode: boolean;
  foldedCards: Set<string>;
  collapsedColumns: Set<number>; // Column indices that are collapsed (show count only)
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  zoomStack: string[];
}

/**
 * WIP (Work In Progress) limit configuration for a column
 * Extracted from file frontmatter under columns.<column-name>.limit
 */
export interface WipConfig {
  limit?: number; // Maximum cards allowed in this column
}

export interface ColumnState {
  node: KNode;
  cards: CardState[];
  wipLimit?: number; // Optional WIP limit from frontmatter
  rules?: ColumnRules; // Optional column rules parsed from heading
}

export interface CardState {
  node: KNode;
  children: KNode[];
  /** Child count for lazy loading (may be > 0 even when children array is empty) */
  childCount?: number;
}

// Status cycle order
export const STATUS_CYCLE: TaskStatus[] = [
  "todo",
  "wip",
  "blocked",
  "done",
  "dropped",
];

// Task marks by status
export const STATUS_MARKS: Record<TaskStatus, TaskMark> = {
  todo: " ",
  wip: "/",
  blocked: "!",
  done: "x",
  dropped: "-",
};

/**
 * Column rule configuration parsed from heading attributes
 */
export interface ColumnRules {
  add?: string; // Query to auto-pull matching tasks
  sync?: string; // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean; // Start collapsed
  limit?: number; // WIP limit
  default?: boolean; // Default column for new items
}

export type BoardAction = "quit" | "refresh" | null;

/**
 * View mode for the TUI
 * - cards: Kanban-style cards in columns (default)
 * - list: Full-width hierarchical list view (all columns stacked)
 * - columns: Tree/outline view within each column
 * - tabs: Tab-based view (one column at a time with tab bar)
 */
export type ViewMode = "cards" | "list" | "columns" | "tabs";

/**
 * Selection key format: "col:card:sub"
 */
export type SelectionKey = `${number}:${number}:${number}`;

/**
 * Create a selection key from column, card, and sub indices.
 */
export function makeSelectionKey(
  col: number,
  card: number,
  sub: number,
): SelectionKey {
  return `${col}:${card}:${sub}`;
}

export interface RenderOptions {
  width: number;
  height: number;
  useColor: boolean;
}

/**
 * TUI rendering engine
 * - inkx: Custom Ink fork with double-buffering
 * - inkx-flexx: inkx with pure JS flexbox layout (default)
 */
export type TuiEngine = "inkx" | "inkx-flexx";

/**
 * Options for running the TUI
 */
export interface TuiOptions {
  initialViewMode?: ViewMode;
  engine?: TuiEngine;
  /**
   * Optional callback to initialize database state (replay events).
   * If provided, TUI will show loading indicator while this runs.
   * This enables deferred loading for large vaults.
   */
  initializeState?: () => void;
  /**
   * Enable file watching for live sync (default: true).
   * Set to false to disable watching - faster startup on large vaults.
   * Can also be set via config (tui.watch).
   */
  watch?: boolean;
  /**
   * Use worker thread for file watching (default: true).
   * Worker-based watching doesn't block the main thread during initialization.
   * Can also be set via config (tui.watchWorker).
   */
  watchWorker?: boolean;
}
