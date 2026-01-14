/**
 * Board Types
 *
 * Shared types for the boardliner TUI
 */

import type { Node, TaskStatus, TaskMark } from "@km/core";

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
  node: Node;
  cards: CardState[];
  wipLimit?: number; // Optional WIP limit from frontmatter
  rules?: ColumnRules; // Optional column rules parsed from heading
}

export interface CardState {
  node: Node;
  children: Node[];
}

// Status cycle order (valid statuses only: open, blocked, done, dropped)
export const STATUS_CYCLE: TaskStatus[] = [
  "open",
  "blocked",
  "done",
  "dropped",
];

// Task marks by status
export const STATUS_MARKS: Record<TaskStatus, TaskMark> = {
  open: " ",
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
 */
export type ViewMode = "board" | "tree";

/**
 * Selection key format: "col:card:sub"
 */
export type SelectionKey = `${number}:${number}:${number}`;

export interface RenderOptions {
  width: number;
  height: number;
  useColor: boolean;
}
