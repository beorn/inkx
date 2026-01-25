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
import {
  pathToColumnIndices,
  columnIndicesToPath,
  findPathToNode,
  getNodeAtPath,
} from "@km/board";
import type { Vault } from "@km/storage";
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
    childCount: child.childCount,
  }));

  return {
    node: node as KNode,
    cards,
    wipLimit,
    rules,
  };
}

/**
 * Get children from a TNode for rendering.
 * NEVER queries the database - only returns already-loaded children.
 * This is critical for performance during renders.
 */
function getChildrenFromTNode(node: TNode): KNode[] {
  // Only return already-loaded children
  // Never query database during render - that blocks the event loop
  return node.children as KNode[];
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
 *
 * Priority for cursor derivation:
 * 1. If cursorNodeId is set and found in tree, derive path from it
 * 2. Otherwise fall back to stored cursor path
 *
 * This ensures the cursor follows the selected node across zoom operations.
 */
export function deriveColumnsLayout(state: TreeBoardState): ColumnsLayout {
  const wipLimits = extractWipLimits(state.nodes);

  // Derive cursor path from cursorNodeId if available
  // This is the key to making zoom preserve selection
  let cursorPath = state.cursor;
  if (state.cursorNodeId) {
    const derivedPath = findPathToNode(state.nodes, state.cursorNodeId);
    if (derivedPath) {
      cursorPath = derivedPath;
    }
    // If cursorNodeId not found in tree, keep using stored cursor
    // (node might be outside visible tree after zoom)
  }

  const indices = pathToColumnIndices(cursorPath);

  // Convert tree nodes to column layout
  const columns = state.nodes.map((node) =>
    tNodeToColumnState(node, wipLimits),
  );

  return {
    columns,
    // Preserve -1 for board-level selection (no column selected)
    colIndex: indices.colIndex,
    // Preserve -1 for column-level selection (no card selected)
    cardIndex: indices.cardIndex,
    subPath: indices.subPath,
    isAtCardLevel: indices.isAtCardLevel,
    isInOutlineMode: indices.isInOutlineMode,
  };
}

/**
 * Derive ONLY the columns from tree state.
 * Use this when you want to memoize columns separately from cursor position.
 *
 * PERFORMANCE: This function rebuilds all column state, so only call it when
 * the tree structure changes (state.nodes reference changes), NOT on cursor moves.
 */
export function deriveColumns(nodes: TNode[]): ColumnState[] {
  const wipLimits = extractWipLimits(nodes);
  return nodes.map((node) => tNodeToColumnState(node, wipLimits));
}

/**
 * Derive ONLY cursor indices from tree state.
 * Use this when you want to react to cursor position changes without
 * rebuilding column structure.
 *
 * PERFORMANCE: This function is called on every cursor move, so it must be fast.
 * - Fast path: O(depth) - just validate cursor path via array indexing
 * - Slow path: O(n) tree search - only used after zoom when tree changes
 */
export function deriveCursorIndices(
  state: TreeBoardState,
): ColumnIndices & { subIndex: number } {
  // FAST PATH: boardReducer keeps cursor valid during normal navigation
  // getNodeAtPath is O(depth), not O(n) - just array indexing
  const nodeAtPath = getNodeAtPath(state.nodes, state.cursor);
  if (nodeAtPath) {
    // Cursor path is valid - use directly, skip expensive tree search
    const indices = pathToColumnIndices(state.cursor);
    const subIndex =
      indices.subPath.length > 0
        ? indices.subPath.reduce((acc, idx) => acc + idx + 1, 0)
        : 0;
    return { ...indices, subIndex };
  }

  // SLOW PATH: Cursor path invalid (happens after zoom when tree structure changes)
  // Fall back to O(n) tree search using cursorNodeId
  if (state.cursorNodeId) {
    const derivedPath = findPathToNode(state.nodes, state.cursorNodeId);
    if (derivedPath) {
      const indices = pathToColumnIndices(derivedPath);
      const subIndex =
        indices.subPath.length > 0
          ? indices.subPath.reduce((acc, idx) => acc + idx + 1, 0)
          : 0;
      return { ...indices, subIndex };
    }
  }

  // Fallback: use cursor as-is even if invalid
  const indices = pathToColumnIndices(state.cursor);
  const subIndex =
    indices.subPath.length > 0
      ? indices.subPath.reduce((acc, idx) => acc + idx + 1, 0)
      : 0;
  return { ...indices, subIndex };
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

// ===== State Conversion =====

/**
 * Convert TUI's initial BoardState to @km/board's BoardState.
 * This is used during the migration to seed the tree-based reducer.
 *
 * @param vault - Vault instance for storage operations
 */
export function tuiStateToTreeState(
  vault: Vault,
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
  const nodes: TNode[] = tuiState.columns.map((col) =>
    columnToTNode(vault, col),
  );

  // Convert cursor from (colIndex, cardIndex) to TPath
  const cursor: number[] =
    tuiState.cardIndex >= 0
      ? [tuiState.colIndex, tuiState.cardIndex]
      : [tuiState.colIndex];

  // Derive cursorNodeId from cursor
  let cursorNodeId: string | null = null;
  if (cursor.length >= 2) {
    // Card level
    const col = tuiState.columns[cursor[0] ?? 0];
    const card = col?.cards[cursor[1] ?? 0];
    cursorNodeId = card?.node.id ?? null;
  } else if (cursor.length === 1) {
    // Column level
    const col = tuiState.columns[cursor[0] ?? 0];
    cursorNodeId = col?.node.id ?? null;
  }

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
    cursorNodeId,
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
    curswantX: 0,
    curswantY: 0,
  };
}

/**
 * Convert a ColumnState to a TNode.
 */
function columnToTNode(vault: Vault, col: ColumnState): TNode {
  return {
    id: col.node.id,
    type: col.node.type,
    parent_id: col.node.parent_id,
    parent_idx: col.node.parent_idx,
    link_to: col.node.link_to ?? null,
    name: col.node.name ?? col.node.title ?? "",
    title: col.node.title ?? "",
    children: col.cards.map((card) => cardToTNode(vault, card)),
    childCount: col.cards.length,
    childrenLoaded: true,
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
 * Uses shallow loading for children to avoid recursive database queries.
 */
function cardToTNode(vault: Vault, card: CardState): TNode {
  return {
    id: card.node.id,
    type: card.node.type,
    parent_id: card.node.parent_id,
    parent_idx: card.node.parent_idx,
    link_to: card.node.link_to ?? null,
    name: card.node.name ?? card.node.title ?? "",
    title: card.node.title ?? "",
    // Use shallow loading to avoid O(n^2) recursive queries
    children: card.children.map((child) =>
      kNodeToTNodeShallow(vault, child, 2),
    ),
    childCount: card.children.length,
    childrenLoaded: true,
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
 * Convert a KNode to a shallow TNode (children not loaded).
 * Use for fast initial load and refresh.
 */
function kNodeToTNodeShallow(vault: Vault, node: KNode, depth: number): TNode {
  return {
    id: node.id,
    type: node.type,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    link_to: node.link_to ?? null,
    name: node.name ?? node.title ?? "",
    title: node.title ?? "",
    children: [],
    childCount: vault.getChildren(node.id).length,
    childrenLoaded: false,
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

/**
 * Convert a KNode to a TNode with children loaded (one level deep).
 * Children are loaded as shallow nodes.
 */
function kNodeToTNodeWithChildren(
  vault: Vault,
  node: KNode,
  depth: number,
): TNode {
  const children = vault.getChildren(node.id);
  return {
    id: node.id,
    type: node.type,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    link_to: node.link_to ?? null,
    name: node.name ?? node.title ?? "",
    title: node.title ?? "",
    children: children.map((child) =>
      kNodeToTNodeShallow(vault, child, depth + 1),
    ),
    childCount: children.length,
    childrenLoaded: true,
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
 * Non-column types that should be filtered out when building board columns.
 * These are content blocks, not navigable column headers.
 * Must stay in sync with buildBoardState in state.ts.
 */
const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"]);

/**
 * Build TNode[] directly from storage.
 *
 * Filters out non-column types (paragraph, code, quote) to prevent content blocks
 * from appearing as columns in the board view. (Fix for km-1tho)
 *
 * @param vault - Vault instance for storage operations
 * @param rootId - Root node ID to load children from (null for root level)
 * @param loadChildren - If true, load children one level deep. If false, shallow load only.
 * @returns TNode[] for immediate children of root (excluding non-column types)
 */
export function buildTreeNodes(
  vault: Vault,
  rootId: string | null,
  loadChildren: boolean = true,
): TNode[] {
  const allChildren = vault.getChildren(rootId);
  // Filter out non-column types (paragraph, code, quote) to match buildBoardState behavior
  const columnNodes = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type));
  return columnNodes.map((node) =>
    loadChildren
      ? kNodeToTNodeWithChildren(vault, node, 0)
      : kNodeToTNodeShallow(vault, node, 0),
  );
}

/**
 * Load children for a node that has childrenLoaded: false.
 * Returns the node with children populated (one level deep).
 *
 * @param vault - Vault instance for storage operations
 * @param node - TNode with childrenLoaded: false
 */
export function loadNodeChildren(vault: Vault, node: TNode): TNode {
  if (node.childrenLoaded) return node;

  const children = vault.getChildren(node.id);
  return {
    ...node,
    children: children.map((child) =>
      kNodeToTNodeShallow(vault, child, node.depth + 1),
    ),
    childCount: children.length,
    childrenLoaded: true,
  };
}

// ===== Re-exports for convenience =====

export { pathToColumnIndices, columnIndicesToPath };
export type { ColumnIndices };
