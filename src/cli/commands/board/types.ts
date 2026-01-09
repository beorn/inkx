/**
 * Board Types
 *
 * Shared types for the boardliner TUI
 */

import type { Node, TaskStatus, TaskMark } from "../../../node/types.ts";

export interface BoardState {
  rootId: string | null;
  columns: ColumnState[];
  colIndex: number;
  cardIndex: number;
  selectedCards: Set<string>;
  visualMode: boolean;
  foldedCards: Set<string>;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  zoomStack: string[];
}

export interface ColumnState {
  node: Node;
  cards: CardState[];
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
