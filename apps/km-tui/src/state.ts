/**
 * Board State Management
 *
 * Pure functions for managing board state - fully testable
 */

import type { KNode } from "@km/core";

/** Progress yield type for step generators */
type StepYield = string | { current?: number; total?: number };
import type {
  BoardState,
  ColumnState,
  CardState,
  BoardAction,
  ColumnRules,
} from "./types.ts";
import type { Vault } from "./vault-context.tsx";
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  getCollapsedTypeSuffix as getCollapsedTypeSuffixBase,
  getParentContext as getParentContextBase,
  extractBody,
} from "@km/tree";

// Note: Card position tracking is now handled via LayoutContext in board-actions.ts
// The handleKey function below is legacy code - keys are handled via the command system

// Bound versions that inject vault dependencies
// These are the primary exports for TUI components
export const getNodeDisplayName = (
  vault: Vault,
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => getNodeDisplayNameBase(node, (id) => vault.getChildren(id));
export const getCollapsedTypeSuffix = (
  vault: Vault,
  node: Parameters<typeof getCollapsedTypeSuffixBase>[0],
) => getCollapsedTypeSuffixBase(node, (id) => vault.getChildren(id));
export const getParentContext = (
  vault: Vault,
  node: Parameters<typeof getParentContextBase>[0],
  skipParentId?: string | null,
) => getParentContextBase(node, skipParentId, (id) => vault.getNode(id));

/**
 * Create an empty board state
 */
export function createEmptyState(): BoardState {
  return {
    rootId: null,
    rootPath: null,
    columns: [],
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Initialize board state from a root node ID, path, or filename
 * Returns null if no suitable board found
 */
export function initBoardState(
  vault: Vault,
  rootId?: string,
): BoardState | null {
  if (rootId) {
    // Use vault.getNode for ID lookup (caller should resolve path/filename before calling)
    const root = vault.getNode(rootId);
    if (!root) {
      return null;
    }
    return buildBoardState(vault, root.id);
  }

  // No root specified - show root-level nodes as columns
  // Group roots by name to avoid duplicate columns
  const roots = vault.getChildren(null);

  if (roots.length === 0) {
    return null;
  }

  // Group roots by display name
  const groups = new Map<string, KNode[]>();
  for (const root of roots) {
    const name = getNodeDisplayName(vault, root);
    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name)?.push(root);
  }

  // First pass: collect all unique card nodes and their IDs
  const allCardIds: string[] = [];
  const columnData: Array<{ colNode: KNode; cardNodes: KNode[] }> = [];

  for (const [_name, groupRoots] of groups) {
    const colNode = groupRoots[0];
    if (!colNode) continue;

    // Collect all children from all roots in this group
    // Deduplicate by display name to avoid showing the same card multiple times
    const seenNames = new Set<string>();
    const uniqueCardNodes: KNode[] = [];
    for (const root of groupRoots) {
      for (const child of vault.getChildren(root.id)) {
        const cardName = getNodeDisplayName(vault, child);
        if (!seenNames.has(cardName)) {
          seenNames.add(cardName);
          uniqueCardNodes.push(child);
          allCardIds.push(child.id);
        }
      }
    }

    columnData.push({ colNode, cardNodes: uniqueCardNodes });
  }

  // Batch query for child counts using rawQuery
  const childCounts = vault.getChildCounts(allCardIds);

  // Second pass: build columns with pre-fetched child counts
  const columns: ColumnState[] = [];
  for (const { colNode, cardNodes } of columnData) {
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: [], // Don't load grandchildren eagerly (lazy loading)
      childCount: childCounts.get(cardNode.id) ?? 0,
    }));
    columns.push({ node: colNode, cards });
  }

  return {
    rootId: null, // null means "root level"
    rootPath: null,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Generator version of initBoardState that yields progress
 * Use this for loading screens to allow event loop updates between yields
 */
export function* initBoardStateGenerator(
  vault: Vault,
  rootId?: string,
): Generator<StepYield, BoardState | null, unknown> {
  if (rootId) {
    // Use vault.getNode for ID lookup (caller should resolve path/filename before calling)
    const root = vault.getNode(rootId);
    if (!root) {
      return null;
    }
    // Delegate to generator version of buildBoardState
    return yield* buildBoardStateGenerator(vault, root.id);
  }

  // No root specified - show root-level nodes as columns
  const roots = vault.getChildren(null);
  if (roots.length === 0) {
    return null;
  }

  // Group roots by display name
  const groups = new Map<string, KNode[]>();
  for (const root of roots) {
    const name = getNodeDisplayName(vault, root);
    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name)?.push(root);
  }

  // First pass: collect all unique card nodes and their IDs
  const allCardIds: string[] = [];
  const columnData: Array<{ colNode: KNode; cardNodes: KNode[] }> = [];
  const total = groups.size;
  let current = 0;

  yield "Building view";
  yield { current: 0, total };

  for (const [_name, groupRoots] of groups) {
    const colNode = groupRoots[0];
    if (!colNode) continue;

    // Collect all children from all roots in this group
    const seenNames = new Set<string>();
    const uniqueCardNodes: KNode[] = [];
    for (const root of groupRoots) {
      for (const child of vault.getChildren(root.id)) {
        const cardName = getNodeDisplayName(vault, child);
        if (!seenNames.has(cardName)) {
          seenNames.add(cardName);
          uniqueCardNodes.push(child);
          allCardIds.push(child.id);
        }
      }
    }

    columnData.push({ colNode, cardNodes: uniqueCardNodes });
    current++;
    yield { current, total };
  }

  // Single batch query for all child counts
  const childCounts = vault.getChildCounts(allCardIds);

  // Second pass: build columns with pre-fetched child counts
  const columns: ColumnState[] = [];
  for (const { colNode, cardNodes } of columnData) {
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: [],
      childCount: childCounts.get(cardNode.id) ?? 0,
    }));
    columns.push({ node: colNode, cards });
  }

  return {
    rootId: null,
    rootPath: null,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Generator version of buildBoardState that yields progress
 */
export function* buildBoardStateGenerator(
  vault: Vault,
  rootId: string,
): Generator<StepYield, BoardState, unknown> {
  const rootNode = vault.getNode(rootId);
  const wipLimits = extractWipLimits(rootNode);
  const collapsedColumns = new Set<number>();

  // Get direct children and split into body content vs structural items
  const allChildren = vault.getChildren(rootId);
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren);

  const total = columnNodes.length + (bodyNodes.length > 0 ? 1 : 0);
  yield "Building view";
  yield { current: 0, total };

  // Batch query child counts for all columns
  const columnIds = columnNodes.map((n) => n.id);
  const columnChildCounts = vault.getChildCounts(columnIds);

  // First pass: collect all card IDs
  const columnCardNodes: KNode[][] = [];
  const allCardIds: string[] = [];

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx];
    if (!colNode) continue;

    const colChildCount = columnChildCounts.get(colNode.id) ?? 0;
    if (colChildCount === 0) {
      columnCardNodes[colIdx] = [];
      continue;
    }

    const cardNodes = vault.getChildren(colNode.id);
    columnCardNodes[colIdx] = cardNodes;

    for (const cardNode of cardNodes) {
      allCardIds.push(cardNode.id);
    }

    // Yield progress after each column
    yield { current: colIdx + 1, total };
  }

  // Single batch query for all child counts
  const childCounts = vault.getChildCounts(allCardIds);

  // Second pass: build columns with pre-fetched child counts
  const columns: ColumnState[] = [];

  // Add virtual body column if there's leading content
  if (bodyNodes.length > 0) {
    const bodyCards: CardState[] = bodyNodes.map((node) => ({
      node,
      children: [],
      childCount: 0,
    }));
    columns.push({
      node: createVirtualBodyNode(rootId),
      cards: bodyCards,
      isVirtual: true,
    });
  }

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx];
    if (!colNode) continue;

    const cardNodes = columnCardNodes[colIdx] ?? [];
    const rules = colNode.rules ?? parseColumnRules(colNode.content || "");

    // Extract body content within column (tasks/paragraphs before subsections)
    const { body: colBodyNodes, items: structuralCards } =
      extractBody(cardNodes);

    const cards: CardState[] = [];

    // If there are structural children, body content becomes virtual body cards
    if (structuralCards.length > 0) {
      // Add body cards first (virtual, displayed differently)
      for (const bodyNode of colBodyNodes) {
        cards.push({
          node: bodyNode,
          children: [],
          childCount: childCounts.get(bodyNode.id) ?? 0,
          isVirtual: true,
        });
      }
      // Then add structural cards
      for (const cardNode of structuralCards) {
        cards.push({
          node: cardNode,
          children: [],
          childCount: childCounts.get(cardNode.id) ?? 0,
        });
      }
    } else {
      // No structural children - all items are regular cards (no body)
      for (const cardNode of cardNodes) {
        cards.push({
          node: cardNode,
          children: [],
          childCount: childCounts.get(cardNode.id) ?? 0,
        });
      }
    }

    const colName = getNodeDisplayName(vault, colNode);
    const normalizedName = normalizeColumnName(colName);
    const wipLimit = rules.limit ?? wipLimits.get(normalizedName);

    // Track collapsed columns (offset by body column if present)
    const actualColIdx = colIdx + (bodyNodes.length > 0 ? 1 : 0);
    if (rules.collapse) {
      collapsedColumns.add(actualColIdx);
    }

    columns.push({ node: colNode, cards, wipLimit, rules });
  }

  return {
    rootId,
    rootPath: null,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns,
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Create a virtual node for the body column.
 * This node represents leading non-section content grouped for display.
 */
function createVirtualBodyNode(parentId: string): KNode {
  const now = Date.now();
  return {
    id: `__body__${parentId}`,
    type: "section",
    parent_id: parentId,
    parent_idx: 0,
    title: "Description",
    content: "",
    data: {},
    link_to: null,
    created_at: now,
    updated_at: now,
    version: "",
  };
}

/**
 * Extract WIP limits from frontmatter columns config
 * Frontmatter format: columns: { column_name: { limit: number } }
 */
function extractWipLimits(rootNode: KNode | null): Map<string, number> {
  const limits = new Map<string, number>();
  if (!rootNode?.data?.columns) return limits;

  const columnsConfig = rootNode.data.columns as Record<
    string,
    { limit?: number }
  >;
  for (const [colName, config] of Object.entries(columnsConfig)) {
    if (typeof config?.limit === "number" && config.limit > 0) {
      // Normalize column name: lowercase, replace spaces with underscores
      const normalizedName = colName.toLowerCase().replace(/\s+/g, "_");
      limits.set(normalizedName, config.limit);
    }
  }
  return limits;
}

/**
 * Normalize column name for WIP limit lookup
 * Matches frontmatter keys like "in_progress" to column names like "In Progress"
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Parse column rules from heading content
 * Format: "## Column Name add=\"query\" sync=field:value collapse=true limit=3"
 */
export function parseColumnRules(content: string): ColumnRules {
  const rules: ColumnRules = {};

  // Parse add="query"
  const addMatch = content.match(/\badd=["']([^"']+)["']/);
  if (addMatch) {
    rules.add = addMatch[1];
  }

  // Parse sync=field:value (no quotes needed for simple values)
  const syncMatch = content.match(/\bsync=["']?([^\s"']+)["']?/);
  if (syncMatch) {
    rules.sync = syncMatch[1];
  }

  // Parse collapse=true
  if (/\bcollapse=true\b/i.test(content)) {
    rules.collapse = true;
  }

  // Parse limit=N
  const limitMatch = content.match(/\blimit=(\d+)/);
  if (limitMatch) {
    rules.limit = parseInt(limitMatch[1] || "0", 10);
  }

  // Parse default=true
  if (/\bdefault=true\b/i.test(content)) {
    rules.default = true;
  }

  return rules;
}

/**
 * Build board state from a specific root ID
 *
 * Board hierarchy:
 * - Root node's children become columns
 * - Each column's children become cards
 *
 * For markdown files, the parser merges the H1 into the file node,
 * so H2 sections are direct children of the file node (columns).
 */
export function buildBoardState(vault: Vault, rootId: string): BoardState {
  const rootNode = vault.getNode(rootId);
  const wipLimits = extractWipLimits(rootNode);
  const collapsedColumns = new Set<number>();

  // Get direct children and split into body content vs structural items
  const allChildren = vault.getChildren(rootId);
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren);

  // PERFORMANCE OPTIMIZATION: Batch query child counts for all columns FIRST
  // This lets us skip getChildren() calls for columns with 0 children.
  // For flat boards like @issue with 766 files, this reduces 766 queries to 1.
  const columnIds = columnNodes.map((n) => n.id);
  const columnChildCounts = vault.getChildCounts(columnIds);

  // First pass: collect all card IDs across all columns for batch child count query
  // Note: getChildren() now includes query:add links from storage layer,
  // so we don't need to evaluate add= rules here at display time.
  const columnCardNodes: KNode[][] = [];
  const allCardIds: string[] = [];

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx];
    if (!colNode) continue;

    // OPTIMIZATION: Skip getChildren() for columns with no children
    const colChildCount = columnChildCounts.get(colNode.id) ?? 0;
    if (colChildCount === 0) {
      columnCardNodes[colIdx] = [];
      continue;
    }

    // getChildren includes both direct children AND linked children from add= rules
    const cardNodes = vault.getChildren(colNode.id);
    columnCardNodes[colIdx] = cardNodes;

    // Collect IDs for batch query
    for (const cardNode of cardNodes) {
      allCardIds.push(cardNode.id);
    }
  }

  // Single batch query for all child counts - avoids N+1 problem
  const childCounts = vault.getChildCounts(allCardIds);

  // Second pass: build columns with the pre-fetched child counts
  const columns: ColumnState[] = [];

  // Add virtual body column if there's leading content
  if (bodyNodes.length > 0) {
    const bodyCards: CardState[] = bodyNodes.map((node) => ({
      node,
      children: [],
      childCount: 0,
    }));
    columns.push({
      node: createVirtualBodyNode(rootId),
      cards: bodyCards,
      isVirtual: true,
    });
  }

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx];
    if (!colNode) continue;

    const cardNodes = columnCardNodes[colIdx] ?? [];
    const rules = colNode.rules ?? parseColumnRules(colNode.content || "");

    // Build cards with pre-fetched child counts
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: [], // Don't load grandchildren eagerly - blocks event loop
      childCount: childCounts.get(cardNode.id) ?? 0,
    }));

    // Look up WIP limit (from rules or frontmatter)
    const colName = getNodeDisplayName(vault, colNode);
    const normalizedName = normalizeColumnName(colName);
    const wipLimit = rules.limit ?? wipLimits.get(normalizedName);

    // Track collapsed columns (offset by body column if present)
    const actualColIdx = colIdx + (bodyNodes.length > 0 ? 1 : 0);
    if (rules.collapse) {
      collapsedColumns.add(actualColIdx);
    }

    columns.push({ node: colNode, cards, wipLimit, rules });
  }

  return {
    rootId,
    rootPath: null, // Will be set by caller if needed
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    collapsedColumns,
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Get the current card (if any)
 */
export function getCurrentCard(state: BoardState): CardState | null {
  const col = state.columns[state.colIndex];
  return col?.cards[state.cardIndex] ?? null;
}

/**
 * Find the index of the first non-virtual card in a column.
 * Virtual body cards are at the start; this returns the first real card.
 * Returns 0 if no virtual cards, or cards.length if all are virtual.
 */
function getFirstRealCardIndex(col: ColumnState | null): number {
  if (!col) return 0;
  for (let i = 0; i < col.cards.length; i++) {
    if (!col.cards[i]?.isVirtual) return i;
  }
  return col.cards.length; // All virtual (shouldn't happen in practice)
}

/**
 * Get the current column (if any)
 */
export function getCurrentColumn(state: BoardState): ColumnState | null {
  return state.columns[state.colIndex] ?? null;
}

/**
 * Handle a key press in normal mode
 * Returns a new state and an action
 *
 * NOTE: This is legacy code. Keys are now handled via command system in board-actions.ts.
 * This function is kept for test compatibility.
 */
export function handleKey(
  vault: Vault,
  state: BoardState,
  key: string,
): { state: BoardState; action: BoardAction } {
  // Clone state for immutability
  const newState = { ...state };
  const col = getCurrentColumn(state);
  const card = getCurrentCard(state);

  switch (key) {
    // Quit / zoom out
    case "q":
    case "\x1B": // Escape
      if (state.zoomStack.length > 0) {
        const parentId = state.zoomStack[state.zoomStack.length - 1];
        if (parentId) {
          const zoomed = buildBoardState(vault, parentId);
          zoomed.zoomStack = state.zoomStack.slice(0, -1);
          return { state: zoomed, action: null };
        }
      }
      return { state: newState, action: "quit" };

    // Help
    case "?":
      newState.helpMode = true;
      return { state: newState, action: null };

    // Search
    case "/":
      newState.searchMode = true;
      newState.searchQuery = "";
      return { state: newState, action: null };

    // Navigation - left/right columns
    // NOTE: This is legacy code. Keys are now handled via command system in board-actions.ts
    // which uses LayoutContext for sticky Y position tracking.
    case "h":
    case "\x02": {
      // Ctrl+B - skip virtual columns
      let targetColIndex = state.colIndex - 1;
      while (targetColIndex >= 0 && state.columns[targetColIndex]?.isVirtual) {
        targetColIndex--;
      }
      if (targetColIndex < 0 || targetColIndex === state.colIndex) {
        return { state: newState, action: null };
      }
      newState.colIndex = targetColIndex;
      const targetCol = state.columns[targetColIndex];
      if (targetCol && targetCol.cards.length > 0) {
        // Ensure we land on a non-virtual card
        const firstReal = getFirstRealCardIndex(targetCol);
        newState.cardIndex = Math.max(
          firstReal,
          Math.min(state.cardIndex, targetCol.cards.length - 1),
        );
      } else {
        newState.cardIndex = 0;
      }
      return { state: newState, action: null };
    }

    case "l":
    case "\x06": {
      // Ctrl+F - skip virtual columns
      let targetColIndex = state.colIndex + 1;
      while (
        targetColIndex < state.columns.length &&
        state.columns[targetColIndex]?.isVirtual
      ) {
        targetColIndex++;
      }
      if (
        targetColIndex >= state.columns.length ||
        targetColIndex === state.colIndex
      ) {
        return { state: newState, action: null };
      }
      newState.colIndex = targetColIndex;
      const targetCol = state.columns[targetColIndex];
      if (targetCol && targetCol.cards.length > 0) {
        // Ensure we land on a non-virtual card
        const firstReal = getFirstRealCardIndex(targetCol);
        newState.cardIndex = Math.max(
          firstReal,
          Math.min(state.cardIndex, targetCol.cards.length - 1),
        );
      } else {
        newState.cardIndex = 0;
      }
      return { state: newState, action: null };
    }

    // Navigation - up/down cards (skip virtual body cards)
    case "k":
    case "\x10": // Ctrl+P
      if (col) {
        const firstReal = getFirstRealCardIndex(col);
        newState.cardIndex = Math.max(firstReal, state.cardIndex - 1);
        if (state.visualMode) {
          const newCard = col.cards[newState.cardIndex];
          if (newCard) {
            newState.selectedCards = new Set(state.selectedCards);
            newState.selectedCards.add(newCard.node.id);
          }
        }
      }
      return { state: newState, action: null };

    case "j":
    case "\x0E": // Ctrl+N
      if (col) {
        newState.cardIndex = Math.min(
          col.cards.length - 1,
          state.cardIndex + 1,
        );
        if (state.visualMode) {
          const newCard = col.cards[newState.cardIndex];
          if (newCard) {
            newState.selectedCards = new Set(state.selectedCards);
            newState.selectedCards.add(newCard.node.id);
          }
        }
      }
      return { state: newState, action: null };

    // Jump to top/bottom (skip virtual body cards)
    case "g":
      if (col) {
        newState.cardIndex = getFirstRealCardIndex(col);
      } else {
        newState.cardIndex = 0;
      }
      return { state: newState, action: null };

    case "G":
      if (col) {
        newState.cardIndex = Math.max(0, col.cards.length - 1);
      }
      return { state: newState, action: null };

    // Zoom into card
    case "\r": // Enter
    case "o":
      // Use childCount for hasChildren check (children array may be empty due to lazy loading)
      if (
        card &&
        (card.childCount ?? card.children.length) > 0 &&
        state.rootId
      ) {
        const zoomed = buildBoardState(vault, card.node.id);
        zoomed.zoomStack = [...state.zoomStack, state.rootId];
        return { state: zoomed, action: null };
      }
      return { state: newState, action: null };

    // Fold/unfold card
    case "\t": // Tab
      if (card) {
        newState.foldedCards = new Set(state.foldedCards);
        if (state.foldedCards.has(card.node.id)) {
          newState.foldedCards.delete(card.node.id);
        } else {
          newState.foldedCards.add(card.node.id);
        }
      }
      return { state: newState, action: null };

    // Toggle column collapse (show count only)
    case "c":
      newState.collapsedColumns = new Set(state.collapsedColumns);
      if (state.collapsedColumns.has(state.colIndex)) {
        newState.collapsedColumns.delete(state.colIndex);
      } else {
        newState.collapsedColumns.add(state.colIndex);
      }
      return { state: newState, action: null };

    // Visual mode
    case "v":
      newState.visualMode = !state.visualMode;
      newState.selectedCards = new Set();
      if (newState.visualMode && card) {
        newState.selectedCards.add(card.node.id);
      }
      return { state: newState, action: null };

    // Toggle selection
    case " ":
      if (card) {
        newState.selectedCards = new Set(state.selectedCards);
        if (state.selectedCards.has(card.node.id)) {
          newState.selectedCards.delete(card.node.id);
        } else {
          newState.selectedCards.add(card.node.id);
        }
      }
      return { state: newState, action: null };

    // Cycle status for current card and all selected cards
    case "x": {
      const cycle = ["todo", "wip", "blocked", "done", "dropped"] as const;
      const getNextStatus = (currentStatus: string | null | undefined) => {
        const idx = cycle.indexOf(
          (currentStatus ?? "todo") as (typeof cycle)[number],
        );
        return cycle[(idx >= 0 ? idx + 1 : 1) % cycle.length];
      };

      // Get cards to update: selected cards + current card
      const cardsToUpdate = new Set<string>();
      if (card) cardsToUpdate.add(card.node.id);
      for (const cardId of state.selectedCards) {
        cardsToUpdate.add(cardId);
      }

      // Update all cards
      for (const cardId of cardsToUpdate) {
        const node = vault.getNode(cardId);
        if (node) {
          vault.updateNode(cardId, {
            task_status: getNextStatus(node.task_status),
          });
        }
      }
      return { state: newState, action: "refresh" };
    }

    // Move card to prev/next column
    case "H": {
      if (card && state.colIndex > 0) {
        const targetCol = state.columns[state.colIndex - 1];
        if (targetCol) {
          // Calculate new parent_idx at end of target column
          const lastCard = targetCol.cards[targetCol.cards.length - 1];
          const newIdx = lastCard ? (lastCard.node.parent_idx ?? 0) + 1 : 0;
          vault.moveNode(card.node.id, targetCol.node.id, newIdx);
        }
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };
    }

    case "L": {
      if (card && state.colIndex < state.columns.length - 1) {
        const targetCol = state.columns[state.colIndex + 1];
        if (targetCol) {
          // Calculate new parent_idx at end of target column
          const lastCard = targetCol.cards[targetCol.cards.length - 1];
          const newIdx = lastCard ? (lastCard.node.parent_idx ?? 0) + 1 : 0;
          vault.moveNode(card.node.id, targetCol.node.id, newIdx);
        }
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };
    }

    // Move card up/down
    case "K": {
      if (card && col && state.cardIndex > 0) {
        const targetCard = col.cards[state.cardIndex - 1];
        if (targetCard) {
          // Move before target (subtract small amount from its idx)
          const newIdx = (targetCard.node.parent_idx ?? 0) - 0.001;
          vault.moveNode(card.node.id, col.node.id, newIdx);
        }
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };
    }

    case "J": {
      if (card && col && state.cardIndex < col.cards.length - 1) {
        const targetCard = col.cards[state.cardIndex + 1];
        if (targetCard) {
          // Move after target (add small amount to its idx)
          const newIdx = (targetCard.node.parent_idx ?? 0) + 0.001;
          vault.moveNode(card.node.id, col.node.id, newIdx);
        }
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };
    }

    default:
      return { state: newState, action: null };
  }
}

/**
 * Check if search has any visible matches
 */
function hasSearchMatches(state: BoardState): boolean {
  if (!state.searchQuery) return true; // Empty query matches all

  const query = state.searchQuery.toLowerCase();
  for (const col of state.columns) {
    for (const card of col.cards) {
      const content = card.node.content?.toLowerCase() ?? "";
      if (content.includes(query)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Handle search mode key press
 *
 * Returns:
 * - exitSearch: true if search mode should end
 * - createTask: if set, contains the text for a new task to create (NV-style)
 */
export function handleSearchKey(
  state: BoardState,
  key: string,
): { state: BoardState; exitSearch: boolean; createTask?: string } {
  const newState = { ...state };

  // Escape - cancel search without action
  if (key === "\x1B") {
    newState.searchMode = false;
    return { state: newState, exitSearch: true };
  }

  // Enter - if no matches and query exists, create new task (NV-style)
  if (key === "\r") {
    newState.searchMode = false;
    if (state.searchQuery && !hasSearchMatches(state)) {
      return {
        state: newState,
        exitSearch: true,
        createTask: state.searchQuery,
      };
    }
    return { state: newState, exitSearch: true };
  }

  if (key === "\x7F") {
    newState.searchQuery = state.searchQuery.slice(0, -1);
    return { state: newState, exitSearch: false };
  }

  if (key.length === 1 && key >= " ") {
    newState.searchQuery = state.searchQuery + key;
  }

  return { state: newState, exitSearch: false };
}
