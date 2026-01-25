/**
 * Board - Navigation State Domain Object
 *
 * Wraps BoardStateLegacy and boardReducer with a simpler API.
 * Created via createBoard() factory function.
 *
 * The Board doesn't need Disposable - it's just state + reducer.
 */

import createDebug from "debug";
import type { KNode, TNode } from "@km/core";
import type {
  BoardStateLegacy,
  BoardActionLegacy,
  TPath,
  NodeDirection,
} from "./board-types.ts";
import {
  boardReducerLegacy,
  createBoardStateLegacy,
  findPathToNode,
} from "./board-reducer.ts";
import {
  getCurrentNode,
  getParentNode,
  getBreadcrumbs,
  isNodeFolded,
  getCursorColumnIndices,
} from "./selectors.ts";

const debug = createDebug("km:board:object");

/**
 * Minimal vault interface for Board.
 * Defined locally to avoid circular dependency with @km/storage.
 */
interface VaultInterface {
  readonly path: string;
  getNode(id: string): KNode | null;
  getChildren(parentId: string | null): KNode[];
}

/**
 * Board interface - navigation state domain object.
 * Plain object, no Disposable needed (stateless reducer wrapper).
 */
export interface Board {
  /** Current board state */
  readonly state: BoardStateLegacy;

  /** Vault this board is attached to */
  readonly vault: VaultInterface;

  // --- Navigation ---

  /** Move cursor in a direction */
  moveCursor(direction: NodeDirection): void;

  /** Move cursor to a specific path */
  moveTo(path: TPath): void;

  /** Move cursor to a specific node by ID */
  moveToNode(nodeId: string): void;

  /** Zoom into a node (make it the root) */
  zoom(nodeId: string): void;

  /** Zoom out to parent */
  zoomOut(): void;

  /** Navigate back in history */
  back(): void;

  /** Navigate forward in history */
  forward(): void;

  // --- Selection ---

  /** Toggle selection of a node */
  toggleSelect(nodeId: string): void;

  /** Select a range of nodes */
  selectRange(startId: string, endId: string): void;

  /** Clear all selections */
  clearSelection(): void;

  // --- Fold/Collapse ---

  /** Toggle fold state of a node */
  toggleFold(nodeId: string): void;

  /** Fold to a specific depth (0 = fold all) */
  foldToDepth(depth: number): void;

  /** Unfold to a specific depth (99 = unfold all) */
  unfoldToDepth(depth: number): void;

  // --- State Access ---

  /** Get the currently focused node */
  getCurrentNode(): TNode | null;

  /** Get the parent of the current node */
  getParentNode(): TNode | null;

  /** Get breadcrumb trail to current node */
  getBreadcrumbs(): TNode[];

  /** Check if a node is folded */
  isNodeFolded(nodeId: string): boolean;

  /** Get cursor position as [column, card] indices */
  getCursorPosition(): { column: number; card: number };

  // --- Refresh ---

  /** Refresh board state from vault */
  refresh(): void;

  /** Dispatch a raw action */
  dispatch(action: BoardActionLegacy): void;
}

/** Options for createBoard */
export interface BoardOptions {
  /** Initial root node ID */
  rootId?: string;
  /** Initial path within the vault (for NAV_TO) */
  rootPath?: string;
}

/**
 * Create a Board domain object.
 *
 * @example
 * using vault = runGenerator(createVault(path));
 * const board = createBoard(vault, { rootId: "projects" });
 *
 * board.moveCursor("down");
 * board.zoom(board.getCurrentNode()?.id);
 *
 * @param vault - Vault to attach to (must have getNode/getChildren)
 * @param options - Board options
 * @returns Board domain object
 */
export function createBoard(
  vault: VaultInterface,
  options?: BoardOptions,
): Board {
  debug("createBoard", { vaultPath: vault.path, options });

  // Build initial tree from vault
  const rootNode = options?.rootId ? vault.getNode(options.rootId) : null;
  const nodes = rootNode ? buildTree(vault, rootNode.id) : buildRootTree(vault);

  // Create initial state
  let state = createBoardStateLegacy(nodes, options?.rootId ?? null);

  const board: Board = {
    get state() {
      return state;
    },

    get vault() {
      return vault;
    },

    // Navigation
    moveCursor(direction: NodeDirection) {
      dispatch({ type: "CURSOR_MOVE", dir: direction });
    },

    moveTo(path: TPath) {
      dispatch({ type: "NAV_TO_PATH", path });
    },

    moveToNode(nodeId: string) {
      const path = findPathToNode(state.nodes, nodeId);
      if (path) {
        dispatch({ type: "NAV_TO_PATH", path });
      }
    },

    zoom(nodeId: string) {
      const targetNode = vault.getNode(nodeId);
      if (!targetNode) return;
      const nodes = buildTree(vault, nodeId);
      dispatch({ type: "ZOOM_IN", nodeId, nodes });
    },

    zoomOut() {
      if (state.zoomStack.length === 0) return;
      const parentEntry = state.zoomStack[state.zoomStack.length - 1];
      const nodes = parentEntry?.rootId
        ? buildTree(vault, parentEntry.rootId)
        : buildRootTree(vault);
      dispatch({ type: "ZOOM_OUT", nodes });
    },

    back() {
      dispatch({ type: "NAV_BACK" });
    },

    forward() {
      dispatch({ type: "NAV_FORWARD" });
    },

    // Selection
    toggleSelect(nodeId: string) {
      dispatch({ type: "SELECT_NODE_TOGGLE", nodeId });
    },

    selectRange(_startId: string, _endId: string) {
      // Range selection requires walking the visible tree
      // For now, just log - full implementation would iterate nodes
      debug("selectRange not yet implemented");
    },

    clearSelection() {
      dispatch({ type: "CLEAR_SELECTION" });
    },

    // Fold/Collapse
    toggleFold(nodeId: string) {
      dispatch({ type: "TOGGLE_FOLD", nodeId });
    },

    foldToDepth(depth: number) {
      dispatch({ type: "FOLD_LEVEL", depth });
    },

    unfoldToDepth(depth: number) {
      dispatch({ type: "UNFOLD_LEVEL", depth });
    },

    // State access
    getCurrentNode() {
      return getCurrentNode(state);
    },

    getParentNode() {
      return getParentNode(state);
    },

    getBreadcrumbs() {
      return getBreadcrumbs(state);
    },

    isNodeFolded(nodeId: string) {
      return isNodeFolded(state, nodeId);
    },

    getCursorPosition() {
      const indices = getCursorColumnIndices(state);
      return { column: indices.colIndex, card: indices.cardIndex };
    },

    // Refresh
    refresh() {
      debug("refreshing board");
      const rootNode = state.rootId ? vault.getNode(state.rootId) : null;
      const nodes = rootNode
        ? buildTree(vault, rootNode.id)
        : buildRootTree(vault);
      dispatch({ type: "REFRESH", nodes });
    },

    dispatch(action: BoardActionLegacy) {
      dispatch(action);
    },
  };

  return board;

  function dispatch(action: BoardActionLegacy) {
    state = boardReducer(state, action);
  }
}

/**
 * Build a tree from a vault starting at a root node.
 */
function buildTree(vault: VaultInterface, rootId: string): TNode[] {
  const rootNode = vault.getNode(rootId);
  if (!rootNode) return [];

  function buildNode(knode: KNode, depth: number): TNode {
    const children = vault.getChildren(knode.id);
    const builtChildren = children.map((c) => buildNode(c, depth + 1));

    return {
      // Spread all KNode fields
      ...knode,
      // Add TNode-specific fields
      children: builtChildren,
      depth,
      childCount: builtChildren.length,
      isTask: knode.task_status !== undefined,
      childrenLoaded: true,
    };
  }

  const children = vault.getChildren(rootId);
  return children.map((c) => buildNode(c, 0));
}

/**
 * Build the root tree (all top-level nodes).
 */
function buildRootTree(vault: VaultInterface): TNode[] {
  const topLevel = vault.getChildren(null);

  function buildNode(knode: KNode, depth: number): TNode {
    const children = vault.getChildren(knode.id);
    const builtChildren = children.map((c) => buildNode(c, depth + 1));

    return {
      // Spread all KNode fields
      ...knode,
      // Add TNode-specific fields
      children: builtChildren,
      depth,
      childCount: builtChildren.length,
      isTask: knode.task_status !== undefined,
      childrenLoaded: true,
    };
  }

  return topLevel.map((c) => buildNode(c, 0));
}
