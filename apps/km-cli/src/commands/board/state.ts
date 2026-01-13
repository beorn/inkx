/**
 * Board State Management
 *
 * Pure functions for managing board state - fully testable
 */

import type { Node } from "@km/core";
import type {
  BoardState,
  ColumnState,
  CardState,
  BoardAction,
} from "./types.ts";
import { STATUS_CYCLE, STATUS_MARKS } from "./types.ts";
import { getChildren, getNode, resolveNode } from "@km/store";
import { emit } from "@km/core";
import { getNodeDisplayName } from "@km/shared";

// Re-export for backwards compatibility
export { getNodeDisplayName };

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
export function initBoardState(rootId?: string): BoardState | null {
  if (rootId) {
    // Use smart resolver to find by ID, path, or filename
    const root = resolveNode(rootId);
    if (!root) {
      return null;
    }
    return buildBoardState(root.id);
  }

  // No root specified - show root-level nodes as columns
  // Group roots by name to avoid duplicate columns
  const roots = getChildren(null);

  if (roots.length === 0) {
    return null;
  }

  // Group roots by display name
  const groups = new Map<string, Node[]>();
  for (const root of roots) {
    const name = getNodeDisplayName(root);
    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name)?.push(root);
  }

  // Build columns from grouped roots
  const columns: ColumnState[] = [];
  for (const [_name, groupRoots] of groups) {
    const colNode = groupRoots[0];
    if (!colNode) continue;

    // Collect all children from all roots in this group
    // Deduplicate by display name to avoid showing the same card multiple times
    const seenNames = new Set<string>();
    const uniqueCardNodes: Node[] = [];
    for (const root of groupRoots) {
      for (const child of getChildren(root.id)) {
        const cardName = getNodeDisplayName(child);
        if (!seenNames.has(cardName)) {
          seenNames.add(cardName);
          uniqueCardNodes.push(child);
        }
      }
    }

    const cards: CardState[] = uniqueCardNodes.map((cardNode) => ({
      node: cardNode,
      children: getChildren(cardNode.id),
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
 * Extract WIP limits from frontmatter columns config
 * Frontmatter format: columns: { column_name: { limit: number } }
 */
function extractWipLimits(rootNode: Node | null): Map<string, number> {
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
 * Build board state from a specific root ID
 */
export function buildBoardState(rootId: string): BoardState {
  const rootNode = getNode(rootId);
  const wipLimits = extractWipLimits(rootNode);
  const columns: ColumnState[] = [];
  const columnNodes = getChildren(rootId);

  for (const colNode of columnNodes) {
    const cardNodes = getChildren(colNode.id);
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: getChildren(cardNode.id),
    }));

    // Look up WIP limit for this column by normalized name
    const colName = getNodeDisplayName(colNode);
    const normalizedName = normalizeColumnName(colName);
    const wipLimit = wipLimits.get(normalizedName);

    columns.push({ node: colNode, cards, wipLimit });
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
    collapsedColumns: new Set(),
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
 * Get the current column (if any)
 */
export function getCurrentColumn(state: BoardState): ColumnState | null {
  return state.columns[state.colIndex] ?? null;
}

/**
 * Handle a key press in normal mode
 * Returns a new state and an action
 */
export function handleKey(
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
          const zoomed = buildBoardState(parentId);
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
    case "h":
    case "\x02": // Ctrl+B
      newState.colIndex = Math.max(0, state.colIndex - 1);
      newState.cardIndex = Math.min(
        state.cardIndex,
        (state.columns[newState.colIndex]?.cards.length || 1) - 1,
      );
      return { state: newState, action: null };

    case "l":
    case "\x06": // Ctrl+F
      newState.colIndex = Math.min(
        state.columns.length - 1,
        state.colIndex + 1,
      );
      newState.cardIndex = Math.min(
        state.cardIndex,
        (state.columns[newState.colIndex]?.cards.length || 1) - 1,
      );
      return { state: newState, action: null };

    // Navigation - up/down cards
    case "k":
    case "\x10": // Ctrl+P
      if (col) {
        newState.cardIndex = Math.max(0, state.cardIndex - 1);
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

    // Jump to top/bottom
    case "g":
      newState.cardIndex = 0;
      return { state: newState, action: null };

    case "G":
      if (col) {
        newState.cardIndex = Math.max(0, col.cards.length - 1);
      }
      return { state: newState, action: null };

    // Zoom into card
    case "\r": // Enter
    case "o":
      if (card && card.children.length > 0 && state.rootId) {
        const zoomed = buildBoardState(card.node.id);
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

    // Cycle status
    case "x":
      cycleStatus(state);
      return { state: newState, action: "refresh" };

    // Priority 1-5
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      setPriority(state, parseInt(key, 10));
      return { state: newState, action: "refresh" };

    // Move card to prev/next column
    case "H":
      if (card && state.colIndex > 0) {
        moveCardToColumn(state, state.colIndex - 1);
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };

    case "L":
      if (card && state.colIndex < state.columns.length - 1) {
        moveCardToColumn(state, state.colIndex + 1);
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };

    // Move card up/down
    case "K":
      if (card && col && state.cardIndex > 0) {
        moveCardInColumn(state, state.cardIndex - 1);
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };

    case "J":
      if (card && col && state.cardIndex < col.cards.length - 1) {
        moveCardInColumn(state, state.cardIndex + 1);
        return { state: newState, action: "refresh" };
      }
      return { state: newState, action: null };

    default:
      return { state: newState, action: null };
  }
}

/**
 * Handle search mode key press
 */
export function handleSearchKey(
  state: BoardState,
  key: string,
): { state: BoardState; exitSearch: boolean } {
  const newState = { ...state };

  if (key === "\x1B" || key === "\r") {
    newState.searchMode = false;
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

/**
 * Get cards to operate on (selected or current)
 */
function getTargetCards(state: BoardState): CardState[] {
  if (state.selectedCards.size > 0) {
    const targets: CardState[] = [];
    for (const col of state.columns) {
      for (const card of col.cards) {
        if (state.selectedCards.has(card.node.id)) {
          targets.push(card);
        }
      }
    }
    return targets;
  }

  const currentCard = getCurrentCard(state);
  return currentCard ? [currentCard] : [];
}

/**
 * Cycle task status for selected cards
 */
function cycleStatus(state: BoardState): void {
  const targets = getTargetCards(state);

  for (const card of targets) {
    const currentStatus = card.node.task_status || "open";
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    const nextMark = STATUS_MARKS[nextStatus];

    emit({
      type: "node_updated",
      actor: "user",
      target: card.node.id,
      data: {
        task_status: nextStatus,
        task_mark: nextMark,
      },
    });
  }
}

/**
 * Set priority for selected cards
 */
function setPriority(state: BoardState, priority: number): void {
  const targets = getTargetCards(state);

  for (const card of targets) {
    emit({
      type: "node_updated",
      actor: "user",
      target: card.node.id,
      data: { priority },
    });
  }
}

/**
 * Move card to a different column
 */
function moveCardToColumn(state: BoardState, targetColIndex: number): void {
  const sourceCol = state.columns[state.colIndex];
  const targetCol = state.columns[targetColIndex];
  const card = sourceCol?.cards[state.cardIndex];

  if (!card || !targetCol) return;

  const lastCard = targetCol.cards[targetCol.cards.length - 1];
  const sortOrder = lastCard ? lastCard.node.parent_idx + 1 : 0;

  emit({
    type: "node_moved",
    actor: "user",
    target: card.node.id,
    data: {
      parent_id: targetCol.node.id,
      parent_idx: sortOrder,
    },
  });
}

/**
 * Move card up/down within column
 */
function moveCardInColumn(state: BoardState, targetIndex: number): void {
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card || !col) return;

  let sortOrder: number;
  if (targetIndex === 0) {
    const first = col.cards[0];
    sortOrder = first ? first.node.parent_idx - 1 : 0;
  } else if (targetIndex >= col.cards.length - 1) {
    const last = col.cards[col.cards.length - 1];
    sortOrder = last ? last.node.parent_idx + 1 : 0;
  } else {
    const prev = col.cards[targetIndex - 1];
    const next = col.cards[targetIndex];
    sortOrder = (prev.node.parent_idx + next.node.parent_idx) / 2;
  }

  emit({
    type: "node_moved",
    actor: "user",
    target: card.node.id,
    data: {
      parent_id: col.node.id,
      parent_idx: sortOrder,
    },
  });
}
