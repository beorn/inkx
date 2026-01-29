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
export {
  renderInkxBoard,
  BoardCore,
  BoardApp,
  makeSelectionKey,
} from "./Board.tsx"

// Supporting views

export type { TreeNodeProps } from "./TreeNode.tsx"

// Re-export text utilities
