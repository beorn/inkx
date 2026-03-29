/**
 * Board TUI View Components
 *
 * Main views (correspond to ViewMode):
 * - cards: CardsView (kanban cards in columns) - inline in Board.tsx
 * - columns: ColumnsView (tree within columns)
 * - list: ListView (full-width tree)
 * - tabs: TabsView (tabbed single column)
 *
 * Supporting views:
 * - detail: Detail view mode (board pane with viewMode "detail")
 * - HelpOverlay: Keyboard shortcuts overlay
 * - ItemPicker: Generic picker for selecting nodes
 * - TreeNode: Shared tree node component
 */

// Main board component and views
export { BoardCore, BoardApp } from "./Board.tsx"

// Re-export text utilities
