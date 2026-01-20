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
  renderInkBoard,
  InkBoardTestable,
  makeSelectionKey,
} from "./Board.tsx";
export { ColumnsView } from "./ColumnsView.tsx";
export { ListView } from "./ListView.tsx";
export { TabsView } from "./TabsView.tsx";

// Supporting views
export { DetailPane } from "./DetailPane.tsx";
export { HelpOverlay } from "./HelpOverlay.tsx";
export { ProjectPicker } from "./ProjectPicker.tsx";
export { TreeNode } from "./TreeNode.tsx";
export type { TreeNodeProps } from "./TreeNode.tsx";

// Re-export text utilities
export { getStatusIcon, getTypeIcon } from "../text/index.ts";
