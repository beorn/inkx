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
}

export interface CardState {
  node: Node;
  children: Node[];
}

// Status cycle order
export const STATUS_CYCLE: TaskStatus[] = [
  "open",
  "in_progress",
  "done",
  "blocked",
  "waiting",
  "cancelled",
];

// Task marks by status
export const STATUS_MARKS: Record<TaskStatus, TaskMark> = {
  open: " ",
  in_progress: "/",
  done: "x",
  blocked: "-",
  waiting: "?",
  scheduled: "1",
  cancelled: "X",
};

export type BoardAction = "quit" | "refresh" | null;

export interface RenderOptions {
  width: number;
  height: number;
  useColor: boolean;
}
