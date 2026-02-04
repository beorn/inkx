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
 * - DetailPane: Side panel showing item details
 * - HelpOverlay: Keyboard shortcuts overlay
 * - ProjectPicker: Move-to-project picker
 * - TreeNode: Shared tree node component
 */

// Main board component and views
export { BoardCore, BoardApp, makeSelectionKey } from "./Board.tsx"

// Re-export text utilities
