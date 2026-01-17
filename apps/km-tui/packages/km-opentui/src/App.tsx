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
import { useAppState, createAppState } from "./hooks/index.ts";
import { toTreeViewModel, getBreadcrumbs, type TAction } from "@km/board";
import type { BreadcrumbSegment } from "./components/Header.tsx";
import { CardsView, ListView, ColumnsView, TabsView } from "./views/index.ts";
import {
  CommandPalette,
  DetailPane,
  Header,
  HelpOverlay,
  NewItemDialog,
  ProjectPicker,
  SearchInput,
  StatusBar,
} from "./components/index.ts";
import { filterCommands } from "@km/sh-app";
import { executeCommand, type CommandContext } from "./commands.ts";
import {
  updateNode,
  deleteNode,
  addNode,
  getNode,
  getAncestors,
  getChildren,
  resolveNode,
  getStore,
  getBacklinks,
  getOutgoingLinks,
} from "@km/storage";

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
import { getNodeDisplayName as getNodeDisplayNameBase } from "@km/tree";

// Bound version with store dependency
const getNodeDisplayName = (
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => getNodeDisplayNameBase(node, getChildren);
import type { DBNode } from "@km/core";
import type { ViewMode, TaskStatus, TNode, TPath } from "./types.ts";

// Task status cycle order for Space key
const STATUS_CYCLE: TaskStatus[] = ["todo", "wip", "done", "dropped"];

/**
 * Calculate target path for cross-column navigation.
 * Preserves Y position when moving between columns based on card heights.
 * Returns null if navigation is not possible.
 */
function calculateCrossColumnPath(
  direction: "left" | "right",
  cursor: TPath,
  nodes: TNode[],
): TPath | null {
  // Only works at depth 2+ (card level: [colIndex, cardIndex, ...])
  if (cursor.length < 2) return null;

  const colIndex = cursor[0];
  const cardIndex = cursor[1];
  if (colIndex === undefined || cardIndex === undefined) return null;

  const targetCol = direction === "left" ? colIndex - 1 : colIndex + 1;

  // Bounds check for column
  if (targetCol < 0 || targetCol >= nodes.length) return null;

  const sourceColumn = nodes[colIndex];
  const targetColumn = nodes[targetCol];
  if (!sourceColumn || !targetColumn) return null;
  if (targetColumn.children.length === 0) return null;

  // Calculate card height based on whether it has metadata
  // Card renders as: border(1) + title(1) + [metadata(1)] + border(1) = 3 or 4 lines
  const getCardHeight = (node: TNode): number => {
    const hasMetadata =
      node.priority !== undefined || node.dueDate || node.hasBacklinks;
    return hasMetadata ? 4 : 3;
  };

  // Calculate Y position of current card's title (line 1 within the card)
  let sourceY = 0;
  for (let i = 0; i < cardIndex; i++) {
    const card = sourceColumn.children[i];
    if (card) sourceY += getCardHeight(card);
  }
  // Title is on line 1 (after top border)
  sourceY += 1;

  // Find card at that Y position in target column
  let targetY = 0;
  let targetCardIndex = 0;
  for (let i = 0; i < targetColumn.children.length; i++) {
    const card = targetColumn.children[i];
    if (!card) continue;
    const cardHeight = getCardHeight(card);
    const cardStart = targetY;
    const cardEnd = targetY + cardHeight;
    // Check if sourceY falls within this card's range
    if (sourceY >= cardStart && sourceY < cardEnd) {
      targetCardIndex = i;
      break;
    }
    targetY += cardHeight;
    targetCardIndex = i; // Default to last card if we go past
  }

  return [targetCol, targetCardIndex];
}

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
 * Convert DBNode to TNode (recursive)
 */
function nodeToTNode(node: DBNode, depth: number = 0): TNode {
  const children = getChildren(node.id);

  // Get backlinks count
  const backlinks = getBacklinks(node.id);
  const hasBacklinks = backlinks.length > 0;

  // Get outgoing links count (refs)
  const outgoingLinks = getOutgoingLinks(node.id);
  const refsCount = outgoingLinks.length > 0 ? outgoingLinks.length : undefined;

  return {
    nodeId: node.id,
    name: node.name || node.title || node.id, // Stable identifier
    title: getNodeDisplayName(node),
    children: children.map((child) => nodeToTNode(child, depth + 1)),
    childCount: children.length,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as TNode["taskStatus"],
    color: node.rules?.color,
    icon: undefined,
    priority: node.priority,
    dueDate: node.due_date,
    scheduledDate: node.scheduled_date,
    hasBacklinks: hasBacklinks || undefined,
    refsCount,
    body: node.content,
    nodeType: node.type as TNode["nodeType"],
    depth,
  };
}

/**
 * Build tree nodes from root node
 */
function buildNodes(rootId: string | null): TNode[] {
  if (!rootId) {
    const roots = getChildren(null);
    if (roots.length === 0) {
      return [];
    }
    return roots.map((node) => nodeToTNode(node, 0));
  }

  const node = getNode(rootId);
  if (!node) {
    return [];
  }

  const children = getChildren(node.id);
  return children.map((child) => nodeToTNode(child, 0));
}

interface AppProps {
  initialNodes: TNode[];
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
  initialNodes,
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

  // Initialize app state
  const initialState = useMemo(
    () => createAppState(initialNodes, rootId, rootPath),
    [], // Only compute once
  );

  // Mutable ref for refreshTree to avoid circular dependency
  const refreshTreeRef = { current: () => {} };

  /**
   * Effect layer callback: Handle TActions (content mutations).
   *
   * This is the bridge between the reducer (pure state) and storage (side effects).
   * When a TAction is dispatched:
   * 1. Reducer passes it through unchanged
   * 2. This callback persists to storage
   * 3. refreshTree() reloads the tree from storage
   *
   * Architecture: Command → Action → Reducer → Effect Layer → Storage
   */
  const handleTAction = useCallback((action: TAction) => {
    switch (action.type) {
      case "UPDATE_NODE":
        updateNode(action.nodeId, action.updates);
        break;
      case "DELETE_NODE":
        deleteNode(action.nodeId);
        break;
      case "ADD_NODE":
        addNode(action.parentId, action.node);
        break;
      case "MOVE_NODE":
        updateNode(action.nodeId, {
          parent_id: action.newParentId,
          parent_idx: action.newIndex,
        });
        break;
    }
    // Refresh tree after storage mutation
    refreshTreeRef.current();
  }, []);

  const tree = useAppState(initialState, { onTAction: handleTAction });

  // Transform state to view model
  const viewModel = useMemo(
    () => toTreeViewModel(tree.state, viewMode),
    [tree.state, viewMode],
  );

  // Refresh tree data from store
  const refreshTree = useCallback(() => {
    const nodes = buildNodes(tree.state.rootId);
    if (nodes.length > 0) {
      tree.dispatch({ type: "REFRESH", nodes });
    }
  }, [tree]);

  // Update ref so handleTAction can call refreshTree
  refreshTreeRef.current = refreshTree;

  // Subscribe to external refresh events (filesystem changes)
  useEffect(() => {
    if (!refreshEmitter) return;

    const handleRefresh = () => {
      refreshTree();
    };

    refreshEmitter.on("refresh", handleRefresh);
    return () => {
      refreshEmitter.off("refresh", handleRefresh);
    };
  }, [refreshEmitter, refreshTree]);

  // Navigate to a new root node (pushes to history)
  const navigateToRoot = useCallback(
    (newRootId: string | null) => {
      const newNodes = buildNodes(newRootId);
      // Get root path from node if available
      const node = newRootId ? getNode(newRootId) : null;
      const newRootPath = node?.fs_path ?? null;
      tree.dispatch({
        type: "NAV_TO",
        rootId: newRootId,
        nodes: newNodes,
        rootPath: newRootPath,
      });
    },
    [tree],
  );

  // Derive current column and card from tree state
  const currentColumn = useMemo(() => {
    const colIndex = tree.state.cursor[0] ?? 0;
    return tree.state.nodes[colIndex] ?? null;
  }, [tree.state.nodes, tree.state.cursor]);

  const currentCard = useMemo(() => {
    const colIndex = tree.state.cursor[0] ?? 0;
    const cardIndex = tree.state.cursor[1] ?? 0;
    const column = tree.state.nodes[colIndex];
    return column?.children[cardIndex] ?? null;
  }, [tree.state.nodes, tree.state.cursor]);

  /**
   * Build CommandContext from current state.
   *
   * Commands read this context to determine what action to create.
   * This decouples commands from specific UI state shape.
   */
  const getCommandContext = useCallback((): CommandContext => {
    const cardIndex = tree.state.cursor[1] ?? 0;
    return {
      currentNode: currentCard,
      currentNodeId: currentCard?.nodeId ?? null,
      currentTaskStatus: currentCard?.taskStatus ?? null,
      isTask: currentCard?.isTask ?? false,
      parentNodeId: currentColumn?.nodeId ?? null,
      siblingCount: currentColumn?.children.length ?? 0,
      currentIndex: cardIndex,
      depth: tree.state.cursor.length,
    };
  }, [currentCard, currentColumn, tree.state.cursor]);

  /**
   * Execute a command by name.
   *
   * This is the entry point for the command system:
   * 1. Build context from current state
   * 2. Command reads context and creates action
   * 3. Action is dispatched to reducer
   * 4. Effect layer persists TActions to storage
   */
  const runCommand = useCallback(
    (commandId: string) => {
      const ctx = getCommandContext();
      const action = executeCommand(commandId, ctx);
      if (action) {
        tree.dispatch(action);
      }
    },
    [getCommandContext, tree],
  );

  // Handle keyboard input
  // Note: KeyEvent from OpenTUI uses `name` for key identification, not `key`
  // Alt key is accessed via `meta` property in OpenTUI KeyEvent
  useKeyboard(({ name, shift, meta, ctrl }) => {
    // ===== Help Mode =====
    // When help overlay is shown, only ? and Escape dismiss it
    if (tree.state.helpMode) {
      if (name === "escape" || name === "?" || (name === "/" && shift)) {
        tree.dispatch({ type: "TOGGLE_HELP_MODE" });
      }
      // Ignore all other keys when help is shown
      return;
    }

    // ===== Search Mode Input =====
    // When in search mode, capture character input for the search query
    if (tree.state.searchMode) {
      // Escape - cancel search, clear query, exit search mode
      if (name === "escape") {
        tree.dispatch({ type: "SET_SEARCH_QUERY", query: "" });
        tree.dispatch({ type: "TOGGLE_SEARCH_MODE" });
        return;
      }

      // Enter/Return - confirm search, exit search mode but keep query
      if (name === "return") {
        tree.dispatch({ type: "TOGGLE_SEARCH_MODE" });
        return;
      }

      // Backspace - remove last character from query
      if (name === "backspace") {
        const currentQuery = tree.state.searchQuery;
        if (currentQuery.length > 0) {
          tree.dispatch({
            type: "SET_SEARCH_QUERY",
            query: currentQuery.slice(0, -1),
          });
        }
        return;
      }

      // Character input (a-z, 0-9, space, and common punctuation)
      // Single character names that aren't special keys get appended to query
      if (name.length === 1 && !meta) {
        tree.dispatch({
          type: "SET_SEARCH_QUERY",
          query: tree.state.searchQuery + name,
        });
        return;
      }

      // Ignore all other keys in search mode
      return;
    }

    // ===== New Item Mode Input =====
    // When in new item mode, capture character input for the new task title
    if (tree.state.newItemMode) {
      // Escape - cancel new item, clear text, exit new item mode
      if (name === "escape") {
        tree.dispatch({ type: "CLEAR_NEW_ITEM" });
        return;
      }

      // Enter/Return - create the new task
      if (name === "return") {
        const text = tree.state.newItemText.trim();
        if (text && currentColumn) {
          // Get the current column's node to find the file to append to
          const columnNode = getNode(currentColumn.nodeId);
          if (columnNode) {
            // Find the file path for this column
            let filePath: string | null = null;
            if (columnNode.fs_path && columnNode.type === "file") {
              filePath = columnNode.fs_path;
            } else {
              // Traverse ancestors to find the containing file
              const ancestors = getAncestors(currentColumn.nodeId);
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
              refreshTree();
            }
          }
        }
        tree.dispatch({ type: "CLEAR_NEW_ITEM" });
        return;
      }

      // Backspace - remove last character from text
      if (name === "backspace") {
        const currentText = tree.state.newItemText;
        if (currentText.length > 0) {
          tree.dispatch({
            type: "SET_NEW_ITEM_TEXT",
            text: currentText.slice(0, -1),
          });
        }
        return;
      }

      // Character input (a-z, 0-9, space, and common punctuation)
      // Single character names that aren't special keys get appended to text
      if (name.length === 1 && !meta) {
        tree.dispatch({
          type: "SET_NEW_ITEM_TEXT",
          text: tree.state.newItemText + name,
        });
        return;
      }

      // Ignore all other keys in new item mode
      return;
    }

    // ===== Project Picker Mode =====
    // When project picker is open, handle navigation and selection
    if (tree.state.projectPickerOpen) {
      // Get filtered projects for index bounds
      const allProjects = getChildren(null).map((node) => ({
        id: node.id,
        title: getNodeDisplayName(node),
        itemCount: getChildren(node.id).length,
      }));
      const query = tree.state.projectPickerQuery;
      const filteredProjects = query
        ? allProjects.filter((p) =>
            p.title.toLowerCase().includes(query.toLowerCase()),
          )
        : allProjects;

      // Escape - close picker
      if (name === "escape") {
        tree.dispatch({ type: "CLOSE_PROJECT_PICKER" });
        return;
      }

      // Enter/Return - navigate to selected project
      if (name === "return") {
        const selectedProject = filteredProjects[tree.state.projectPickerIndex];
        if (selectedProject) {
          navigateToRoot(selectedProject.id);
        }
        tree.dispatch({ type: "CLOSE_PROJECT_PICKER" });
        return;
      }

      // j or down - move selection down
      if (name === "j" || name === "down") {
        tree.dispatch({
          type: "PROJECT_PICKER_DOWN",
          maxIndex: filteredProjects.length - 1,
        });
        return;
      }

      // k or up - move selection up
      if (name === "k" || name === "up") {
        tree.dispatch({ type: "PROJECT_PICKER_UP" });
        return;
      }

      // Backspace - remove last character from query
      if (name === "backspace") {
        const currentQuery = tree.state.projectPickerQuery;
        if (currentQuery.length > 0) {
          tree.dispatch({
            type: "SET_PROJECT_PICKER_QUERY",
            query: currentQuery.slice(0, -1),
          });
        }
        return;
      }

      // Character input - append to query
      if (name.length === 1 && !meta) {
        tree.dispatch({
          type: "SET_PROJECT_PICKER_QUERY",
          query: tree.state.projectPickerQuery + name,
        });
        return;
      }

      // Ignore all other keys in project picker mode
      return;
    }

    // ===== Command Palette Mode =====
    // When command palette is open, handle navigation and execution
    if (tree.state.commandPaletteOpen) {
      // Get filtered commands for index bounds
      const query = tree.state.commandPaletteQuery;
      const filteredCommands = filterCommands(query);

      // Escape - close palette
      if (name === "escape") {
        tree.dispatch({ type: "CLOSE_COMMAND_PALETTE" });
        return;
      }

      // Enter/Return - execute selected command
      if (name === "return") {
        const selectedCommand =
          filteredCommands[tree.state.commandPaletteIndex];
        if (selectedCommand && selectedCommand.action) {
          // Close palette first
          tree.dispatch({ type: "CLOSE_COMMAND_PALETTE" });
          // Then execute the command
          tree.dispatch(selectedCommand.action);
        } else if (selectedCommand && selectedCommand.needsContext) {
          // Command needs context - close palette and let user know
          tree.dispatch({ type: "CLOSE_COMMAND_PALETTE" });
          // For now, just close - context-dependent commands need the current node
        } else {
          tree.dispatch({ type: "CLOSE_COMMAND_PALETTE" });
        }
        return;
      }

      // j or down - move selection down
      if (name === "j" || name === "down") {
        tree.dispatch({
          type: "COMMAND_PALETTE_DOWN",
          maxIndex: filteredCommands.length - 1,
        });
        return;
      }

      // k or up - move selection up
      if (name === "k" || name === "up") {
        tree.dispatch({ type: "COMMAND_PALETTE_UP" });
        return;
      }

      // Backspace - remove last character from query
      if (name === "backspace") {
        const currentQuery = tree.state.commandPaletteQuery;
        if (currentQuery.length > 0) {
          tree.dispatch({
            type: "SET_COMMAND_PALETTE_QUERY",
            query: currentQuery.slice(0, -1),
          });
        }
        return;
      }

      // Character input - append to query
      if (name.length === 1 && !meta) {
        tree.dispatch({
          type: "SET_COMMAND_PALETTE_QUERY",
          query: tree.state.commandPaletteQuery + name,
        });
        return;
      }

      // Ignore all other keys in command palette mode
      return;
    }

    // ===== Move Mode =====
    // When in move mode, navigate to destination and confirm/cancel
    if (tree.state.moveMode) {
      // Escape - cancel move, restore original cursor
      if (name === "escape") {
        tree.dispatch({ type: "CANCEL_MOVE" });
        return;
      }

      // Enter/Return - confirm move to current cursor position
      if (name === "return") {
        // Get destination (current cursor position's parent node)
        const destPath = tree.state.cursor;
        if (destPath.length > 0) {
          const destParentPath = destPath.slice(0, -1);
          const destIndex = destPath[destPath.length - 1] ?? 0;

          // Determine destination parent
          let destParentId: string | null = null;
          if (destParentPath.length === 0) {
            // Moving to top level under current root
            destParentId = tree.state.rootId;
          } else {
            const destParentNode = tree.state.nodes[destParentPath[0] ?? 0];
            if (destParentPath.length === 1 && destParentNode) {
              destParentId = destParentNode.nodeId;
            } else if (destParentPath.length > 1 && destParentNode) {
              // Navigate to get the parent node
              let node = destParentNode;
              for (let i = 1; i < destParentPath.length; i++) {
                const idx = destParentPath[i];
                if (idx !== undefined && node.children[idx]) {
                  node = node.children[idx];
                }
              }
              destParentId = node.nodeId;
            }
          }

          // Move each source node to destination via TAction
          for (let i = 0; i < tree.state.moveSourceNodes.length; i++) {
            const nodeId = tree.state.moveSourceNodes[i];
            if (nodeId) {
              tree.dispatch({
                type: "MOVE_NODE",
                nodeId,
                newParentId: destParentId,
                newIndex: destIndex + i, // Insert in order after destination
              });
            }
          }
        }

        tree.dispatch({ type: "CONFIRM_MOVE" });
        return;
      }

      // Navigation keys work normally in move mode (hjkl, etc.)
      // Fall through to normal navigation handling below
    }

    // ===== Normal Mode =====

    // Escape - clear selection if any, otherwise quit
    if (name === "escape") {
      if (tree.state.selectedNodes.size > 0) {
        tree.dispatch({ type: "CLEAR_SELECTION" });
      } else {
        exitApp();
      }
    }

    // Quit
    if (name === "q") {
      exitApp();
    }

    // ===== Extend-Select (Shift+hjkl) =====
    // Shift+j: Extend selection down
    if (name === "j" && shift && !meta) {
      tree.dispatch({ type: "EXTEND_SELECT_DOWN" });
    }
    // Shift+k: Extend selection up
    else if (name === "k" && shift && !meta) {
      tree.dispatch({ type: "EXTEND_SELECT_UP" });
    }
    // Shift+h: Extend selection left (cross-column)
    else if (name === "h" && shift && !meta) {
      tree.dispatch({ type: "EXTEND_SELECT_LEFT" });
    }
    // Shift+l: Extend selection right (cross-column)
    else if (name === "l" && shift && !meta) {
      tree.dispatch({ type: "EXTEND_SELECT_RIGHT" });
    }

    // ===== Cursor-Select (hjkl / arrows) =====
    // j/down = cursor down, k/up = cursor up
    else if (name === "up" || (name === "k" && !shift && !meta)) {
      tree.dispatch({ type: "CURSOR_MOVE", dir: "prev" });
    } else if (name === "down" || (name === "j" && !shift && !meta)) {
      tree.dispatch({ type: "CURSOR_MOVE", dir: "next" });
    } else if (name === "left" || name === "h") {
      // At card level (depth 2+), use cross-column navigation to preserve Y position
      if (tree.state.cursor.length >= 2) {
        const targetPath = calculateCrossColumnPath(
          "left",
          tree.state.cursor,
          tree.state.nodes,
        );
        if (targetPath) {
          tree.dispatch({ type: "NAV_TO_PATH", path: targetPath });
        }
      } else {
        // At column level (depth 1), move to previous sibling column
        tree.dispatch({ type: "CURSOR_MOVE", dir: "prev" });
      }
    } else if (name === "right" || name === "l") {
      // At card level (depth 2+), use cross-column navigation to preserve Y position
      if (tree.state.cursor.length >= 2) {
        const targetPath = calculateCrossColumnPath(
          "right",
          tree.state.cursor,
          tree.state.nodes,
        );
        if (targetPath) {
          tree.dispatch({ type: "NAV_TO_PATH", path: targetPath });
        }
      } else {
        // At column level (depth 1), move to next sibling column
        tree.dispatch({ type: "CURSOR_MOVE", dir: "next" });
      }
    } else if (name === "g" && !shift) {
      tree.dispatch({ type: "CURSOR_MOVE", dir: "first" });
    } else if (name === "g" && shift) {
      // Shift+G = jump to last sibling
      tree.dispatch({ type: "CURSOR_MOVE", dir: "last" });
    }

    // ===== Navigating (zoom/root change) =====

    // u - Navigate up (zoom out to parent root)
    else if (name === "u") {
      const currentRootId = tree.state.rootId;
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

    // [ - Navigate back in history (navigating)
    else if (name === "[") {
      const { navHistory, navHistoryIndex } = tree.state;
      if (navHistoryIndex > 0) {
        const prevEntry = navHistory[navHistoryIndex - 1];
        if (prevEntry) {
          // Navigate to the previous history entry
          const nodes = buildNodes(prevEntry.rootId);
          // Dispatch NAV_BACK to decrement index, then restore state
          tree.dispatch({ type: "NAV_BACK" });
          // After NAV_BACK, restore the actual view
          tree.dispatch({ type: "REFRESH", nodes });
          tree.dispatch({
            type: "NAV_TO_PATH",
            path: prevEntry.cursor,
          });
        }
      }
    }

    // ] - Navigate forward in history (navigating)
    else if (name === "]") {
      const { navHistory, navHistoryIndex } = tree.state;
      if (navHistoryIndex < navHistory.length - 1) {
        const nextEntry = navHistory[navHistoryIndex + 1];
        if (nextEntry) {
          // Navigate to the next history entry
          const nodes = buildNodes(nextEntry.rootId);
          // Dispatch NAV_FORWARD to increment index, then restore state
          tree.dispatch({ type: "NAV_FORWARD" });
          // After NAV_FORWARD, restore the actual view
          tree.dispatch({ type: "REFRESH", nodes });
          tree.dispatch({
            type: "NAV_TO_PATH",
            path: nextEntry.cursor,
          });
        }
      }
    }

    // View mode cycling
    else if (name === "v") {
      const currentIndex = VIEW_MODES.indexOf(viewMode);
      const nextIndex = (currentIndex + 1) % VIEW_MODES.length;
      const nextMode = VIEW_MODES[nextIndex];
      if (nextMode) {
        setViewMode(nextMode);
      }
    }

    // Help
    else if (name === "?" || (name === "/" && shift)) {
      tree.dispatch({ type: "TOGGLE_HELP_MODE" });
    }

    // Search
    else if (name === "/" && !shift) {
      tree.dispatch({ type: "TOGGLE_SEARCH_MODE" });
    }

    // New item
    else if (name === "n" && !shift && !meta) {
      tree.dispatch({ type: "TOGGLE_NEW_ITEM_MODE" });
    }

    // Project picker
    else if (name === "p" && !shift && !meta) {
      tree.dispatch({ type: "TOGGLE_PROJECT_PICKER" });
    }

    // Quick add shortcuts (open picker with prefix pre-populated)
    // @ - filter by @refs (people, contacts, references)
    // # - filter by #tags (categories, labels)
    // Note: + conflicts with INCREASE_CONTENT_LINES so not used here
    else if (name === "@" || name === "#") {
      tree.dispatch({ type: "TOGGLE_PROJECT_PICKER" });
      tree.dispatch({ type: "SET_PROJECT_PICKER_QUERY", query: name });
    }

    // Detail pane toggle
    else if (name === "i" && !shift && !meta) {
      tree.dispatch({ type: "TOGGLE_DETAIL_PANE" });
    }

    // Command palette
    else if (name === ":" || (name === "p" && ctrl)) {
      tree.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
    }

    // Move mode - m to enter, navigate to destination, Enter to confirm
    else if (name === "m" && !shift && !meta) {
      tree.dispatch({ type: "ENTER_MOVE_MODE" });
    }

    // ===== Editor Integration =====

    // e - Edit current card in $EDITOR at its line
    else if (name === "e") {
      if (currentCard) {
        const { filePath, line } = getNodeSourceInfo(currentCard.nodeId);
        if (filePath) {
          openInEditor(filePath, line);
        }
      }
    }

    // o - Open source file in $EDITOR (without line number)
    else if (name === "o") {
      if (currentCard) {
        const { filePath } = getNodeSourceInfo(currentCard.nodeId);
        if (filePath) {
          openInEditor(filePath);
        }
      }
    }

    // ===== Fold/Collapse =====

    // z - Fold all cards in current column
    else if (name === "z" && !shift) {
      const colIndex = tree.state.cursor[0] ?? 0;
      tree.dispatch({ type: "FOLD_LEVEL", depth: colIndex });
    }

    // Z - Unfold all cards in current column
    else if (name === "z" && shift) {
      const colIndex = tree.state.cursor[0] ?? 0;
      tree.dispatch({ type: "UNFOLD_LEVEL", depth: colIndex });
    }

    // c - Toggle collapse current column
    else if (name === "c") {
      if (currentColumn) {
        tree.dispatch({
          type: "TOGGLE_COLLAPSE",
          nodeId: currentColumn.nodeId,
        });
      }
    }

    // ===== Multi-Select (A - progressive select all) =====

    // A (Shift+a) - Progressive select all
    // First press: select all in current column
    // Second press: select all in all columns
    else if (name === "a" && shift) {
      if (currentColumn) {
        // Check if all cards in current column are already selected
        const allColumnSelected = currentColumn.children.every((child) =>
          tree.state.selectedNodes.has(child.nodeId),
        );

        if (!allColumnSelected) {
          // First press: select all in current column (siblings)
          tree.dispatch({ type: "SELECT_ALL_SIBLINGS" });
        } else {
          // Second press: select all in all columns
          tree.dispatch({ type: "SELECT_ALL" });
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
      if (targetCol !== undefined && targetCol < tree.state.nodes.length) {
        tree.dispatch({ type: "NAV_TO_PATH", path: [targetCol, 0] });
      }
    }

    // ===== Card Mutations =====
    //
    // These use the command system: Command → Action → Reducer → Effect Layer
    // Toggle/cycle logic lives in commands (they read state, compute target value)
    // Actions are idempotent (they set to a value, never toggle)

    // Space - Cycle task status (todo -> wip -> done -> dropped -> todo)
    else if (name === "space") {
      runCommand("cycle_task_status");
    }

    // x - Toggle done (quick toggle: if done -> todo, else -> done)
    else if (name === "x") {
      runCommand("toggle_task_done");
    }

    // d - Delete card
    else if (name === "d") {
      runCommand("delete_node");
    }

    // Tab - Indent (make child of previous sibling)
    // TODO: Convert to command system - needs richer context with storage access
    else if (name === "tab" && !shift) {
      if (currentCard && currentColumn) {
        const cardIndex = tree.state.cursor[1] ?? 0;
        // Can only indent if there's a previous sibling
        if (cardIndex > 0) {
          const prevSibling = currentColumn.children[cardIndex - 1];
          if (prevSibling) {
            // Get current children count of prev sibling to set parent_idx
            const prevSiblingChildren = getChildren(prevSibling.nodeId);
            // Move card to be last child of previous sibling
            const node = getNode(currentCard.nodeId);
            if (node) {
              tree.dispatch({
                type: "MOVE_NODE",
                nodeId: currentCard.nodeId,
                newParentId: prevSibling.nodeId,
                newIndex: prevSiblingChildren.length,
              });
            }
          }
        }
      }
    }

    // Shift+Tab - Outdent (move to parent's level)
    // TODO: Convert to command system - needs richer context with storage access
    else if (name === "tab" && shift) {
      if (currentCard) {
        const node = getNode(currentCard.nodeId);
        if (node && node.parent_id) {
          const parent = getNode(node.parent_id);
          if (parent && parent.parent_id !== undefined) {
            // Get siblings of parent to determine new parent_idx
            const parentSiblings = getChildren(parent.parent_id);
            const parentIdx = parentSiblings.findIndex(
              (s: DBNode) => s.id === parent.id,
            );
            // Place after parent
            tree.dispatch({
              type: "MOVE_NODE",
              nodeId: currentCard.nodeId,
              newParentId: parent.parent_id,
              newIndex: parentIdx + 1,
            });
          }
        }
      }
    }

    // ===== Navigating: Zoom In/Out =====

    // Enter - Zoom in (navigate into current card, make it new root)
    else if (name === "return") {
      if (currentCard) {
        // Build nodes from the card's children
        const newNodes = buildNodes(currentCard.nodeId);
        // Only zoom if the card has children
        if (newNodes.length > 0 || getChildren(currentCard.nodeId).length > 0) {
          tree.dispatch({
            type: "ZOOM_IN",
            nodeId: currentCard.nodeId,
            nodes: newNodes,
          });
        }
      }
    }

    // Backspace - Zoom out (navigate back to previous root from zoomStack)
    else if (name === "backspace") {
      if (tree.state.zoomStack.length > 0) {
        // Get the previous root from the stack
        const prevRootEntry =
          tree.state.zoomStack[tree.state.zoomStack.length - 1];
        const prevRootId = prevRootEntry?.rootId ?? null;
        const newNodes = buildNodes(prevRootId);
        tree.dispatch({ type: "ZOOM_OUT", nodes: newNodes });
      }
    }

    // ===== Shifting (opt+hjkl) - move nodes in visual direction =====
    // See km-board-navigation.md spec for terminology

    // opt+j - Shift down (swap with next sibling)
    else if (name === "j" && meta) {
      if (currentCard && currentColumn) {
        const cardIndex = tree.state.cursor[1] ?? 0;
        if (cardIndex < currentColumn.children.length - 1) {
          // Get the next sibling to swap with
          const nextCard = currentColumn.children[cardIndex + 1];
          if (nextCard) {
            const node = getNode(currentCard.nodeId);
            const nextNode = getNode(nextCard.nodeId);
            if (node && nextNode) {
              // Move after next sibling by using its index + 0.5
              const nextIdx = nextNode.parent_idx ?? 0;
              tree.dispatch({
                type: "UPDATE_NODE",
                nodeId: currentCard.nodeId,
                updates: { parent_idx: nextIdx + 0.5 },
              });
              tree.dispatch({ type: "CURSOR_MOVE", dir: "next" });
            }
          }
        }
      }
    }

    // opt+k - Shift up (swap with previous sibling)
    else if (name === "k" && meta) {
      if (currentCard && currentColumn) {
        const cardIndex = tree.state.cursor[1] ?? 0;
        if (cardIndex > 0) {
          // Get the previous sibling to swap with
          const prevCard = currentColumn.children[cardIndex - 1];
          if (prevCard) {
            const node = getNode(currentCard.nodeId);
            const prevNode = getNode(prevCard.nodeId);
            if (node && prevNode) {
              // Move before previous sibling
              const prevIdx = prevNode.parent_idx ?? 0;
              tree.dispatch({
                type: "UPDATE_NODE",
                nodeId: currentCard.nodeId,
                updates: { parent_idx: prevIdx - 0.5 },
              });
              tree.dispatch({ type: "CURSOR_MOVE", dir: "prev" });
            }
          }
        }
      }
    }

    // opt+h - Shift left (move to previous column / outdent)
    else if (name === "h" && meta) {
      const colIndex = tree.state.cursor[0] ?? 0;
      if (currentCard && colIndex > 0) {
        const prevColumn = tree.state.nodes[colIndex - 1];
        if (prevColumn) {
          // Move card to be a child of the previous column's node
          // Place at end of previous column
          const prevColumnChildren = getChildren(prevColumn.nodeId);
          tree.dispatch({
            type: "MOVE_NODE",
            nodeId: currentCard.nodeId,
            newParentId: prevColumn.nodeId,
            newIndex: prevColumnChildren.length,
          });
          // Move cursor to the new column and to the end where card was placed
          tree.dispatch({
            type: "NAV_TO_PATH",
            path: [colIndex - 1, prevColumnChildren.length],
          });
        }
      }
    }

    // opt+l - Shift right (move to next column / indent)
    else if (name === "l" && meta) {
      const colIndex = tree.state.cursor[0] ?? 0;
      if (currentCard && colIndex < tree.state.nodes.length - 1) {
        const nextColumn = tree.state.nodes[colIndex + 1];
        if (nextColumn) {
          // Move card to be a child of the next column's node
          // Place at end of next column
          const nextColumnChildren = getChildren(nextColumn.nodeId);
          tree.dispatch({
            type: "MOVE_NODE",
            nodeId: currentCard.nodeId,
            newParentId: nextColumn.nodeId,
            newIndex: nextColumnChildren.length,
          });
          // Move cursor to the new column and to the end where card was placed
          tree.dispatch({
            type: "NAV_TO_PATH",
            path: [colIndex + 1, nextColumnChildren.length],
          });
        }
      }
    }

    // Alt+1-9 - Move card to specific column
    else if (/^[1-9]$/.test(name) && meta) {
      const targetColIndex = parseInt(name, 10) - 1; // Convert 1-9 to 0-8
      if (currentCard && targetColIndex < tree.state.nodes.length) {
        const currentColIndex = tree.state.cursor[0] ?? 0;
        // Don't move if already in target column
        if (targetColIndex !== currentColIndex) {
          const targetColumn = tree.state.nodes[targetColIndex];
          if (targetColumn) {
            // Move card to be a child of the target column's node
            // Place at end of target column
            const targetColumnChildren = getChildren(targetColumn.nodeId);
            tree.dispatch({
              type: "MOVE_NODE",
              nodeId: currentCard.nodeId,
              newParentId: targetColumn.nodeId,
              newIndex: targetColumnChildren.length,
            });
            // Move cursor to the target column and to the end where card was placed
            tree.dispatch({
              type: "NAV_TO_PATH",
              path: [targetColIndex, targetColumnChildren.length],
            });
          }
        }
      }
    }

    // ===== Outline Depth Control =====

    // < - Decrease outline depth (show fewer nesting levels)
    else if (name === "<") {
      tree.dispatch({ type: "DECREASE_OUTLINE_DEPTH" });
    }

    // > - Increase outline depth (show more nesting levels)
    else if (name === ">") {
      tree.dispatch({ type: "INCREASE_OUTLINE_DEPTH" });
    }

    // + - Increase content lines (show more content per card)
    else if (name === "+" || (name === "=" && shift)) {
      tree.dispatch({ type: "INCREASE_CONTENT_LINES" });
    }

    // - - Decrease content lines (show less content per card)
    else if (name === "-") {
      tree.dispatch({ type: "DECREASE_CONTENT_LINES" });
    }

    // ===== Undo/Redo =====

    // Ctrl+Z - Undo
    else if (name === "z" && ctrl && !shift) {
      tree.undo();
    }

    // Ctrl+Shift+Z or Ctrl+Y - Redo
    else if ((name === "z" && ctrl && shift) || (name === "y" && ctrl)) {
      tree.redo();
    }
  });

  // Detail pane configuration
  const detailPaneWidth = 40;
  const detailPaneOpen = tree.state.detailPaneOpen;
  const mainViewWidth = detailPaneOpen ? width - detailPaneWidth : width;

  // Get TNode for detail pane (use currentNode from tree state, not DBNode)
  const selectedNode = tree.currentNode;
  const selectedChildCount = tree.currentNode?.childCount ?? 0;

  // Compute breadcrumbs for header
  // The first node (depth 0) is the board root, subsequent nodes are within the board
  const rawBreadcrumbs = useMemo(
    () => getBreadcrumbs(tree.state),
    [tree.state],
  );
  const breadcrumbs: BreadcrumbSegment[] = useMemo(
    () =>
      rawBreadcrumbs.map((node, idx) => ({
        id: node.nodeId,
        title: node.title,
        // First node is board name, rest are within board (columns, cards)
        isWithinBoard: idx > 0,
      })),
    [rawBreadcrumbs],
  );

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <Header
        rootPath={viewModel.rootPath}
        breadcrumbs={breadcrumbs}
        searchQuery={tree.state.searchQuery}
        searchMode={tree.state.searchMode}
        width={width}
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
            <CardsView viewModel={viewModel} height={height - 3} />
          )}

          {viewMode === "list" && (
            <ListView viewModel={viewModel} width={mainViewWidth} />
          )}

          {viewMode === "columns" && (
            <ColumnsView
              viewModel={viewModel}
              width={mainViewWidth}
              height={height - 3}
            />
          )}

          {viewMode === "tabs" && (
            <TabsView
              viewModel={viewModel}
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
        cursor={tree.state.cursor}
        nodeCount={tree.state.nodes.length}
        viewMode={viewMode}
        rootPath={tree.state.rootPath}
      />

      {/* Help overlay (shown when help mode is active) */}
      {tree.state.helpMode && <HelpOverlay width={width} height={height} />}

      {/* New item dialog (shown when new item mode is active) */}
      {tree.state.newItemMode && (
        <NewItemDialog text={tree.state.newItemText} width={width} />
      )}

      {/* Project picker (shown when project picker is open) */}
      {tree.state.projectPickerOpen && (
        <ProjectPicker
          projects={getChildren(null).map((node) => ({
            id: node.id,
            title: getNodeDisplayName(node),
            itemCount: getChildren(node.id).length,
          }))}
          query={tree.state.projectPickerQuery}
          selectedIndex={tree.state.projectPickerIndex}
          width={width}
          height={height}
        />
      )}

      {/* Command palette (shown when command palette is open) */}
      {tree.state.commandPaletteOpen && (
        <CommandPalette
          query={tree.state.commandPaletteQuery}
          selectedIndex={tree.state.commandPaletteIndex}
          width={width}
          height={height}
        />
      )}
    </box>
  );
}

export default App;
