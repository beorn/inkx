/**
 * TUI2 App Container
 *
 * Top-level component that:
 * - Connects to the store (side effects)
 * - Manages keyboard input
 * - Transforms state to view models
 * - Renders the appropriate view
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import type { EventEmitter } from "events";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useBoardState, createInitialBoardState } from "./hooks/index.ts";
import { toBoardViewModel } from "@km/tui-core";
import { CardsView, ListView, ColumnsView, TabsView } from "./views/index.ts";
import {
  DetailPane,
  Header,
  HelpOverlay,
  NewItemDialog,
  ProjectPicker,
  SearchInput,
  StatusBar,
} from "./components/index.ts";
import {
  updateNode,
  deleteNode,
  getNode,
  getAncestors,
  getChildren,
  resolveNode,
  getStore,
  getBacklinks,
  getOutgoingLinks,
} from "@km/store";

// Default favorites mapping (1-9 keys to @refs)
const DEFAULT_FAVORITES: Record<string, string> = {
  "1": "@inbox",
  "2": "@next",
  "3": "@waiting",
  "4": "@someday",
  "5": "@projects",
  "6": "@areas",
  "7": "@archive",
  "8": "@reference",
  "9": "@goals",
};

// Shift+number sends these characters (!@#$%^&*()
const SHIFT_NUMBER_MAP: Record<string, number> = {
  "!": 0,
  "@": 1,
  "#": 2,
  $: 3,
  "%": 4,
  "^": 5,
  "&": 6,
  "*": 7,
  "(": 8,
};
import { getNodeDisplayName } from "@km/shared";
import type { Node } from "@km/core";
import type {
  ViewMode,
  ColumnState,
  CardState,
  TaskStatus,
  TreeNodeState,
} from "./types.ts";

// Task status cycle order for Space key
const STATUS_CYCLE: TaskStatus[] = ["todo", "wip", "done", "dropped"];

/**
 * Get next status in cycle
 */
function getNextStatus(current: TaskStatus | undefined): TaskStatus {
  const currentStatus: TaskStatus = current || "todo";
  const currentIdx = STATUS_CYCLE.indexOf(currentStatus);
  const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
  return nextStatus ?? "todo";
}

/**
 * Get the source file path and line number for a node.
 * Traverses ancestors to find the file containing this node.
 */
function getNodeSourceInfo(nodeId: string): {
  filePath: string | null;
  line: number | null;
} {
  const node = getNode(nodeId);
  if (!node) {
    return { filePath: null, line: null };
  }

  // If this node has fs_path, it's a file/folder itself
  if (node.fs_path) {
    return { filePath: node.fs_path, line: node.md_line ?? null };
  }

  // Otherwise traverse ancestors to find the containing file
  const ancestors = getAncestors(nodeId);
  for (const ancestor of ancestors.reverse()) {
    if (ancestor.fs_path) {
      // Found the containing file - return its path with the node's line number
      return { filePath: ancestor.fs_path, line: node.md_line ?? null };
    }
  }

  return { filePath: null, line: null };
}

/**
 * Open a file in the user's $EDITOR.
 * If line is provided, opens at that line (1-indexed for editors).
 */
function openInEditor(filePath: string, line?: number | null): void {
  const editor = process.env.EDITOR || "vi";

  // Build args - most editors support +LINE syntax
  const args: string[] = [];
  if (line !== null && line !== undefined) {
    // md_line is 0-indexed, editors expect 1-indexed
    args.push(`+${line + 1}`);
  }
  args.push(filePath);

  // Use Bun.spawnSync with inherited stdio so editor takes over terminal
  Bun.spawnSync([editor, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

/**
 * Convert Node to CardState
 */
function nodeToCardState(node: Node): CardState {
  const children = getChildren(node.id);

  // Get backlinks count
  const backlinks = getBacklinks(node.id);
  const hasBacklinks = backlinks.length > 0;

  // Get outgoing links count (refs)
  const outgoingLinks = getOutgoingLinks(node.id);
  const refsCount = outgoingLinks.length > 0 ? outgoingLinks.length : undefined;

  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    childCount: children.length,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as CardState["taskStatus"],
    color: node.rules?.color,
    icon: undefined,
    // Rich task display fields
    priority: node.priority,
    dueDate: node.due_date,
    hasBacklinks: hasBacklinks || undefined,
    refsCount,
    content: node.content,
  };
}

/**
 * Convert Node to ColumnState
 */
function nodeToColumnState(node: Node): ColumnState {
  const children = getChildren(node.id);
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    cards: children.map(nodeToCardState),
    wipLimit: undefined,
  };
}

/**
 * Build columns from root node
 */
function buildColumns(rootId: string | null): ColumnState[] {
  if (!rootId) {
    const roots = getChildren(null);
    if (roots.length === 0) {
      return [];
    }
    return roots.map(nodeToColumnState);
  }

  const node = getNode(rootId);
  if (!node) {
    return [];
  }

  const children = getChildren(node.id);
  return children.map(nodeToColumnState);
}

interface AppProps {
  initialColumns: ColumnState[];
  rootId?: string | null;
  rootPath?: string | null;
  initialViewMode?: ViewMode;
  /** Event emitter for external refresh signals (from file watcher) */
  refreshEmitter?: EventEmitter;
  /** Callback to properly exit the app (allows renderer cleanup) */
  onExit?: () => void;
}

const VIEW_MODES: ViewMode[] = ["cards", "list", "columns", "tabs"];

export function App({
  initialColumns,
  rootId = null,
  rootPath = null,
  initialViewMode = "cards",
  refreshEmitter,
  onExit,
}: AppProps) {
  // Exit helper - uses onExit callback if provided, otherwise falls back to process.exit
  const exitApp = useCallback(() => {
    if (onExit) {
      onExit();
    } else {
      process.exit(0);
    }
  }, [onExit]);
  const { width, height } = useTerminalDimensions();
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // Initialize board state
  const initialState = useMemo(
    () => createInitialBoardState(initialColumns, rootId, rootPath),
    [], // Only compute once
  );

  const board = useBoardState(initialState);

  // Transform state to view model
  const viewModel = useMemo(
    () => toBoardViewModel(board.state, viewMode),
    [board.state, viewMode],
  );

  // Refresh board data from store
  const refreshBoard = useCallback(() => {
    const columns = buildColumns(board.state.rootId);
    if (columns.length > 0) {
      board.dispatch({ type: "REFRESH", columns });
    }
  }, [board]);

  // Subscribe to external refresh events (filesystem changes)
  useEffect(() => {
    if (!refreshEmitter) return;

    const handleRefresh = () => {
      refreshBoard();
    };

    refreshEmitter.on("refresh", handleRefresh);
    return () => {
      refreshEmitter.off("refresh", handleRefresh);
    };
  }, [refreshEmitter, refreshBoard]);

  // Navigate to a new root node (pushes to history)
  const navigateToRoot = useCallback(
    (newRootId: string | null) => {
      const newColumns = buildColumns(newRootId);
      // Get root path from node if available
      const node = newRootId ? getNode(newRootId) : null;
      const newRootPath = node?.fs_path ?? null;
      board.dispatch({
        type: "NAV_TO",
        rootId: newRootId,
        columns: newColumns,
        rootPath: newRootPath,
      });
    },
    [board],
  );

  // Handle keyboard input
  // Note: KeyEvent from OpenTUI uses `name` for key identification, not `key`
  // Alt key is accessed via `meta` property in OpenTUI KeyEvent
  useKeyboard(({ name, shift, meta }) => {
    // ===== Help Mode =====
    // When help overlay is shown, only ? and Escape dismiss it
    if (board.state.helpMode) {
      if (name === "escape" || name === "?" || (name === "/" && shift)) {
        board.dispatch({ type: "TOGGLE_HELP_MODE" });
      }
      // Ignore all other keys when help is shown
      return;
    }

    // ===== Search Mode Input =====
    // When in search mode, capture character input for the search query
    if (board.state.searchMode) {
      // Escape - cancel search, clear query, exit search mode
      if (name === "escape") {
        board.dispatch({ type: "SET_SEARCH_QUERY", query: "" });
        board.dispatch({ type: "TOGGLE_SEARCH_MODE" });
        return;
      }

      // Enter/Return - confirm search, exit search mode but keep query
      if (name === "return") {
        board.dispatch({ type: "TOGGLE_SEARCH_MODE" });
        return;
      }

      // Backspace - remove last character from query
      if (name === "backspace") {
        const currentQuery = board.state.searchQuery;
        if (currentQuery.length > 0) {
          board.dispatch({
            type: "SET_SEARCH_QUERY",
            query: currentQuery.slice(0, -1),
          });
        }
        return;
      }

      // Character input (a-z, 0-9, space, and common punctuation)
      // Single character names that aren't special keys get appended to query
      if (name.length === 1 && !meta) {
        board.dispatch({
          type: "SET_SEARCH_QUERY",
          query: board.state.searchQuery + name,
        });
        return;
      }

      // Ignore all other keys in search mode
      return;
    }

    // ===== New Item Mode Input =====
    // When in new item mode, capture character input for the new task title
    if (board.state.newItemMode) {
      // Escape - cancel new item, clear text, exit new item mode
      if (name === "escape") {
        board.dispatch({ type: "CLEAR_NEW_ITEM" });
        return;
      }

      // Enter/Return - create the new task
      if (name === "return") {
        const text = board.state.newItemText.trim();
        if (text && board.currentColumn) {
          // Get the current column's node to find the file to append to
          const columnNode = getNode(board.currentColumn.nodeId);
          if (columnNode) {
            // Find the file path for this column
            let filePath: string | null = null;
            if (columnNode.fs_path && columnNode.type === "file") {
              filePath = columnNode.fs_path;
            } else {
              // Traverse ancestors to find the containing file
              const ancestors = getAncestors(board.currentColumn.nodeId);
              for (const ancestor of ancestors.reverse()) {
                if (ancestor.fs_path && ancestor.type === "file") {
                  filePath = ancestor.fs_path;
                  break;
                }
              }
            }

            if (filePath) {
              // Append the new task to the file
              const store = getStore();
              store.appendTaskToFile(filePath, `\n- [ ] ${text}`);
              // Refresh to show the new task
              refreshBoard();
            }
          }
        }
        board.dispatch({ type: "CLEAR_NEW_ITEM" });
        return;
      }

      // Backspace - remove last character from text
      if (name === "backspace") {
        const currentText = board.state.newItemText;
        if (currentText.length > 0) {
          board.dispatch({
            type: "SET_NEW_ITEM_TEXT",
            text: currentText.slice(0, -1),
          });
        }
        return;
      }

      // Character input (a-z, 0-9, space, and common punctuation)
      // Single character names that aren't special keys get appended to text
      if (name.length === 1 && !meta) {
        board.dispatch({
          type: "SET_NEW_ITEM_TEXT",
          text: board.state.newItemText + name,
        });
        return;
      }

      // Ignore all other keys in new item mode
      return;
    }

    // ===== Project Picker Mode =====
    // When project picker is open, handle navigation and selection
    if (board.state.projectPickerOpen) {
      // Get filtered projects for index bounds
      const allProjects = getChildren(null).map((node) => ({
        id: node.id,
        title: getNodeDisplayName(node),
        itemCount: getChildren(node.id).length,
      }));
      const query = board.state.projectPickerQuery;
      const filteredProjects = query
        ? allProjects.filter((p) =>
            p.title.toLowerCase().includes(query.toLowerCase()),
          )
        : allProjects;

      // Escape - close picker
      if (name === "escape") {
        board.dispatch({ type: "CLOSE_PROJECT_PICKER" });
        return;
      }

      // Enter/Return - navigate to selected project
      if (name === "return") {
        const selectedProject =
          filteredProjects[board.state.projectPickerIndex];
        if (selectedProject) {
          navigateToRoot(selectedProject.id);
        }
        board.dispatch({ type: "CLOSE_PROJECT_PICKER" });
        return;
      }

      // j or down - move selection down
      if (name === "j" || name === "down") {
        board.dispatch({
          type: "PROJECT_PICKER_DOWN",
          maxIndex: filteredProjects.length - 1,
        });
        return;
      }

      // k or up - move selection up
      if (name === "k" || name === "up") {
        board.dispatch({ type: "PROJECT_PICKER_UP" });
        return;
      }

      // Backspace - remove last character from query
      if (name === "backspace") {
        const currentQuery = board.state.projectPickerQuery;
        if (currentQuery.length > 0) {
          board.dispatch({
            type: "SET_PROJECT_PICKER_QUERY",
            query: currentQuery.slice(0, -1),
          });
        }
        return;
      }

      // Character input - append to query
      if (name.length === 1 && !meta) {
        board.dispatch({
          type: "SET_PROJECT_PICKER_QUERY",
          query: board.state.projectPickerQuery + name,
        });
        return;
      }

      // Ignore all other keys in project picker mode
      return;
    }

    // ===== Normal Mode =====

    // Escape - clear selection if any, otherwise quit
    if (name === "escape") {
      if (board.state.selectedCards.size > 0) {
        board.dispatch({ type: "CLEAR_SELECTION" });
      } else {
        exitApp();
      }
    }

    // Quit
    if (name === "q") {
      exitApp();
    }

    // ===== Multi-Select (Shift+j/k) =====
    // Shift+j: Select current card and move down (range selection)
    if (name === "j" && shift && !meta) {
      const card = board.currentCard;
      if (card) {
        board.dispatch({ type: "SELECT_CARD_ADD", nodeId: card.nodeId });
        board.dispatch({ type: "MOVE_DOWN" });
      }
    }
    // Shift+k: Select current card and move up (range selection)
    else if (name === "k" && shift && !meta) {
      const card = board.currentCard;
      if (card) {
        board.dispatch({ type: "SELECT_CARD_ADD", nodeId: card.nodeId });
        board.dispatch({ type: "MOVE_UP" });
      }
    }

    // Navigation - use arrow key names or vim keys
    else if (name === "up" || (name === "k" && !shift && !meta)) {
      board.dispatch({ type: "MOVE_UP" });
    } else if (name === "down" || (name === "j" && !shift && !meta)) {
      board.dispatch({ type: "MOVE_DOWN" });
    } else if (name === "left" || name === "h") {
      board.dispatch({ type: "MOVE_LEFT" });
    } else if (name === "right" || name === "l") {
      board.dispatch({ type: "MOVE_RIGHT" });
    } else if (name === "g" && !shift) {
      board.dispatch({ type: "JUMP_TOP" });
    } else if (name === "g" && shift) {
      // Shift+G = jump to bottom (capital G)
      board.dispatch({ type: "JUMP_BOTTOM" });
    }

    // ===== Root Navigation =====

    // u - Navigate UP to parent node
    else if (name === "u") {
      const currentRootId = board.state.rootId;
      if (currentRootId) {
        // Get parent of current root
        const currentRoot = getNode(currentRootId);
        if (currentRoot) {
          // Navigate to parent (or null if at top level)
          const parentId = currentRoot.parent_id ?? null;
          navigateToRoot(parentId);
        }
      }
      // If already at root (null), do nothing
    }

    // [ - Navigate BACK in history
    else if (name === "[") {
      const { navHistory, navHistoryIndex } = board.state;
      if (navHistoryIndex > 0) {
        const prevEntry = navHistory[navHistoryIndex - 1];
        if (prevEntry) {
          // Navigate to the previous history entry
          const columns = buildColumns(prevEntry.rootId);
          // Dispatch NAV_BACK to decrement index, then restore state
          board.dispatch({ type: "NAV_BACK" });
          // After NAV_BACK, restore the actual view
          board.dispatch({ type: "REFRESH", columns });
          board.dispatch({
            type: "SELECT_CARD",
            col: prevEntry.colIndex,
            card: prevEntry.cardIndex,
          });
        }
      }
    }

    // ] - Navigate FORWARD in history
    else if (name === "]") {
      const { navHistory, navHistoryIndex } = board.state;
      if (navHistoryIndex < navHistory.length - 1) {
        const nextEntry = navHistory[navHistoryIndex + 1];
        if (nextEntry) {
          // Navigate to the next history entry
          const columns = buildColumns(nextEntry.rootId);
          // Dispatch NAV_FORWARD to increment index, then restore state
          board.dispatch({ type: "NAV_FORWARD" });
          // After NAV_FORWARD, restore the actual view
          board.dispatch({ type: "REFRESH", columns });
          board.dispatch({
            type: "SELECT_CARD",
            col: nextEntry.colIndex,
            card: nextEntry.cardIndex,
          });
        }
      }
    }

    // View mode cycling
    else if (name === "v") {
      const currentIndex = VIEW_MODES.indexOf(viewMode);
      const nextIndex = (currentIndex + 1) % VIEW_MODES.length;
      setViewMode(VIEW_MODES[nextIndex]);
    }

    // Help
    else if (name === "?" || (name === "/" && shift)) {
      board.dispatch({ type: "TOGGLE_HELP_MODE" });
    }

    // Search
    else if (name === "/" && !shift) {
      board.dispatch({ type: "TOGGLE_SEARCH_MODE" });
    }

    // New item
    else if (name === "n" && !shift && !meta) {
      board.dispatch({ type: "TOGGLE_NEW_ITEM_MODE" });
    }

    // Project picker
    else if (name === "p" && !shift && !meta) {
      board.dispatch({ type: "TOGGLE_PROJECT_PICKER" });
    }

    // Detail pane toggle
    else if (name === "i" && !shift && !meta) {
      board.dispatch({ type: "TOGGLE_DETAIL_PANE" });
    }

    // ===== Editor Integration =====

    // e - Edit current card in $EDITOR at its line
    else if (name === "e") {
      const card = board.currentCard;
      if (card) {
        const { filePath, line } = getNodeSourceInfo(card.nodeId);
        if (filePath) {
          openInEditor(filePath, line);
        }
      }
    }

    // o - Open source file in $EDITOR (without line number)
    else if (name === "o") {
      const card = board.currentCard;
      if (card) {
        const { filePath } = getNodeSourceInfo(card.nodeId);
        if (filePath) {
          openInEditor(filePath);
        }
      }
    }

    // ===== Fold/Collapse =====

    // z - Fold all cards in current column
    else if (name === "z" && !shift) {
      board.dispatch({ type: "FOLD_COLUMN", colIndex: board.state.colIndex });
    }

    // Z - Unfold all cards in current column
    else if (name === "z" && shift) {
      board.dispatch({ type: "UNFOLD_COLUMN", colIndex: board.state.colIndex });
    }

    // c - Toggle collapse current column
    else if (name === "c") {
      board.dispatch({
        type: "TOGGLE_COLLAPSE",
        colIndex: board.state.colIndex,
      });
    }

    // ===== Multi-Select (A - progressive select all) =====

    // A (Shift+a) - Progressive select all
    // First press: select all in current column
    // Second press: select all in all columns
    else if (name === "a" && shift) {
      const currentColumn = board.currentColumn;
      if (currentColumn) {
        // Check if all cards in current column are already selected
        const allColumnSelected = currentColumn.cards.every((card) =>
          board.state.selectedCards.has(card.nodeId),
        );

        if (!allColumnSelected) {
          // First press: select all in current column
          board.dispatch({ type: "SELECT_ALL_COLUMN" });
        } else {
          // Second press: select all in all columns
          board.dispatch({ type: "SELECT_ALL" });
        }
      }
    }

    // ===== Favorites Navigation (1-9) =====

    // 1-9: Jump to favorite boards (@inbox, @next, etc.)
    else if (/^[1-9]$/.test(name)) {
      const favoriteRef = DEFAULT_FAVORITES[name];
      if (favoriteRef) {
        const resolved = resolveNode(favoriteRef);
        if (resolved) {
          navigateToRoot(resolved.id);
        }
      }
    }

    // Shift+1-9: Jump cursor to column (terminal sends !@#$%^&*()
    else if (SHIFT_NUMBER_MAP[name] !== undefined) {
      const targetCol = SHIFT_NUMBER_MAP[name];
      if (targetCol !== undefined && targetCol < board.state.columns.length) {
        board.dispatch({ type: "SELECT_CARD", col: targetCol, card: 0 });
      }
    }

    // ===== Card Mutations =====

    // Space - Cycle task status (todo -> wip -> done -> dropped -> todo)
    else if (name === "space") {
      const card = board.currentCard;
      if (card?.isTask) {
        const nextStatus = getNextStatus(card.taskStatus);
        updateNode(card.nodeId, { task_status: nextStatus });
        refreshBoard();
      }
    }

    // x - Toggle done (quick toggle: if done -> todo, else -> done)
    else if (name === "x") {
      const card = board.currentCard;
      if (card?.isTask) {
        const newStatus = card.taskStatus === "done" ? "todo" : "done";
        updateNode(card.nodeId, { task_status: newStatus });
        refreshBoard();
      }
    }

    // d - Delete card
    else if (name === "d") {
      const card = board.currentCard;
      if (card) {
        deleteNode(card.nodeId);
        refreshBoard();
      }
    }

    // Tab - Indent (make child of previous sibling)
    else if (name === "tab" && !shift) {
      const card = board.currentCard;
      const column = board.currentColumn;
      if (card && column) {
        const cardIndex = board.state.cardIndex;
        // Can only indent if there's a previous sibling
        if (cardIndex > 0) {
          const prevSibling = column.cards[cardIndex - 1];
          if (prevSibling) {
            // Get current children count of prev sibling to set parent_idx
            const prevSiblingChildren = getChildren(prevSibling.nodeId);
            // Move card to be last child of previous sibling
            const node = getNode(card.nodeId);
            if (node) {
              updateNode(card.nodeId, {
                parent_id: prevSibling.nodeId,
                parent_idx: prevSiblingChildren.length,
              });
              refreshBoard();
            }
          }
        }
      }
    }

    // Shift+Tab - Outdent (move to parent's level)
    else if (name === "tab" && shift) {
      const card = board.currentCard;
      if (card) {
        const node = getNode(card.nodeId);
        if (node && node.parent_id) {
          const parent = getNode(node.parent_id);
          if (parent && parent.parent_id !== undefined) {
            // Get siblings of parent to determine new parent_idx
            const parentSiblings = getChildren(parent.parent_id);
            const parentIdx = parentSiblings.findIndex(
              (s: Node) => s.id === parent.id,
            );
            // Place after parent
            updateNode(card.nodeId, {
              parent_id: parent.parent_id,
              parent_idx: parentIdx + 1,
            });
            refreshBoard();
          }
        }
      }
    }

    // ===== Zoom Navigation =====

    // Enter - Zoom into current card (make it the new root)
    else if (name === "return") {
      const card = board.currentCard;
      if (card) {
        // Build columns from the card's children
        const newColumns = buildColumns(card.nodeId);
        // Only zoom if the card has children
        if (newColumns.length > 0 || getChildren(card.nodeId).length > 0) {
          board.dispatch({
            type: "ZOOM_IN",
            nodeId: card.nodeId,
            columns: newColumns,
          });
        }
      }
    }

    // Backspace - Zoom out (go back to previous root from zoomStack)
    else if (name === "backspace") {
      if (board.state.zoomStack.length > 0) {
        // Get the previous root from the stack
        const prevRootMarker =
          board.state.zoomStack[board.state.zoomStack.length - 1];
        const prevRootId =
          prevRootMarker === "__ROOT__" ? null : prevRootMarker;
        const newColumns = buildColumns(prevRootId ?? null);
        board.dispatch({ type: "ZOOM_OUT", columns: newColumns });
      }
    }

    // ===== Card Movement (Alt+hjkl, Alt+1-9) =====

    // Alt+j - Move card down within column
    else if (name === "j" && meta) {
      const card = board.currentCard;
      const column = board.currentColumn;
      if (card && column) {
        const cardIndex = board.state.cardIndex;
        if (cardIndex < column.cards.length - 1) {
          // Get the next sibling to swap with
          const nextCard = column.cards[cardIndex + 1];
          if (nextCard) {
            const node = getNode(card.nodeId);
            const nextNode = getNode(nextCard.nodeId);
            if (node && nextNode) {
              // Move after next sibling by using its index + 0.5
              const nextIdx = nextNode.parent_idx ?? 0;
              updateNode(card.nodeId, { parent_idx: nextIdx + 0.5 });
              refreshBoard();
              board.dispatch({ type: "MOVE_DOWN" });
            }
          }
        }
      }
    }

    // Alt+k - Move card up within column
    else if (name === "k" && meta) {
      const card = board.currentCard;
      const column = board.currentColumn;
      if (card && column) {
        const cardIndex = board.state.cardIndex;
        if (cardIndex > 0) {
          // Get the previous sibling to swap with
          const prevCard = column.cards[cardIndex - 1];
          if (prevCard) {
            const node = getNode(card.nodeId);
            const prevNode = getNode(prevCard.nodeId);
            if (node && prevNode) {
              // Move before previous sibling
              const prevIdx = prevNode.parent_idx ?? 0;
              updateNode(card.nodeId, { parent_idx: prevIdx - 0.5 });
              refreshBoard();
              board.dispatch({ type: "MOVE_UP" });
            }
          }
        }
      }
    }

    // Alt+h - Move card to previous column
    else if (name === "h" && meta) {
      const card = board.currentCard;
      const colIndex = board.state.colIndex;
      if (card && colIndex > 0) {
        const prevColumn = board.state.columns[colIndex - 1];
        if (prevColumn) {
          // Move card to be a child of the previous column's node
          // Place at end of previous column
          const prevColumnChildren = getChildren(prevColumn.nodeId);
          const newParentIdx =
            prevColumnChildren.length > 0
              ? (prevColumnChildren[prevColumnChildren.length - 1]
                  ?.parent_idx ?? 0) + 1
              : 0;
          updateNode(card.nodeId, {
            parent_id: prevColumn.nodeId,
            parent_idx: newParentIdx,
          });
          refreshBoard();
          // Move cursor to the new column and to the end where card was placed
          board.dispatch({
            type: "SELECT_CARD",
            col: colIndex - 1,
            card: prevColumnChildren.length,
          });
        }
      }
    }

    // Alt+l - Move card to next column
    else if (name === "l" && meta) {
      const card = board.currentCard;
      const colIndex = board.state.colIndex;
      if (card && colIndex < board.state.columns.length - 1) {
        const nextColumn = board.state.columns[colIndex + 1];
        if (nextColumn) {
          // Move card to be a child of the next column's node
          // Place at end of next column
          const nextColumnChildren = getChildren(nextColumn.nodeId);
          const newParentIdx =
            nextColumnChildren.length > 0
              ? (nextColumnChildren[nextColumnChildren.length - 1]
                  ?.parent_idx ?? 0) + 1
              : 0;
          updateNode(card.nodeId, {
            parent_id: nextColumn.nodeId,
            parent_idx: newParentIdx,
          });
          refreshBoard();
          // Move cursor to the new column and to the end where card was placed
          board.dispatch({
            type: "SELECT_CARD",
            col: colIndex + 1,
            card: nextColumnChildren.length,
          });
        }
      }
    }

    // Alt+1-9 - Move card to specific column
    else if (/^[1-9]$/.test(name) && meta) {
      const card = board.currentCard;
      const targetColIndex = parseInt(name, 10) - 1; // Convert 1-9 to 0-8
      if (card && targetColIndex < board.state.columns.length) {
        const currentColIndex = board.state.colIndex;
        // Don't move if already in target column
        if (targetColIndex !== currentColIndex) {
          const targetColumn = board.state.columns[targetColIndex];
          if (targetColumn) {
            // Move card to be a child of the target column's node
            // Place at end of target column
            const targetColumnChildren = getChildren(targetColumn.nodeId);
            const newParentIdx =
              targetColumnChildren.length > 0
                ? (targetColumnChildren[targetColumnChildren.length - 1]
                    ?.parent_idx ?? 0) + 1
                : 0;
            updateNode(card.nodeId, {
              parent_id: targetColumn.nodeId,
              parent_idx: newParentIdx,
            });
            refreshBoard();
            // Move cursor to the target column and to the end where card was placed
            board.dispatch({
              type: "SELECT_CARD",
              col: targetColIndex,
              card: targetColumnChildren.length,
            });
          }
        }
      }
    }

    // ===== Outline Depth Control =====

    // < - Decrease outline depth (show fewer nesting levels)
    else if (name === "<") {
      board.dispatch({ type: "DECREASE_OUTLINE_DEPTH" });
    }

    // > - Increase outline depth (show more nesting levels)
    else if (name === ">") {
      board.dispatch({ type: "INCREASE_OUTLINE_DEPTH" });
    }

    // + - Increase content lines (show more content per card)
    else if (name === "+" || (name === "=" && shift)) {
      board.dispatch({ type: "INCREASE_CONTENT_LINES" });
    }

    // - - Decrease content lines (show less content per card)
    else if (name === "-") {
      board.dispatch({ type: "DECREASE_CONTENT_LINES" });
    }
  });

  // Current column for status bar
  const currentCol = board.currentColumn;

  // Detail pane configuration
  const detailPaneWidth = 40;
  const detailPaneOpen = board.state.detailPaneOpen;
  const mainViewWidth = detailPaneOpen ? width - detailPaneWidth : width;

  // Get full node data for detail pane
  const selectedCardData = board.currentCard;
  const selectedNode = selectedCardData
    ? getNode(selectedCardData.nodeId)
    : null;
  const selectedChildCount = selectedCardData?.childCount ?? 0;

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <Header
        rootPath={viewModel.rootPath}
        viewMode={viewMode}
        searchQuery={viewModel.searchQuery}
        searchMode={viewModel.searchMode}
      />

      {/* Main content area with optional detail pane */}
      <box flexDirection="row" flexGrow={1}>
        {/* Main view area */}
        <box
          flexDirection="column"
          width={mainViewWidth}
          flexGrow={detailPaneOpen ? 0 : 1}
        >
          {viewMode === "cards" && (
            <CardsView
              columns={viewModel.columns}
              selectedCol={viewModel.selectedCol}
              selectedCard={viewModel.selectedCard}
              selectedCards={viewModel.selectedCards}
            />
          )}

          {viewMode === "list" && (
            <ListView
              columns={viewModel.columns}
              selectedCol={viewModel.selectedCol}
              selectedCard={viewModel.selectedCard}
              selectedCards={viewModel.selectedCards}
              width={mainViewWidth}
            />
          )}

          {viewMode === "columns" && (
            <ColumnsView
              columns={viewModel.columns}
              selectedCol={viewModel.selectedCol}
              selectedCard={viewModel.selectedCard}
              selectedCards={viewModel.selectedCards}
              width={mainViewWidth}
              height={height - 3}
            />
          )}

          {viewMode === "tabs" && (
            <TabsView
              columns={viewModel.columns}
              selectedCol={viewModel.selectedCol}
              selectedCard={viewModel.selectedCard}
              selectedCards={viewModel.selectedCards}
              width={mainViewWidth}
              height={height - 3}
            />
          )}
        </box>

        {/* Detail pane (shown when toggled with 'i') */}
        {detailPaneOpen && (
          <DetailPane
            node={selectedNode}
            childCount={selectedChildCount}
            width={detailPaneWidth}
          />
        )}
      </box>

      {/* Search input (shown when search mode is active) */}
      <SearchInput
        query={viewModel.searchQuery}
        isActive={viewModel.searchMode}
      />

      {/* Status bar */}
      <StatusBar
        width={width}
        height={height}
        colIndex={board.state.colIndex}
        colCount={board.state.columns.length}
        cardIndex={board.state.cardIndex}
        cardCount={currentCol?.cards.length ?? 0}
        viewMode={viewMode}
      />

      {/* Help overlay (shown when help mode is active) */}
      {board.state.helpMode && <HelpOverlay width={width} height={height} />}

      {/* New item dialog (shown when new item mode is active) */}
      {board.state.newItemMode && (
        <NewItemDialog text={board.state.newItemText} width={width} />
      )}

      {/* Project picker (shown when project picker is open) */}
      {board.state.projectPickerOpen && (
        <ProjectPicker
          projects={getChildren(null).map((node) => ({
            id: node.id,
            title: getNodeDisplayName(node),
            itemCount: getChildren(node.id).length,
          }))}
          query={board.state.projectPickerQuery}
          selectedIndex={board.state.projectPickerIndex}
          width={width}
          height={height}
        />
      )}
    </box>
  );
}

export default App;
