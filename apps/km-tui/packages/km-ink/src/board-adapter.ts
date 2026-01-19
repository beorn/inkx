/**
 * Board Adapter
 *
 * Converts between TUI's column-based state model and @km/board's tree-based model.
 * This enables the command system to work with the TUI while maintaining
 * backwards compatibility during the migration.
 *
 * TUI State Model:
 *   - BoardState { columns: ColumnState[], colIndex, cardIndex }
 *   - Selection: Set<"col:card:sub">
 *   - Collapsed: Set<number> (column indices)
 *
 * @km/board State Model:
 *   - BoardState { nodes: TNode[], cursor: TPath }
 *   - Selection: Set<string> (node IDs)
 *   - Collapsed: Set<string> (node IDs)
 *
 * Key insight: Columns are depth-0 nodes, cards are depth-1 nodes,
 * outline sub-items are depth-2+ nodes.
 */

import type { TNode } from "@km/core";
import type {
  BoardState as TreeBoardState,
  ViewMode,
  TPath,
} from "@km/board";
import type {
  BoardState as TuiBoardState,
  ColumnState,
  SelectionKey,
} from "./types.ts";
import { makeSelectionKey } from "./types.ts";

// =============================================================================
// TUI → Tree Conversion
// =============================================================================

/**
 * Convert TUI board state to @km/board tree state.
 * Used when dispatching commands that expect tree-based state.
 */
export function toTreeState(
  tuiState: TuiBoardState,
  uiState: {
    subIndex: number;
    foldedNodes: Set<string>;
    multiSelected: Set<SelectionKey>;
    collapsedColumns: Set<number>;
  },
): TreeBoardState {
  // Convert columns to top-level nodes
  const nodes: TNode[] = tuiState.columns.map((col) => col.node as TNode);

  // Convert (colIndex, cardIndex, subIndex) to TPath
  const cursor: TPath = buildCursorPath(
    tuiState.colIndex,
    tuiState.cardIndex,
    uiState.subIndex,
    tuiState.columns,
  );

  // Convert SelectionKey set to node ID set
  const selectedNodes = selectionKeysToNodeIds(
    uiState.multiSelected,
    tuiState.columns,
  );

  // Convert collapsed column indices to node IDs
  const collapsedNodes = new Set<string>();
  for (const colIdx of uiState.collapsedColumns) {
    const col = tuiState.columns[colIdx];
    if (col) {
      collapsedNodes.add(col.node.id);
    }
  }

  return {
    rootId: tuiState.rootId,
    rootPath: tuiState.rootPath,
    nodes,
    cursor,
    selectedNodes,
    foldedNodes: new Set(uiState.foldedNodes),
    collapsedNodes,
    zoomStack: tuiState.zoomStack.map((rootId) => ({
      rootId,
      cursor: [], // TUI doesn't store cursor in zoom stack
    })),
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [],
    maxOutlineDepth: 2, // Default, should come from UI state
    maxContentLines: 3, // Default, should come from UI state
  };
}

/**
 * Build a TPath from TUI indices.
 * TPath = [colIndex, cardIndex, ...subIndices]
 */
function buildCursorPath(
  colIndex: number,
  cardIndex: number,
  subIndex: number,
  columns: ColumnState[],
): TPath {
  // Base path: column + card
  const path: TPath = [colIndex, cardIndex];

  // If we have a subIndex > 0, we need to trace through the tree
  // to find the actual path to that item
  if (subIndex > 0) {
    const col = columns[colIndex];
    const card = col?.cards[cardIndex];
    if (card) {
      const subPath = flatIndexToPath(card.node, subIndex);
      path.push(...subPath);
    }
  }

  return path;
}

/**
 * Convert a flat sub-index to a path through the tree.
 * Sub-index 0 = the root node itself
 * Sub-index 1 = first child
 * Sub-index 2 = second child (or first child's first child if first has children)
 */
function flatIndexToPath(node: TNode, targetIndex: number): number[] {
  if (targetIndex <= 0) return [];

  let currentIndex = 0;
  const path: number[] = [];

  function traverse(n: TNode, depth: number): boolean {
    for (let i = 0; i < n.children.length; i++) {
      currentIndex++;
      if (currentIndex === targetIndex) {
        path.push(i);
        return true;
      }
      path.push(i);
      if (traverse(n.children[i] as TNode, depth + 1)) {
        return true;
      }
      path.pop();
    }
    return false;
  }

  traverse(node, 0);
  return path;
}

// =============================================================================
// Tree → TUI Conversion
// =============================================================================

/**
 * Convert @km/board tree state back to TUI board state.
 * Used when the board reducer has processed an action and we need
 * to update the TUI's state.
 */
export function fromTreeState(
  treeState: TreeBoardState,
  existingTuiState: TuiBoardState,
): {
  tuiState: Partial<TuiBoardState>;
  uiState: {
    subIndex: number;
    foldedNodes: Set<string>;
    multiSelected: Set<SelectionKey>;
    collapsedColumns: Set<number>;
  };
} {
  // Extract indices from cursor path
  const [colIndex = 0, cardIndex = 0, ...subPath] = treeState.cursor;
  const subIndex = subPath.length > 0 ? pathToFlatIndex(
    existingTuiState.columns[colIndex]?.cards[cardIndex]?.node as TNode,
    subPath,
  ) : 0;

  // Convert node ID selection back to SelectionKey format
  const multiSelected = nodeIdsToSelectionKeys(
    treeState.selectedNodes,
    existingTuiState.columns,
  );

  // Convert collapsed node IDs back to column indices
  const collapsedColumns = new Set<number>();
  for (let i = 0; i < existingTuiState.columns.length; i++) {
    const col = existingTuiState.columns[i];
    if (col && treeState.collapsedNodes.has(col.node.id)) {
      collapsedColumns.add(i);
    }
  }

  // Convert zoom stack back to string array
  const zoomStack = treeState.zoomStack.map((entry) => entry.rootId || "");

  return {
    tuiState: {
      rootId: treeState.rootId,
      rootPath: treeState.rootPath,
      colIndex,
      cardIndex,
      zoomStack,
    },
    uiState: {
      subIndex,
      foldedNodes: new Set(treeState.foldedNodes),
      multiSelected,
      collapsedColumns,
    },
  };
}

/**
 * Convert a path through the tree to a flat index.
 */
function pathToFlatIndex(node: TNode | undefined, path: number[]): number {
  if (!node || path.length === 0) return 0;

  let index = 0;
  let current: TNode = node;

  for (let i = 0; i < path.length; i++) {
    const childIdx = path[i];
    if (childIdx === undefined) break;

    // Count all nodes before this child
    for (let j = 0; j < childIdx; j++) {
      index += 1 + countDescendants(current.children[j] as TNode);
    }
    index += 1; // Count this child itself

    const nextNode = current.children[childIdx];
    if (!nextNode) break;
    current = nextNode as TNode;
  }

  return index;
}

/**
 * Count all descendants of a node.
 */
function countDescendants(node: TNode | undefined): number {
  if (!node) return 0;
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child as TNode);
  }
  return count;
}

// =============================================================================
// Selection Conversion Helpers
// =============================================================================

/**
 * Convert TUI SelectionKey set to node ID set.
 */
function selectionKeysToNodeIds(
  keys: Set<SelectionKey>,
  columns: ColumnState[],
): Set<string> {
  const nodeIds = new Set<string>();

  for (const key of keys) {
    const [colStr, cardStr, subStr] = key.split(":");
    const colIdx = parseInt(colStr ?? "0", 10);
    const cardIdx = parseInt(cardStr ?? "0", 10);
    const subIdx = parseInt(subStr ?? "0", 10);

    const col = columns[colIdx];
    const card = col?.cards[cardIdx];
    if (!card) continue;

    if (subIdx === 0) {
      // Card itself
      nodeIds.add(card.node.id);
    } else {
      // Sub-item - find the node at that flat index
      const nodeAtIndex = findNodeAtFlatIndex(card.node, subIdx);
      if (nodeAtIndex) {
        nodeIds.add(nodeAtIndex.id);
      }
    }
  }

  return nodeIds;
}

/**
 * Convert node ID set back to TUI SelectionKey set.
 */
function nodeIdsToSelectionKeys(
  nodeIds: Set<string>,
  columns: ColumnState[],
): Set<SelectionKey> {
  const keys = new Set<SelectionKey>();

  // Build a reverse lookup: nodeId -> (colIdx, cardIdx, subIdx)
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx];
    if (!col) continue;

    for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
      const card = col.cards[cardIdx];
      if (!card) continue;

      if (nodeIds.has(card.node.id)) {
        keys.add(makeSelectionKey(colIdx, cardIdx, 0));
      }

      // Check descendants
      let flatIdx = 0;
      const checkNode = (node: TNode) => {
        for (const child of node.children) {
          flatIdx++;
          if (nodeIds.has((child as TNode).id)) {
            keys.add(makeSelectionKey(colIdx, cardIdx, flatIdx));
          }
          checkNode(child as TNode);
        }
      };
      checkNode(card.node as TNode);
    }
  }

  return keys;
}

/**
 * Find a node at a flat index within a tree.
 */
function findNodeAtFlatIndex(
  root: TNode | { children: unknown[] },
  targetIndex: number,
): TNode | null {
  let currentIndex = 0;

  function traverse(node: TNode | { children: unknown[] }): TNode | null {
    for (const child of node.children) {
      currentIndex++;
      if (currentIndex === targetIndex) {
        return child as TNode;
      }
      const found = traverse(child as TNode);
      if (found) return found;
    }
    return null;
  }

  return traverse(root);
}

// =============================================================================
// Command Context Builder
// =============================================================================

/**
 * Build a CommandContext from TUI state for command execution.
 */
export function buildCommandContext(
  tuiState: TuiBoardState,
  uiState: {
    subIndex: number;
    foldedNodes: Set<string>;
    multiSelected: Set<SelectionKey>;
    collapsedColumns: Set<number>;
    maxOutlineDepth: number;
    maxContentLines: number;
    viewMode: ViewMode;
  },
) {
  const treeState = toTreeState(tuiState, uiState);

  // Find current node
  const col = tuiState.columns[tuiState.colIndex];
  const card = col?.cards[tuiState.cardIndex];
  let currentNode: TNode | null = card?.node as TNode ?? null;

  // If we have a subIndex, find the actual sub-node
  if (uiState.subIndex > 0 && card) {
    const subNode = findNodeAtFlatIndex(card.node, uiState.subIndex);
    if (subNode) {
      currentNode = subNode;
    }
  }

  return {
    currentNode,
    currentNodeId: currentNode?.id ?? null,
    selectedNodes: Array.from(treeState.selectedNodes),
    cursor: treeState.cursor,
    boardState: treeState,
    viewMode: uiState.viewMode,
    siblingCount: col?.cards.length ?? 0,
    siblingIndex: tuiState.cardIndex,
    columnIndex: tuiState.colIndex,
    columnCount: tuiState.columns.length,
  };
}
