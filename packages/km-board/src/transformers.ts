/**
 * ViewModel Transformers
 *
 * Transform state data into ViewModels for rendering.
 * Pure functions - no side effects, no React, no domain imports.
 */

import type {
  TreeState,
  TNode,
  ViewMode,
  NodeViewModel,
  TreeViewModel,
} from "./treeTypes.ts";

/**
 * Transform a TNode into a NodeViewModel
 */
export function toNodeViewModel(
  node: TNode,
  foldedNodes: Set<string>,
): NodeViewModel {
  return {
    id: node.nodeId,
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
    content: node.content,
    depth: node.depth,
    children: node.children.map((child) => toNodeViewModel(child, foldedNodes)),
  };
}

/**
 * Filter nodes by search query (case-insensitive title match)
 */
function filterNodesByQuery(
  nodes: NodeViewModel[],
  query: string,
): NodeViewModel[] {
  if (!query) {
    return nodes;
  }
  const lowerQuery = query.toLowerCase();
  return nodes.filter((node) => node.title.toLowerCase().includes(lowerQuery));
}

/**
 * Transform full TreeState into TreeViewModel
 */
export function toTreeViewModel(
  state: TreeState,
  viewMode: ViewMode,
): TreeViewModel {
  // Transform nodes to view models
  const nodes = state.nodes.map((node) =>
    toNodeViewModel(node, state.foldedNodes),
  );

  // Apply search filter if query is present
  const filteredNodes = state.searchQuery
    ? filterNodesByQuery(nodes, state.searchQuery)
    : nodes;

  return {
    rootPath: state.rootPath,
    nodes: filteredNodes,
    cursor: state.cursor,
    selectedNodes: state.selectedNodes,
    viewMode,
    searchQuery: state.searchQuery,
    searchMode: state.searchMode,
    helpMode: state.helpMode,
  };
}
