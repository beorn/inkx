/**
 * OpenTUI Renderer Types
 *
 * Re-exports from @km/tui plus renderer-specific component props.
 */

// Re-export types from shared package
export type {
  // State types
  BoardState,
  BoardAction,
  ColumnState,
  CardState,
  TaskStatus,
  ViewMode,
  // ViewModel types
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
} from "@km/tui-core";

// ===== Component Props (OpenTUI-specific) =====

export interface CardProps {
  title: string;
  isSelected: boolean;
  childCount: number;
  color?: string;
  icon?: string;
  isFolded?: boolean;
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped";
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
  colIndex: number;
  colCount: number;
  cardIndex: number;
  cardCount: number;
  viewMode: "cards" | "list" | "columns" | "tabs";
}

// ===== Render Context =====

export interface RenderContext {
  width: number;
  height: number;
}
