/**
 * ViewModel Transformers
 *
 * Transform state data into ViewModels for rendering.
 * Pure functions - no side effects, no React, no domain imports.
 */

import type { BoardStateLegacy, ViewMode, BoardViewModel } from "./board-types.ts";

/**
 * Transform BoardStateLegacy into BoardViewModel
 *
 * No node transformation needed - TNode is used directly.
 * UI state (selection, folding) is passed through as Sets.
 */
export function toBoardViewModel(
  state: BoardStateLegacy,
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
