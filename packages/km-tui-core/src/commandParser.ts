/**
 * Command Parser for km-sh
 *
 * Parses command strings (line mode or JSON mode) into TreeAction objects.
 * Supports:
 * - snake_case commands: move_down, jump_top, toggle_fold
 * - Key commands: key j, key <Enter>
 * - JSON actions: {"type": "MOVE_DOWN"}
 */

import type { TreeAction } from "./types.ts";

/**
 * Result of parsing a command
 */
export type ParseResult =
  | { ok: true; action: TreeAction }
  | { ok: true; command: ShellCommand }
  | { ok: false; error: string };

/**
 * Shell-specific commands (not TreeActions)
 */
export type ShellCommand =
  | { type: "STATE" } // Dump current state
  | { type: "VIEW" } // Render current view as ASCII
  | { type: "HELP"; topic?: string } // Show help
  | { type: "LOG"; count?: number } // Dump last n actions (default: all)
  | { type: "QUIT" }; // Exit shell

/**
 * Map of snake_case command names to TreeAction types
 */
const SIMPLE_ACTIONS: Record<string, TreeAction> = {
  // Navigation (path-based)
  nav_prev_sibling: { type: "NAV_PREV_SIBLING" },
  nav_next_sibling: { type: "NAV_NEXT_SIBLING" },
  nav_parent: { type: "NAV_PARENT" },
  nav_child: { type: "NAV_CHILD" },

  // Legacy navigation (mapped to path-based)
  move_up: { type: "MOVE_UP" },
  move_down: { type: "MOVE_DOWN" },
  move_left: { type: "MOVE_LEFT" },
  move_right: { type: "MOVE_RIGHT" },
  jump_top: { type: "JUMP_TOP" },
  jump_bottom: { type: "JUMP_BOTTOM" },

  // History navigation
  nav_back: { type: "NAV_BACK" },
  nav_forward: { type: "NAV_FORWARD" },

  // Multi-select
  select_all: { type: "SELECT_ALL" },
  select_all_siblings: { type: "SELECT_ALL_SIBLINGS" },
  clear_selection: { type: "CLEAR_SELECTION" },

  // Modes
  toggle_search: { type: "TOGGLE_SEARCH_MODE" },
  toggle_help: { type: "TOGGLE_HELP_MODE" },
  toggle_new_item: { type: "TOGGLE_NEW_ITEM_MODE" },
  clear_new_item: { type: "CLEAR_NEW_ITEM" },
  toggle_detail_pane: { type: "TOGGLE_DETAIL_PANE" },

  // Outline depth
  increase_outline_depth: { type: "INCREASE_OUTLINE_DEPTH" },
  decrease_outline_depth: { type: "DECREASE_OUTLINE_DEPTH" },
  increase_content_lines: { type: "INCREASE_CONTENT_LINES" },
  decrease_content_lines: { type: "DECREASE_CONTENT_LINES" },
};

/**
 * Shell commands (not TreeActions)
 * Note: 'log' is handled specially in parseCommand to support optional count arg
 */
const SHELL_COMMANDS: Record<string, ShellCommand> = {
  state: { type: "STATE" },
  view: { type: "VIEW" },
  help: { type: "HELP" },
  quit: { type: "QUIT" },
  exit: { type: "QUIT" },
  q: { type: "QUIT" },
};

/**
 * Single-char commands mapped to actions or special handling
 * These can be used directly without the "key" prefix
 */
const SINGLE_CHAR_MAP: Record<string, TreeAction | "KEY"> = {
  // Navigation - vim style
  j: { type: "MOVE_DOWN" },
  k: { type: "MOVE_UP" },
  h: { type: "MOVE_LEFT" },
  l: { type: "MOVE_RIGHT" },
  g: { type: "JUMP_TOP" },
  G: { type: "JUMP_BOTTOM" },
  u: { type: "NAV_PARENT" },

  // History navigation
  "[": { type: "NAV_BACK" },
  "]": { type: "NAV_FORWARD" },

  // Selection
  A: { type: "SELECT_ALL_SIBLINGS" },

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

/**
 * Parse a quoted string like "jjk" into individual characters
 * Simple: just splits the string into characters
 */
export function parseQuotedString(input: string): string[] | null {
  // Must start and end with quotes
  if (
    !(
      (input.startsWith('"') && input.endsWith('"')) ||
      (input.startsWith("'") && input.endsWith("'"))
    )
  ) {
    return null;
  }

  const content = input.slice(1, -1);
  return content.split("");
}

/**
 * Map of special key names (case-insensitive) to canonical form
 */
const SPECIAL_KEYS: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  space: " ",
};

/**
 * Parse a key specification like "j", "<Enter>", "<Ctrl-z>"
 * Returns the key name for use in key simulation
 */
export function parseKeySpec(spec: string): string | null {
  // Simple single character
  if (spec.length === 1) {
    return spec;
  }

  // Special key in angle brackets: <Enter>, <Escape>, <Tab>, <Ctrl-z>
  const match = spec.match(/^<(.+)>$/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Parse a command string into a TreeAction or ShellCommand
 */
export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim();

  // Empty line - skip
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { ok: false, error: "empty" };
  }

  // Quoted key sequence: "jjk" or 'jjk'
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const keys = parseQuotedString(trimmed);
    if (keys && keys.length > 0) {
      // Return special marker for key sequence
      return { ok: false, error: `KEYS:${keys.join(",")}` };
    }
    return { ok: false, error: `Invalid key sequence: ${trimmed}` };
  }

  // JSON mode: starts with {
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.type) {
        return { ok: false, error: "JSON action missing 'type' field" };
      }
      return { ok: true, action: parsed as TreeAction };
    } catch (e) {
      return {
        ok: false,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Line mode: command [args...]
  const parts = trimmed.split(/\s+/);
  const firstPart = parts[0];
  if (!firstPart) {
    return { ok: false, error: "empty" };
  }
  const cmd = firstPart.toLowerCase();
  const args = parts.slice(1);

  // Check shell commands first (including 'q' for quit)
  const shellCmd = SHELL_COMMANDS[cmd];
  if (shellCmd) {
    if (shellCmd.type === "HELP" && args.length > 0) {
      return { ok: true, command: { type: "HELP", topic: args[0] } };
    }
    return { ok: true, command: shellCmd };
  }

  // Check simple actions (no arguments)
  const simpleAction = SIMPLE_ACTIONS[cmd];
  if (simpleAction) {
    return { ok: true, action: simpleAction };
  }

  // Single character command (without arguments) - after checking shell/simple commands
  if (trimmed.length === 1) {
    const singleCharAction = SINGLE_CHAR_MAP[trimmed];
    if (singleCharAction && singleCharAction !== "KEY") {
      return { ok: true, action: singleCharAction };
    }
    // Treat as key press
    return { ok: false, error: `KEY:${trimmed}` };
  }

  // Parameterized commands
  switch (cmd) {
    // log [n] - show last n actions (default: all)
    case "log": {
      const countArg = args[0];
      if (countArg) {
        const count = parseInt(countArg, 10);
        if (isNaN(count) || count < 1) {
          return { ok: false, error: "log count must be a positive number" };
        }
        return { ok: true, command: { type: "LOG", count } };
      }
      return { ok: true, command: { type: "LOG" } };
    }

    // key <keyspec> - raw key input
    // Supports: key j, key esc, key enter, key "jjk"
    case "key": {
      if (args.length === 0) {
        return { ok: false, error: "key command requires a key argument" };
      }
      const keySpec = args.join(" ");

      // Check if it's a quoted string: key "jjk"
      if (
        (keySpec.startsWith('"') && keySpec.endsWith('"')) ||
        (keySpec.startsWith("'") && keySpec.endsWith("'"))
      ) {
        const keys = parseQuotedString(keySpec);
        if (keys && keys.length > 0) {
          return { ok: false, error: `KEYS:${keys.join(",")}` };
        }
        return { ok: false, error: `Invalid key sequence: ${keySpec}` };
      }

      // Check if it's a special key name (esc, enter, tab, etc.)
      const specialKey = SPECIAL_KEYS[keySpec.toLowerCase()];
      if (specialKey) {
        return { ok: false, error: `KEY:${specialKey}` };
      }

      // Single character or use parseKeySpec for <Name> format
      const key = parseKeySpec(keySpec);
      if (!key) {
        return { ok: false, error: `Invalid key specification: ${keySpec}` };
      }
      return { ok: false, error: `KEY:${key}` };
    }

    // toggle_fold <nodeId>
    case "toggle_fold": {
      const nodeId = args[0];
      if (!nodeId) {
        return { ok: false, error: "toggle_fold requires a nodeId argument" };
      }
      return { ok: true, action: { type: "TOGGLE_FOLD", nodeId } };
    }

    // toggle_collapse <nodeId>
    case "toggle_collapse": {
      const nodeId = args[0];
      if (!nodeId) {
        return {
          ok: false,
          error: "toggle_collapse requires a nodeId argument",
        };
      }
      return { ok: true, action: { type: "TOGGLE_COLLAPSE", nodeId } };
    }

    // fold_level <depth>
    case "fold_level": {
      const depthArg = args[0];
      if (!depthArg) {
        return {
          ok: false,
          error: "fold_level requires a numeric depth argument",
        };
      }
      const depth = parseInt(depthArg, 10);
      if (isNaN(depth)) {
        return {
          ok: false,
          error: "fold_level requires a numeric depth argument",
        };
      }
      return { ok: true, action: { type: "FOLD_LEVEL", depth } };
    }

    // unfold_level <depth>
    case "unfold_level": {
      const depthArg = args[0];
      if (!depthArg) {
        return {
          ok: false,
          error: "unfold_level requires a numeric depth argument",
        };
      }
      const depth = parseInt(depthArg, 10);
      if (isNaN(depth)) {
        return {
          ok: false,
          error: "unfold_level requires a numeric depth argument",
        };
      }
      return { ok: true, action: { type: "UNFOLD_LEVEL", depth } };
    }

    // nav_to_path <path> - navigate to specific path (e.g., "0,1,2")
    case "nav_to_path": {
      const pathArg = args[0];
      if (!pathArg) {
        return { ok: false, error: "nav_to_path requires a path argument" };
      }
      const path = pathArg.split(",").map((s) => parseInt(s, 10));
      if (path.some(isNaN)) {
        return {
          ok: false,
          error: "nav_to_path requires comma-separated numeric indices",
        };
      }
      return { ok: true, action: { type: "NAV_TO_PATH", path } };
    }

    // select_position <path> - select specific position
    case "select_position": {
      const pathArg = args[0];
      if (!pathArg) {
        return { ok: false, error: "select_position requires a path argument" };
      }
      const path = pathArg.split(",").map((s) => parseInt(s, 10));
      if (path.some(isNaN)) {
        return {
          ok: false,
          error: "select_position requires comma-separated numeric indices",
        };
      }
      return { ok: true, action: { type: "SELECT_POSITION", path } };
    }

    // select_node_add <nodeId>
    case "select_node_add": {
      const nodeId = args[0];
      if (!nodeId) {
        return {
          ok: false,
          error: "select_node_add requires a nodeId argument",
        };
      }
      return { ok: true, action: { type: "SELECT_NODE_ADD", nodeId } };
    }

    // select_node_remove <nodeId>
    case "select_node_remove": {
      const nodeId = args[0];
      if (!nodeId) {
        return {
          ok: false,
          error: "select_node_remove requires a nodeId argument",
        };
      }
      return {
        ok: true,
        action: { type: "SELECT_NODE_REMOVE", nodeId },
      };
    }

    // select_node_toggle <nodeId>
    case "select_node_toggle": {
      const nodeId = args[0];
      if (!nodeId) {
        return {
          ok: false,
          error: "select_node_toggle requires a nodeId argument",
        };
      }
      return {
        ok: true,
        action: { type: "SELECT_NODE_TOGGLE", nodeId },
      };
    }

    // set_search_query <query>
    case "set_search_query": {
      const query = args.join(" ");
      return { ok: true, action: { type: "SET_SEARCH_QUERY", query } };
    }

    // set_new_item_text <text>
    case "set_new_item_text": {
      const text = args.join(" ");
      return { ok: true, action: { type: "SET_NEW_ITEM_TEXT", text } };
    }

    // set_project_picker_query <query>
    case "set_project_picker_query": {
      const query = args.join(" ");
      return { ok: true, action: { type: "SET_PROJECT_PICKER_QUERY", query } };
    }

    default:
      return { ok: false, error: `Unknown command: ${cmd}` };
  }
}

/**
 * Get help text for available commands
 */
export function getCommandHelp(topic?: string): string {
  if (topic) {
    // Specific command help
    const helpText: Record<string, string> = {
      nav_prev_sibling: "Move to previous sibling at same level",
      nav_next_sibling: "Move to next sibling at same level",
      nav_parent: "Move up one level to parent",
      nav_child: "Move down into first child",
      move_up: "Move cursor up (alias for nav_prev_sibling)",
      move_down: "Move cursor down (alias for nav_next_sibling)",
      move_left: "Move cursor left (parent or prev column)",
      move_right: "Move cursor right (child or next column)",
      jump_top: "Jump to first sibling",
      jump_bottom: "Jump to last sibling",
      toggle_fold: "toggle_fold <nodeId> - Toggle fold state of a node",
      toggle_collapse: "toggle_collapse <nodeId> - Toggle collapse state",
      fold_level: "fold_level <depth> - Fold all nodes at depth",
      unfold_level: "unfold_level <depth> - Unfold all nodes at depth",
      nav_to_path: "nav_to_path <path> - Navigate to path (e.g., 0,1,2)",
      select_position: "select_position <path> - Select specific position",
      key: "key <keyspec> - Send raw key (e.g., key j, key <Enter>)",
      state: "Dump current TreeState as JSON",
      view: "Render current view as ASCII",
      help: "help [command] - Show help",
      quit: "Exit the shell",
    };
    return helpText[topic] || `Unknown command: ${topic}`;
  }

  // General help
  return `km-sh commands:

Navigation (path-based):
  nav_prev_sibling, nav_next_sibling
  nav_parent, nav_child
  nav_to_path <path> (e.g., 0,1,2)
  nav_back, nav_forward

Navigation (legacy, mapped to path-based):
  move_up, move_down, move_left, move_right
  jump_top, jump_bottom

Selection:
  select_position <path>
  select_node_add <nodeId>
  select_node_remove <nodeId>
  select_node_toggle <nodeId>
  select_all, select_all_siblings, clear_selection

View:
  toggle_fold <nodeId>
  toggle_collapse <nodeId>
  fold_level <depth>, unfold_level <depth>
  increase_outline_depth, decrease_outline_depth
  increase_content_lines, decrease_content_lines

Search:
  toggle_search
  set_search_query <query>

Shell:
  state - dump TreeState as JSON
  view - render ASCII view
  help [command] - show help
  quit, exit, q - exit shell

Key input:
  key <char> - single key (e.g., key j)
  key <Name> - special key (e.g., key Enter, key Escape)

JSON mode:
  {"type": "MOVE_DOWN"} - any valid TreeAction as JSON
`;
}

/**
 * Get all available command names (for completion)
 */
export function getCommandNames(): string[] {
  return [
    ...Object.keys(SIMPLE_ACTIONS),
    ...Object.keys(SHELL_COMMANDS),
    "toggle_fold",
    "toggle_collapse",
    "fold_level",
    "unfold_level",
    "nav_to_path",
    "select_position",
    "select_node_add",
    "select_node_remove",
    "select_node_toggle",
    "set_search_query",
    "set_new_item_text",
    "set_project_picker_query",
    "key",
  ];
}
