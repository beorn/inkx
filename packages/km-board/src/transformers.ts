/**
 * ViewModel Transformers
 *
 * Transform state data into ViewModels for rendering.
 * Pure functions - no side effects, no React, no domain imports.
 */

import type {
  BoardState,
  TNode,
  ViewMode,
  NodeViewModel,
  BoardViewModel,
} from "./boardTypes.ts";

/**
 * Transform a TNode into a NodeViewModel
 */
export function toNodeViewModel(
  node: TNode,
  foldedNodes: Set<string>,
): NodeViewModel {
  return {
    id: node.nodeId,
    name: node.name,
    title: node.title,
    childCount: node.childCount,
    isTask: node.isTask,
    taskStatus: node.taskStatus,
    color: node.color,
    icon: node.icon,
    isFolded: foldedNodes.has(node.nodeId),
    priority: node.priority,
    dueDate: node.dueDate,
    hasBacklinks: node.hasBacklinks,
    refsCount: node.refsCount,
    body: node.body,
    depth: node.depth,
    children: node.children.map((child) => toNodeViewModel(child, foldedNodes)),
  };
}

/**
 * Transform BoardState into BoardViewModel
 */
export function toBoardViewModel(
  state: BoardState,
  viewMode: ViewMode,
): BoardViewModel {
  // Transform nodes to view models
  const nodes = state.nodes.map((node) =>
    toNodeViewModel(node, state.foldedNodes),
  );

  return {
    rootPath: state.rootPath,
    nodes,
    cursor: state.cursor,
    selectedNodes: state.selectedNodes,
    viewMode,
  };
}

// ===== Legacy alias for backward compatibility =====
// TODO: Remove after migrating consumers

/**
 * @deprecated Use toBoardViewModel instead
 */
export const toTreeViewModel = toBoardViewModel;
