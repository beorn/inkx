/**
 * Board Adapter
 *
 * Derives column-based layout from @km/board's tree-based BoardState.
 * This is a pure derivation layer - no state of its own.
 *
 * The @km/board package manages:
 *   - TNode[] tree structure
 *   - TPath cursor (e.g., [colIndex, cardIndex, subPath...])
 *   - Selection, folding, zoom state
 *
 * This adapter derives:
 *   - ColumnState[] for rendering
 *   - (colIndex, cardIndex) for legacy compatibility
 */

import type { TNode } from "@km/core";
import type { KNode } from "@km/core";
import type { BoardState as TreeBoardState, ColumnIndices } from "@km/board";
import { pathToColumnIndices, columnIndicesToPath } from "@km/board";
import { getChildren, getStore } from "@km/storage";
import type { ColumnState, CardState, ColumnRules } from "./types.ts";
import { parseColumnRules } from "./state.ts";

// ===== Column Layout Derivation =====

/**
 * Derived column layout from @km/board's tree state.
 * This is computed on each render from the tree data.
 */
export interface ColumnsLayout {
  /** Column state array for rendering */
  columns: ColumnState[];
  /** Current column index (derived from cursor[0]) */
  colIndex: number;
  /** Current card index (derived from cursor[1]) */
  cardIndex: number;
  /** Sub-path within card for outline mode (cursor[2+]) */
  subPath: number[];
  /** Whether cursor is at card level */
  isAtCardLevel: boolean;
  /** Whether cursor is in outline mode (depth > 2) */
  isInOutlineMode: boolean;
}

/**
 * Convert a TNode (from @km/board tree) to ColumnState (for TUI rendering).
 */
function tNodeToColumnState(
  node: TNode,
  wipLimits: Map<string, number>,
): ColumnState {
  // Parse column rules from node content or use pre-parsed rules
  const rules: ColumnRules = node.rules ?? parseColumnRules(node.title || "");

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName);

  // Convert children to cards
  const cards: CardState[] = node.children.map((child) => ({
    node: child as KNode,
    children: getChildrenFromTNode(child),
  }));

  return {
    node: node as KNode,
    cards,
    wipLimit,
    rules,
  };
}

/**
 * Get children from a TNode, falling back to storage for grandchildren.
 */
function getChildrenFromTNode(node: TNode): KNode[] {
  // TNode.children contains immediate children
  // For deeper nesting, we may need to query storage
  if (node.children.length > 0) {
    return node.children as KNode[];
  }
  // Fall back to storage for lazy loading
  return getChildren(node.id);
}

/**
 * Extract WIP limits from root node frontmatter.
 */
function extractWipLimits(nodes: TNode[]): Map<string, number> {
  const limits = new Map<string, number>();

  // WIP limits are typically in the root file's frontmatter
  // For now, extract from any node that has columns config in data
  for (const node of nodes) {
    const columnsConfig = (
      node.data as { columns?: Record<string, { limit?: number }> }
    )?.columns;
    if (!columnsConfig) continue;

    for (const [colName, config] of Object.entries(columnsConfig)) {
      if (typeof config?.limit === "number" && config.limit > 0) {
        const normalizedName = colName.toLowerCase().replace(/\s+/g, "_");
        limits.set(normalizedName, config.limit);
      }
    }
  }

  return limits;
}

/**
 * Derive column layout from @km/board's tree state.
 * This is the main conversion function called on each render.
 */
export function deriveColumnsLayout(state: TreeBoardState): ColumnsLayout {
  const wipLimits = extractWipLimits(state.nodes);
  const indices = pathToColumnIndices(state.cursor);

  // Convert tree nodes to column layout
  const columns = state.nodes.map((node) =>
    tNodeToColumnState(node, wipLimits),
  );

  return {
    columns,
    colIndex: Math.max(0, indices.colIndex),
    cardIndex: Math.max(0, indices.cardIndex),
    subPath: indices.subPath,
    isAtCardLevel: indices.isAtCardLevel,
    isInOutlineMode: indices.isInOutlineMode,
  };
}

/**
 * Get the current column from derived layout.
 */
export function getLayoutColumn(layout: ColumnsLayout): ColumnState | null {
  return layout.columns[layout.colIndex] ?? null;
}

/**
 * Get the current card from derived layout.
 */
export function getLayoutCard(layout: ColumnsLayout): CardState | null {
  const col = getLayoutColumn(layout);
  if (!col || layout.cardIndex < 0) return null;
  return col.cards[layout.cardIndex] ?? null;
}

// ===== Selection Key Conversion =====

/**
 * Convert @km/board's node ID selection to TUI's "col:card:sub" format.
 * Used for legacy compatibility during migration.
 */
export function nodeIdsToSelectionKeys(
  selectedNodeIds: Set<string>,
  columns: ColumnState[],
): Set<string> {
  const keys = new Set<string>();

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx];
    if (!col) continue;

    for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
      const card = col.cards[cardIdx];
      if (!card) continue;

      if (selectedNodeIds.has(card.node.id)) {
        keys.add(`${colIdx}:${cardIdx}:0`);
      }

      // Also check children for outline mode selection
      for (let subIdx = 0; subIdx < card.children.length; subIdx++) {
        const child = card.children[subIdx];
        if (child && selectedNodeIds.has(child.id)) {
          keys.add(`${colIdx}:${cardIdx}:${subIdx + 1}`);
        }
      }
    }
  }

  return keys;
}

/**
 * Convert TUI's "col:card:sub" selection keys to node IDs.
 * Used for legacy compatibility during migration.
 */
export function selectionKeysToNodeIds(
  keys: Set<string>,
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

    if (subIdx === 0 && card) {
      nodeIds.add(card.node.id);
    } else if (card && subIdx > 0) {
      const child = card.children[subIdx - 1];
      if (child) nodeIds.add(child.id);
    }
  }

  return nodeIds;
}

// ===== Collapsed Column Conversion =====

/**
 * Convert @km/board's collapsedNodes (node IDs) to column indices.
 */
export function collapsedNodesToIndices(
  collapsedNodeIds: Set<string>,
  columns: ColumnState[],
): Set<number> {
  const indices = new Set<number>();

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col && collapsedNodeIds.has(col.node.id)) {
      indices.add(i);
    }
  }

  return indices;
}

/**
 * Convert column indices to node IDs.
 */
export function columnIndicesToNodeIds(
  indices: Set<number>,
  columns: ColumnState[],
): Set<string> {
  const nodeIds = new Set<string>();

  for (const idx of indices) {
    const col = columns[idx];
    if (col) {
      nodeIds.add(col.node.id);
    }
  }

  return nodeIds;
}

// ===== State Conversion =====

/**
 * Convert TUI's initial BoardState to @km/board's BoardState.
 * This is used during the migration to seed the tree-based reducer.
 */
export function tuiStateToTreeState(
  tuiState: {
    rootId: string | null;
    rootPath: string | null;
    columns: ColumnState[];
    colIndex: number;
    cardIndex: number;
    foldedCards?: Set<string>;
    collapsedColumns?: Set<number>;
    zoomStack?: string[];
  },
  uiState: {
    foldedNodes: Set<string>;
    navHistory: Array<{
      rootId: string | null;
      colIndex: number;
      cardIndex: number;
    }>;
    navHistoryIndex: number;
  },
): TreeBoardState {
  // Convert columns to TNode array
  const nodes: TNode[] = tuiState.columns.map((col) => columnToTNode(col));

  // Convert cursor from (colIndex, cardIndex) to TPath
  const cursor: number[] =
    tuiState.cardIndex >= 0
      ? [tuiState.colIndex, tuiState.cardIndex]
      : [tuiState.colIndex];

  // Merge foldedCards and uiState.foldedNodes
  const foldedNodes = new Set<string>([
    ...(tuiState.foldedCards ?? []),
    ...uiState.foldedNodes,
  ]);

  // Convert collapsedColumns (indices) to collapsedNodes (IDs)
  const collapsedNodes = new Set<string>();
  if (tuiState.collapsedColumns) {
    for (const idx of tuiState.collapsedColumns) {
      const col = tuiState.columns[idx];
      if (col) collapsedNodes.add(col.node.id);
    }
  }

  // Convert zoom stack (string[] to Array<{rootId, cursor}>)
  const zoomStack = (tuiState.zoomStack ?? []).map((rootId) => ({
    rootId,
    cursor: [0] as [number, ...number[]],
  }));

  // Convert nav history
  const navHistory = uiState.navHistory.map((entry) => ({
    rootId: entry.rootId,
    cursor: [entry.colIndex, entry.cardIndex] as [number, ...number[]],
  }));

  return {
    rootId: tuiState.rootId,
    rootPath: tuiState.rootPath,
    nodes,
    cursor,
    selectedNodes: new Set<string>(),
    foldedNodes,
    collapsedNodes,
    zoomStack,
    navHistory,
    navHistoryIndex: uiState.navHistoryIndex,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [],
    maxOutlineDepth: 99,
    maxContentLines: 2,
  };
}

/**
 * Convert a ColumnState to a TNode.
 */
function columnToTNode(col: ColumnState): TNode {
  return {
    id: col.node.id,
    type: col.node.type,
    parent_id: col.node.parent_id,
    parent_idx: col.node.parent_idx,
    link_to: col.node.link_to ?? null,
    name: col.node.name ?? col.node.title ?? "",
    title: col.node.title ?? "",
    children: col.cards.map((card) => cardToTNode(card)),
    childCount: col.cards.length,
    isTask: col.node.type === "task",
    depth: 0,
    data: col.node.data ?? {},
    rules: col.rules,
    created_at: col.node.created_at,
    updated_at: col.node.updated_at,
    version: col.node.version ?? "",
  };
}

/**
 * Convert a CardState to a TNode.
 */
function cardToTNode(card: CardState): TNode {
  return {
    id: card.node.id,
    type: card.node.type,
    parent_id: card.node.parent_id,
    parent_idx: card.node.parent_idx,
    link_to: card.node.link_to ?? null,
    name: card.node.name ?? card.node.title ?? "",
    title: card.node.title ?? "",
    children: card.children.map((child) => kNodeToTNode(child, 2)),
    childCount: card.children.length,
    isTask: card.node.type === "task",
    depth: 1,
    data: card.node.data ?? {},
    created_at: card.node.created_at,
    updated_at: card.node.updated_at,
    version: card.node.version ?? "",
    // Task-specific fields
    task_status: card.node.task_status,
    task_mark: card.node.task_mark,
    content: card.node.content,
  };
}

/**
 * Convert a KNode to a TNode.
 */
function kNodeToTNode(node: KNode, depth: number): TNode {
  const children = getChildren(node.id);
  return {
    id: node.id,
    type: node.type,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    link_to: node.link_to ?? null,
    name: node.name ?? node.title ?? "",
    title: node.title ?? "",
    children: children.map((child) => kNodeToTNode(child, depth + 1)),
    childCount: children.length,
    isTask: node.type === "task",
    depth,
    data: node.data ?? {},
    created_at: node.created_at,
    updated_at: node.updated_at,
    version: node.version ?? "",
    task_status: node.task_status,
    task_mark: node.task_mark,
    content: node.content,
  };
}

// ===== Direct Tree Building =====

/**
 * Build TNode[] directly from storage, bypassing legacy BoardState.
 * Use this for navigation operations (zoom, nav to) instead of buildBoardState.
 *
 * @param rootId - Root node ID to load children from
 * @returns TNode[] for immediate children of root
 */
export function buildTreeNodes(rootId: string): TNode[] {
  const columnNodes = getChildren(rootId);
  return columnNodes.map((node) => kNodeToTNode(node, 0));
}

/**
 * Build root-level TNode[] for the entire vault (no specific root).
 * Used when starting without a root ID.
 */
export function buildRootTreeNodes(): TNode[] | null {
  // Get root node from store
  const store = getStore();
  if (!store) return null;

  const rootPath = store.rootPath;
  if (!rootPath) return null;

  // Find root node by path
  const rootNode = getChildren("").find(
    (n) => n.fs_path === rootPath || n.name === rootPath.replace(/\.md$/, ""),
  );
  if (!rootNode) return null;

  return buildTreeNodes(rootNode.id);
}

// ===== Re-exports for convenience =====

export { pathToColumnIndices, columnIndicesToPath };
export type { ColumnIndices };
