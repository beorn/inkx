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
  ColumnRules,
} from "./types.ts";
import { STATUS_CYCLE, STATUS_MARKS } from "./types.ts";
import { getChildren, getNode, resolveNode, queryNodes } from "@km/store";
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
 * Apply add= rule to pull in matching tasks
 */
function applyAddRule(
  addQuery: string,
  existingCardIds: Set<string>,
): CardState[] {
  const matchingNodes = queryNodes(addQuery, "task");
  const newCards: CardState[] = [];

  for (const node of matchingNodes) {
    // Skip if already in the column
    if (existingCardIds.has(node.id)) continue;

    // Add as a card
    newCards.push({
      node,
      children: getChildren(node.id),
    });
  }

  return newCards;
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
export function buildBoardState(rootId: string): BoardState {
  const rootNode = getNode(rootId);
  const wipLimits = extractWipLimits(rootNode);
  const columns: ColumnState[] = [];
  const collapsedColumns = new Set<number>();

  // Get direct children as columns
  const columnNodes = getChildren(rootId);

  for (let colIdx = 0; colIdx < columnNodes.length; colIdx++) {
    const colNode = columnNodes[colIdx];
    if (!colNode) continue;

    // Use pre-parsed rules from node, fallback to parsing content for compatibility
    const rules = colNode.rules ?? parseColumnRules(colNode.content || "");

    // Get existing cards in the column
    const cardNodes = getChildren(colNode.id);
    const existingCardIds = new Set(cardNodes.map((c) => c.id));
    let cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: getChildren(cardNode.id),
    }));

    // Apply add= rule to pull in matching tasks
    if (rules.add) {
      const additionalCards = applyAddRule(rules.add, existingCardIds);
      cards = [...cards, ...additionalCards];
    }

    // Look up WIP limit (from rules or frontmatter)
    const colName = getNodeDisplayName(colNode);
    const normalizedName = normalizeColumnName(colName);
    const wipLimit = rules.limit ?? wipLimits.get(normalizedName);

    // Track collapsed columns
    if (rules.collapse) {
      collapsedColumns.add(colIdx);
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
    const currentStatus = card.node.task_status || "todo";
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex] ?? "todo";
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
 * Parse sync rule to extract field and value
 * Format: "field:value" (e.g., "status:blocked")
 */
function parseSyncRule(sync: string): { field: string; value: string } | null {
  const match = sync.match(/^(\w+):(.+)$/);
  if (!match) return null;
  return { field: match[1] || "", value: match[2] || "" };
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

  // Move the node
  emit({
    type: "node_moved",
    actor: "user",
    target: card.node.id,
    data: {
      parent_id: targetCol.node.id,
      parent_idx: sortOrder,
    },
  });

  // Apply sync= rule if present on target column
  if (targetCol.rules?.sync) {
    const syncRule = parseSyncRule(targetCol.rules.sync);
    if (syncRule) {
      const fieldName =
        syncRule.field === "status" ? "task_status" : syncRule.field;
      const updateData: Record<string, unknown> = {
        [fieldName]: syncRule.value,
      };

      // Also update task_mark if setting status
      if (fieldName === "task_status") {
        const mark = STATUS_MARKS[syncRule.value as keyof typeof STATUS_MARKS];
        if (mark) {
          updateData.task_mark = mark;
        }
      }

      emit({
        type: "node_updated",
        actor: "user",
        target: card.node.id,
        data: updateData,
      });
    }
  }
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
    if (prev && next) {
      sortOrder = (prev.node.parent_idx + next.node.parent_idx) / 2;
    } else {
      sortOrder = 0;
    }
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
