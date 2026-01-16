/**
 * OpenTUI Renderer Types
 *
 * Re-exports from @km/tui-core plus renderer-specific component props and view models.
 */

// Re-export types from shared package
export type {
  // State types
  TaskStatus,
  ViewMode,
  // Tree types
  TreeState,
  TreeAction,
  TreeNodeState,
  CursorPath,
  ViewLevelConfig,
  // ViewModel types
  NodeViewModel,
  TreeViewModel,
} from "@km/tui-core";

// ===== View Model Types (for Views) =====

/**
 * Card view model for rendering in columns/cards/list views.
 * Simplified projection of NodeViewModel for card-based layouts.
 */
export interface CardViewModel {
  id: string;
  title: string;
  childCount: number;
  isTask: boolean;
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped";
  color?: string;
  icon?: string;
  isFolded?: boolean;
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
}

/**
 * Column view model for rendering column-based layouts.
 * Used by CardsView, ListView, TabsView.
 */
export interface ColumnViewModel {
  id: string;
  title: string;
  count: number;
  wipLimit?: number;
  isCollapsed: boolean;
  cards: CardViewModel[];
}

// ===== Component Props (OpenTUI-specific) =====

export interface CardProps {
  title: string;
  isSelected: boolean;
  isMultiSelected?: boolean;
  childCount: number;
  color?: string;
  icon?: string;
  isFolded?: boolean;
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped";
  // Rich task display fields
  priority?: number; // 1-5 (P0-P5 style)
  dueDate?: string; // ISO date string (YYYY-MM-DD)
  hasBacklinks?: boolean;
  refsCount?: number;
}

export interface ColumnProps {
  title: string;
  count: number;
  wipLimit?: number;
  isActive: boolean;
  isCollapsed: boolean;
  selectedIndex: number;
  children: React.ReactNode;
}

export interface HeaderProps {
  rootPath: string | null;
  viewMode: "cards" | "list" | "columns" | "tabs";
  searchQuery: string;
  searchMode: boolean;
}

export interface StatusBarProps {
  width: number;
  height: number;
  cursor: number[];
  nodeCount: number;
  viewMode: "cards" | "list" | "columns" | "tabs";
}

// ===== Render Context =====

export interface RenderContext {
  width: number;
  height: number;
}
