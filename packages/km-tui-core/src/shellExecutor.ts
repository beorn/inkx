/**
 * Shell Executor for km-sh
 *
 * Executes commands against a TreeState and produces output.
 * Supports both JSON and line (human-readable) output modes.
 */

import type {
  TreeState,
  TreeAction,
  CursorPath,
  TreeNodeState,
  TaskStatus,
} from "./types.ts";
import { treeReducer, getNodeAtPath } from "./treeReducer.ts";
import { parseCommand, getCommandHelp } from "./commandParser.ts";
import type { ShellCommand } from "./commandParser.ts";

/**
 * Output event types for JSON mode
 */
export type OutputEvent =
  | { event: "init"; state: SerializedState; ts: number }
  | { event: "action"; action: TreeAction; ts: number }
  | { event: "state"; state: SerializedState; ts: number }
  | { event: "error"; error: string; ts: number }
  | { event: "output"; text: string; ts: number };

/**
 * Serialized state (Sets converted to arrays for JSON)
 */
export interface SerializedState {
  rootId: string | null;
  rootPath: string | null;
  cursor: CursorPath;
  selectedNodes: string[];
  foldedNodes: string[];
  collapsedNodes: string[];
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  nodeCount: number;
  topLevelCount: number;
}

/**
 * Action log entry for log/logs commands
 */
export interface ActionLogEntry {
  action: TreeAction;
  cursor: CursorPath;
  ts: number;
}

/**
 * Shell execution context
 */
export interface ShellContext {
  state: TreeState;
  jsonMode: boolean;
  verbose: boolean;
  output: (event: OutputEvent | string) => void;
  stdlog?: (line: string) => void;
  /** Action log for log command (optional, created on demand) */
  actionLog?: ActionLogEntry[];
}

/**
 * Serialize TreeState for JSON output
 */
export function serializeState(state: TreeState): SerializedState {
  // Count total nodes recursively
  function countNodes(nodes: TreeState["nodes"]): number {
    return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
  }

  return {
    rootId: state.rootId,
    rootPath: state.rootPath,
    cursor: state.cursor,
    selectedNodes: Array.from(state.selectedNodes),
    foldedNodes: Array.from(state.foldedNodes),
    collapsedNodes: Array.from(state.collapsedNodes),
    searchQuery: state.searchQuery,
    searchMode: state.searchMode,
    helpMode: state.helpMode,
    nodeCount: countNodes(state.nodes),
    topLevelCount: state.nodes.length,
  };
}

/**
 * Format state for human-readable output
 */
export function formatStateHuman(state: TreeState): string {
  const currentNode = getNodeAtPath(state.nodes, state.cursor);
  const lines: string[] = [
    `cursor: [${state.cursor.join(",")}]`,
    `node: ${currentNode?.title ?? "(none)"}`,
    `topLevel: ${state.nodes.length} nodes`,
  ];

  if (state.selectedNodes.size > 0) {
    lines.push(`selected: ${state.selectedNodes.size} nodes`);
  }
  if (state.searchMode) {
    lines.push(`search: "${state.searchQuery}"`);
  }
  if (state.foldedNodes.size > 0) {
    lines.push(`folded: ${state.foldedNodes.size} nodes`);
  }
  if (state.collapsedNodes.size > 0) {
    lines.push(`collapsed: ${state.collapsedNodes.size} nodes`);
  }

  return lines.join("\n");
}

/**
 * Render a simple ASCII view of the tree
 */
export function renderAsciiView(state: TreeState): string {
  const lines: string[] = [];

  // Header
  if (state.rootPath) {
    lines.push(`Path: ${state.rootPath}`);
    lines.push("");
  }

  // Render nodes recursively with indentation
  function renderNodes(
    nodes: TreeState["nodes"],
    path: CursorPath,
    indent: string,
  ) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const nodePath = [...path, i];
      const isSelected =
        state.cursor.length === nodePath.length &&
        state.cursor.every((v, idx) => v === nodePath[idx]);
      const marker = isSelected ? "→" : " ";
      const foldMarker = state.foldedNodes.has(node.nodeId) ? "▸" : " ";
      const statusIcon = node.taskStatus
        ? { todo: "○", wip: "◐", blocked: "⊘", done: "✓", dropped: "∅" }[
            node.taskStatus
          ]
        : " ";

      lines.push(
        `${indent}${marker}${foldMarker} ${statusIcon} ${node.title}${node.childCount > 0 ? ` (+${node.childCount})` : ""}`,
      );

      // Render children if not folded
      if (node.children.length > 0 && !state.foldedNodes.has(node.nodeId)) {
        renderNodes(node.children, nodePath, indent + "  ");
      }
    }
  }

  renderNodes(state.nodes, [], "");

  return lines.join("\n");
}

// ===== Filesystem-like command helpers =====

/**
 * Slugify a node title for path display
 * Converts "My Project" to "my-project"
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get the current path as a string of node titles
 * e.g., "projects/km/inbox"
 */
function getPathAsString(state: TreeState): string {
  if (state.cursor.length === 0) {
    return state.rootPath ? state.rootPath : "/";
  }

  const parts: string[] = [];
  let nodes = state.nodes;

  for (const idx of state.cursor) {
    const node = nodes[idx];
    if (!node) break;
    parts.push(node.title);
    nodes = node.children;
  }

  return parts.join("/") || "/";
}

/**
 * Find a child node by title or slug (case-insensitive)
 */
function findChildByName(
  nodes: TreeNodeState[],
  name: string,
): { node: TreeNodeState; index: number } | null {
  const lowerName = name.toLowerCase();
  const slugName = slugify(name);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;

    // Match by exact title (case-insensitive)
    if (node.title.toLowerCase() === lowerName) {
      return { node, index: i };
    }

    // Match by slugified title
    if (slugify(node.title) === slugName) {
      return { node, index: i };
    }

    // Match by nodeId
    if (node.nodeId === name) {
      return { node, index: i };
    }
  }

  return null;
}

/**
 * Resolve a path string to a cursor path
 * Supports: /, .., relative paths, absolute paths from root
 */
function resolvePath(
  state: TreeState,
  pathStr: string,
): { cursor: CursorPath; error?: string } {
  const parts = pathStr.split("/").filter((p) => p.length > 0);

  // Start from root or current position
  let cursor: CursorPath = pathStr.startsWith("/") ? [] : [...state.cursor];
  let nodes = state.nodes;

  // Navigate to the position indicated by cursor
  if (cursor.length > 0 && !pathStr.startsWith("/")) {
    for (const idx of cursor.slice(0, -1)) {
      const node = nodes[idx];
      if (!node) {
        return { cursor: [], error: "Invalid current path" };
      }
      nodes = node.children;
    }
    // Get the current node's children for relative navigation
    const lastIdx = cursor[cursor.length - 1];
    if (lastIdx !== undefined) {
      const currentNode = nodes[lastIdx];
      if (currentNode) {
        nodes = currentNode.children;
      }
    }
  }

  for (const part of parts) {
    if (part === "..") {
      // Go up one level
      if (cursor.length > 0) {
        cursor = cursor.slice(0, -1);
        // Recalculate nodes for the new position
        nodes = state.nodes;
        for (const idx of cursor) {
          const node = nodes[idx];
          if (node) {
            nodes = node.children;
          }
        }
      }
    } else if (part === ".") {
      // Stay at current position
      continue;
    } else {
      // Find child by name
      const found = findChildByName(nodes, part);
      if (!found) {
        return { cursor, error: `No such node: ${part}` };
      }
      cursor = [...cursor, found.index];
      nodes = found.node.children;
    }
  }

  return { cursor };
}

/**
 * Navigate to a path and return the new cursor or error
 */
function navigateToPath(
  state: TreeState,
  pathStr: string,
): { newCursor?: CursorPath; error?: string } {
  const result = resolvePath(state, pathStr);

  if (result.error) {
    return { error: result.error };
  }

  // Validate the cursor points to a valid node (or root)
  if (result.cursor.length === 0) {
    // Root - valid if we have nodes
    if (state.nodes.length > 0) {
      return { newCursor: [0] }; // Navigate to first top-level node
    }
    return { error: "No nodes at root" };
  }

  const node = getNodeAtPath(state.nodes, result.cursor);
  if (!node) {
    return { error: "Path not found" };
  }

  return { newCursor: result.cursor };
}

/**
 * List children of current or specified node
 */
function listNodes(state: TreeState, pathStr?: string): string {
  let nodes: TreeNodeState[];

  if (pathStr) {
    const result = resolvePath(state, pathStr);
    if (result.error) {
      return `ls: ${result.error}`;
    }

    if (result.cursor.length === 0) {
      // Root level
      nodes = state.nodes;
    } else {
      const node = getNodeAtPath(state.nodes, result.cursor);
      if (!node) {
        return "ls: path not found";
      }
      nodes = node.children;
    }
  } else {
    // List children of current node
    const currentNode = getNodeAtPath(state.nodes, state.cursor);
    if (currentNode) {
      nodes = currentNode.children;
    } else if (state.cursor.length === 0) {
      nodes = state.nodes;
    } else {
      return "ls: invalid cursor position";
    }
  }

  if (nodes.length === 0) {
    return "(empty)";
  }

  // Status icons map
  const statusIcons: Record<TaskStatus, string> = {
    todo: "○",
    wip: "◐",
    blocked: "⊘",
    done: "✓",
    dropped: "∅",
  };

  // Format output like ls
  const items = nodes.map((node) => {
    const suffix = node.children.length > 0 ? "/" : "";
    const taskMark = node.taskStatus ? statusIcons[node.taskStatus] + " " : "";
    return `${taskMark}${node.title}${suffix}`;
  });

  return items.join("  ");
}

/**
 * Render tree output with box-drawing characters
 */
function renderTreeCommand(
  state: TreeState,
  pathStr?: string,
  maxDepth?: number,
): string {
  let startNodes: TreeNodeState[];
  let rootTitle: string;

  if (pathStr) {
    const result = resolvePath(state, pathStr);
    if (result.error) {
      return `tree: ${result.error}`;
    }

    if (result.cursor.length === 0) {
      startNodes = state.nodes;
      rootTitle = state.rootPath || ".";
    } else {
      const node = getNodeAtPath(state.nodes, result.cursor);
      if (!node) {
        return "tree: path not found";
      }
      startNodes = [node];
      rootTitle = node.title;
    }
  } else {
    // Tree from current node
    const currentNode = getNodeAtPath(state.nodes, state.cursor);
    if (currentNode) {
      startNodes = [currentNode];
      rootTitle = currentNode.title;
    } else {
      startNodes = state.nodes;
      rootTitle = state.rootPath || ".";
    }
  }

  const lines: string[] = [rootTitle];
  const depth = maxDepth ?? 99;

  // Status icons map
  const statusIcons: Record<TaskStatus, string> = {
    todo: "○",
    wip: "◐",
    blocked: "⊘",
    done: "✓",
    dropped: "∅",
  };

  function renderNode(
    nodes: TreeNodeState[],
    prefix: string,
    currentDepth: number,
  ) {
    if (currentDepth > depth) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;

      const isLast = i === nodes.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      const taskMark = node.taskStatus
        ? statusIcons[node.taskStatus] + " "
        : "";

      const suffix =
        node.children.length > 0 && currentDepth >= depth
          ? ` (+${node.childCount})`
          : "";

      lines.push(`${prefix}${connector}${taskMark}${node.title}${suffix}`);

      if (node.children.length > 0 && currentDepth < depth) {
        renderNode(node.children, prefix + childPrefix, currentDepth + 1);
      }
    }
  }

  // If we're showing a single node, render its children
  if (startNodes.length === 1 && startNodes[0]) {
    renderNode(startNodes[0].children, "", 1);
  } else {
    // Render all top-level nodes
    renderNode(startNodes, "", 1);
  }

  return lines.join("\n");
}

/**
 * Show node content/details (cat command)
 */
function catNode(state: TreeState, pathStr?: string): string {
  let node: TreeNodeState | null;

  if (pathStr) {
    const result = resolvePath(state, pathStr);
    if (result.error) {
      return `cat: ${result.error}`;
    }
    node = getNodeAtPath(state.nodes, result.cursor);
  } else {
    node = getNodeAtPath(state.nodes, state.cursor);
  }

  if (!node) {
    return "cat: no node selected";
  }

  const lines: string[] = [];
  lines.push(`# ${node.title}`);
  lines.push(`id: ${node.nodeId}`);

  if (node.taskStatus) {
    lines.push(`status: ${node.taskStatus}`);
  }

  if (node.childCount > 0) {
    lines.push(`children: ${node.childCount}`);
  }

  // If there's content on the node (stored in TreeNodeState), show it
  // Note: TreeNodeState doesn't typically store full content, just metadata
  // For full content, we'd need access to the store

  return lines.join("\n");
}

/**
 * Execute a shell command (not a TreeAction)
 */
export function executeShellCommand(
  command: ShellCommand,
  ctx: ShellContext,
): { quit: boolean } {
  const ts = Date.now();

  switch (command.type) {
    case "STATE": {
      if (ctx.jsonMode) {
        ctx.output({ event: "state", state: serializeState(ctx.state), ts });
      } else {
        ctx.output(formatStateHuman(ctx.state));
      }
      return { quit: false };
    }

    case "VIEW": {
      const view = renderAsciiView(ctx.state);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: view, ts });
      } else {
        ctx.output(view);
      }
      return { quit: false };
    }

    case "HELP": {
      const help = getCommandHelp(command.topic);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: help, ts });
      } else {
        ctx.output(help);
      }
      return { quit: false };
    }

    case "LOG": {
      // Output last n actions (default: all)
      const log = ctx.actionLog ?? [];
      if (log.length === 0) {
        if (ctx.jsonMode) {
          ctx.output({ event: "output", text: "(no actions)", ts });
        } else {
          ctx.output("(no actions)");
        }
      } else {
        const count = command.count ?? log.length;
        const entries = log.slice(-count);
        const lines = entries.map(
          (entry) =>
            `${entry.action.type} → cursor=[${entry.cursor.join(",")}]`,
        );
        if (ctx.jsonMode) {
          ctx.output({ event: "output", text: lines.join("\n"), ts });
        } else {
          ctx.output(lines.join("\n"));
        }
      }
      return { quit: false };
    }

    case "QUIT":
      return { quit: true };

    // === Filesystem-like commands (REPL mode) ===

    case "PWD": {
      const path = getPathAsString(ctx.state);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: path, ts });
      } else {
        ctx.output(path);
      }
      return { quit: false };
    }

    case "LS": {
      const result = listNodes(ctx.state, command.path);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: result, ts });
      } else {
        ctx.output(result);
      }
      return { quit: false };
    }

    case "CD": {
      const result = navigateToPath(ctx.state, command.path);
      if (result.error) {
        if (ctx.jsonMode) {
          ctx.output({ event: "error", error: result.error, ts });
        } else {
          ctx.output(`cd: ${result.error}`);
        }
      } else if (result.newCursor) {
        // Update state cursor
        ctx.state = { ...ctx.state, cursor: result.newCursor };
        if (ctx.jsonMode) {
          ctx.output({ event: "state", state: serializeState(ctx.state), ts });
        } else if (ctx.verbose) {
          const node = getNodeAtPath(ctx.state.nodes, result.newCursor);
          ctx.output(`cd: ${node?.title ?? "(unknown)"}`);
        }
      }
      return { quit: false };
    }

    case "TREE": {
      const result = renderTreeCommand(ctx.state, command.path, command.depth);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: result, ts });
      } else {
        ctx.output(result);
      }
      return { quit: false };
    }

    case "CAT": {
      const result = catNode(ctx.state, command.path);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: result, ts });
      } else {
        ctx.output(result);
      }
      return { quit: false };
    }
  }
}

/**
 * Execute a TreeAction
 */
export function executeTreeAction(
  action: TreeAction,
  ctx: ShellContext,
): TreeState {
  const ts = Date.now();

  // Log the action (JSON mode to stdout, verbose mode to stderr via stdlog)
  if (ctx.jsonMode) {
    ctx.output({ event: "action", action, ts });
  } else if (ctx.verbose && ctx.stdlog) {
    ctx.stdlog(JSON.stringify({ event: "action", action, ts }));
  }

  // Execute the action
  const newState = treeReducer(ctx.state, action);

  // Record in action log for log command
  if (ctx.actionLog) {
    ctx.actionLog.push({
      action,
      cursor: newState.cursor,
      ts,
    });
  }

  // Log state change if something changed
  const changed =
    newState.cursor.length !== ctx.state.cursor.length ||
    !newState.cursor.every((v, i) => v === ctx.state.cursor[i]) ||
    newState.searchMode !== ctx.state.searchMode ||
    newState.helpMode !== ctx.state.helpMode ||
    newState.foldedNodes.size !== ctx.state.foldedNodes.size ||
    newState.collapsedNodes.size !== ctx.state.collapsedNodes.size ||
    newState.selectedNodes.size !== ctx.state.selectedNodes.size;

  if (changed) {
    if (ctx.jsonMode) {
      ctx.output({ event: "state", state: serializeState(newState), ts });
    } else if (ctx.verbose) {
      // Only output intermediate state changes in verbose mode
      const node = getNodeAtPath(newState.nodes, newState.cursor);
      ctx.output(
        `state: cursor=[${newState.cursor.join(",")}]${node ? ` "${node.title}"` : ""}`,
      );
    }
  }

  return newState;
}

/**
 * Execute a single command line
 * Returns new state and whether to quit
 */
export function executeCommand(
  line: string,
  ctx: ShellContext,
): { state: TreeState; quit: boolean } {
  const ts = Date.now();
  const result = parseCommand(line);

  // Key map used for KEY: and KEYS: markers
  // Uses structural navigation (prev/next/in/out) - no spatial logic here
  const keyMap: Record<string, TreeAction> = {
    // Navigation - vim style (structural actions)
    j: { type: "NAV_NEXT_SIBLING" },
    k: { type: "NAV_PREV_SIBLING" },
    h: { type: "NAV_PARENT" }, // h always goes to parent (no cross-column in shell)
    l: { type: "NAV_CHILD" }, // l always goes to child
    H: { type: "NAV_CROSS_COLUMN", direction: "left" },
    L: { type: "NAV_CROSS_COLUMN", direction: "right" },
    g: { type: "NAV_FIRST_SIBLING" },
    G: { type: "NAV_LAST_SIBLING" },
    Enter: { type: "NAV_CHILD" },
    Backspace: { type: "NAV_PARENT" },
    u: { type: "NAV_PARENT" },

    // History navigation
    "[": { type: "NAV_BACK" },
    "]": { type: "NAV_FORWARD" },

    // Selection
    A: { type: "SELECT_ALL_SIBLINGS" },
    Escape: { type: "CLEAR_SELECTION" },

    // View controls
    z: { type: "FOLD_LEVEL", depth: 1 },
    Z: { type: "UNFOLD_LEVEL", depth: 1 },
    "<": { type: "DECREASE_OUTLINE_DEPTH" },
    ">": { type: "INCREASE_OUTLINE_DEPTH" },
    "+": { type: "INCREASE_CONTENT_LINES" },
    "-": { type: "DECREASE_CONTENT_LINES" },

    // Modals
    "/": { type: "TOGGLE_SEARCH_MODE" },
    "?": { type: "TOGGLE_HELP_MODE" },
    n: { type: "TOGGLE_NEW_ITEM_MODE" },
    p: { type: "TOGGLE_PROJECT_PICKER" },
    i: { type: "TOGGLE_DETAIL_PANE" },
  };

  if (!result.ok) {
    // Check for special KEY: marker (single key)
    if (result.error.startsWith("KEY:")) {
      const key = result.error.slice(4);
      const action = keyMap[key];
      if (action) {
        const newState = executeTreeAction(action, ctx);
        return { state: newState, quit: false };
      } else {
        if (ctx.jsonMode) {
          ctx.output({ event: "error", error: `Unknown key: ${key}`, ts });
        } else {
          ctx.output(`error: Unknown key: ${key}`);
        }
        return { state: ctx.state, quit: false };
      }
    }

    // Check for special KEYS: marker (key sequence)
    if (result.error.startsWith("KEYS:")) {
      const keys = result.error.slice(5).split(",");
      let currentState = ctx.state;
      for (const key of keys) {
        const action = keyMap[key];
        if (action) {
          ctx.state = currentState;
          currentState = executeTreeAction(action, ctx);
        } else {
          if (ctx.jsonMode) {
            ctx.output({ event: "error", error: `Unknown key: ${key}`, ts });
          } else {
            ctx.output(`error: Unknown key: ${key}`);
          }
          return { state: currentState, quit: false };
        }
      }
      return { state: currentState, quit: false };
    }

    // Skip empty lines/comments silently
    if (result.error === "empty") {
      return { state: ctx.state, quit: false };
    }

    // Report error
    if (ctx.jsonMode) {
      ctx.output({ event: "error", error: result.error, ts });
    } else {
      ctx.output(`error: ${result.error}`);
    }
    return { state: ctx.state, quit: false };
  }

  // Execute shell command or tree action
  if ("command" in result) {
    const { quit } = executeShellCommand(result.command, ctx);
    return { state: ctx.state, quit };
  } else {
    const newState = executeTreeAction(result.action, ctx);
    return { state: newState, quit: false };
  }
}

/**
 * Run shell with input lines
 * Returns final state
 */
export function runShell(
  lines: string[],
  initialState: TreeState,
  options: {
    jsonMode?: boolean;
    verbose?: boolean;
    output?: (event: OutputEvent | string) => void;
    stdlog?: (line: string) => void;
  } = {},
): TreeState {
  const jsonMode = options.jsonMode ?? false;
  const verbose = options.verbose ?? false;
  const output =
    options.output ??
    ((e) => console.log(typeof e === "string" ? e : JSON.stringify(e)));
  const stdlog = options.stdlog ?? ((line) => console.error(line));

  // Initial state output
  const ts = Date.now();
  if (jsonMode) {
    output({ event: "init", state: serializeState(initialState), ts });
  }

  const ctx: ShellContext = {
    state: initialState,
    jsonMode,
    verbose,
    output,
    stdlog,
    actionLog: [],
  };

  for (const line of lines) {
    const { state, quit } = executeCommand(line, ctx);
    ctx.state = state;
    if (quit) break;
  }

  return ctx.state;
}
