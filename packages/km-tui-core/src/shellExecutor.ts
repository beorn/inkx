/**
 * Shell Executor for km-sh
 *
 * Executes commands against a TreeState and produces output.
 * Supports both JSON and line (human-readable) output modes.
 */

import type { TreeState, TreeAction, CursorPath } from "./types.ts";
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
  const keyMap: Record<string, TreeAction> = {
    // Navigation - vim style
    j: { type: "MOVE_DOWN" },
    k: { type: "MOVE_UP" },
    h: { type: "MOVE_LEFT" },
    l: { type: "MOVE_RIGHT" },
    g: { type: "JUMP_TOP" },
    G: { type: "JUMP_BOTTOM" },
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
