/**
 * ViewModel Types
 *
 * Data shapes passed to presenters. These contain only the data
 * needed to render - no domain objects, no state management types.
 */

import type { TaskStatus, ViewMode } from "@km/tui-state";

export type { TaskStatus, ViewMode };

export interface CardViewModel {
  id: string;
  title: string;
  childCount: number;
  isTask: boolean;
  taskStatus?: TaskStatus;
  color?: string;
  icon?: string;
  isFolded: boolean;
}

export interface ColumnViewModel {
  id: string;
  title: string;
  count: number;
  wipLimit?: number;
  isOverLimit: boolean;
  isCollapsed: boolean;
  cards: CardViewModel[];
}

export interface BoardViewModel {
  rootPath: string | null;
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
}
