/**
 * ViewModel Transformers
 *
 * Transform state data into ViewModels for rendering.
 * Pure functions - no side effects, no React, no domain imports.
 */

import type { BoardState, ViewMode, BoardViewModel } from "./board-types.ts";

/**
 * Transform BoardState into BoardViewModel
 *
 * No node transformation needed - TNode is used directly.
 * UI state (selection, folding) is passed through as Sets.
 */
export function toBoardViewModel(
  state: BoardState,
  viewMode: ViewMode,
): BoardViewModel {
  return {
    rootPath: state.rootPath,
    nodes: state.nodes,
    cursor: state.cursor,
    selectedNodes: state.selectedNodes,
    foldedNodes: state.foldedNodes,
    viewMode,
  };
}

// ===== Legacy alias for backward compatibility =====
// TODO: Remove after migrating consumers

/**
 * @deprecated Use toBoardViewModel instead
 */
export const toTreeViewModel = toBoardViewModel;
