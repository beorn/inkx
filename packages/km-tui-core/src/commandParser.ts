/**
 * Command Parser for km-sh
 *
 * Parses command strings (line mode or JSON mode) into BoardAction objects.
 * Supports:
 * - snake_case commands: move_down, jump_top, toggle_fold
 * - Key commands: key j, key <Enter>
 * - JSON actions: {"type": "MOVE_DOWN"}
 */

import type { BoardAction, ViewMode } from "./types.ts";

/**
 * Result of parsing a command
 */
export type ParseResult =
  | { ok: true; action: BoardAction }
  | { ok: true; command: ShellCommand }
  | { ok: false; error: string };

/**
 * Shell-specific commands (not BoardActions)
 */
export type ShellCommand =
  | { type: "STATE" } // Dump current state
  | { type: "VIEW" } // Render current view as ASCII
  | { type: "HELP"; topic?: string } // Show help
  | { type: "QUIT" }; // Exit shell

/**
 * Map of snake_case command names to BoardAction types
 */
const SIMPLE_ACTIONS: Record<string, BoardAction> = {
  // Navigation
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
  select_all_column: { type: "SELECT_ALL_COLUMN" },
  clear_selection: { type: "CLEAR_SELECTION" },

  // Modes
  toggle_search: { type: "TOGGLE_SEARCH_MODE" },
  toggle_help: { type: "TOGGLE_HELP_MODE" },
  toggle_new_item: { type: "TOGGLE_NEW_ITEM_MODE" },
  clear_new_item: { type: "CLEAR_NEW_ITEM" },
};

/**
 * Shell commands (not BoardActions)
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
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Parse a command string into a BoardAction or ShellCommand
 */
export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim();

  // Empty line - skip
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { ok: false, error: "empty" };
  }

  // JSON mode: starts with {
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.type) {
        return { ok: false, error: "JSON action missing 'type' field" };
      }
      return { ok: true, action: parsed as BoardAction };
    } catch (e) {
      return {
        ok: false,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Line mode: command [args...]
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Check shell commands first
  if (cmd in SHELL_COMMANDS) {
    const shellCmd = SHELL_COMMANDS[cmd];
    if (shellCmd.type === "HELP" && args.length > 0) {
      return { ok: true, command: { type: "HELP", topic: args[0] } };
    }
    return { ok: true, command: shellCmd };
  }

  // Check simple actions (no arguments)
  if (cmd in SIMPLE_ACTIONS) {
    return { ok: true, action: SIMPLE_ACTIONS[cmd] };
  }

  // Parameterized commands
  switch (cmd) {
    // key <keyspec> - raw key input
    case "key": {
      if (args.length === 0) {
        return { ok: false, error: "key command requires a key argument" };
      }
      const keySpec = args.join(" "); // Allow "key Ctrl-z" or "key <Ctrl-z>"
      const key = parseKeySpec(keySpec);
      if (!key) {
        return { ok: false, error: `Invalid key specification: ${keySpec}` };
      }
      // Key presses need to be mapped to actions by the caller
      // We return a special marker that the executor will handle
      return {
        ok: false,
        error: `KEY:${key}`, // Special marker for key handling
      };
    }

    // toggle_fold <cardId>
    case "toggle_fold": {
      if (args.length === 0) {
        return { ok: false, error: "toggle_fold requires a cardId argument" };
      }
      return { ok: true, action: { type: "TOGGLE_FOLD", cardId: args[0] } };
    }

    // fold_column <colIndex>
    case "fold_column": {
      const idx = parseInt(args[0], 10);
      if (isNaN(idx)) {
        return {
          ok: false,
          error: "fold_column requires a numeric column index",
        };
      }
      return { ok: true, action: { type: "FOLD_COLUMN", colIndex: idx } };
    }

    // unfold_column <colIndex>
    case "unfold_column": {
      const idx = parseInt(args[0], 10);
      if (isNaN(idx)) {
        return {
          ok: false,
          error: "unfold_column requires a numeric column index",
        };
      }
      return { ok: true, action: { type: "UNFOLD_COLUMN", colIndex: idx } };
    }

    // toggle_collapse <colIndex>
    case "toggle_collapse": {
      const idx = parseInt(args[0], 10);
      if (isNaN(idx)) {
        return {
          ok: false,
          error: "toggle_collapse requires a numeric column index",
        };
      }
      return { ok: true, action: { type: "TOGGLE_COLLAPSE", colIndex: idx } };
    }

    // select_card <col> <card>
    case "select_card": {
      const col = parseInt(args[0], 10);
      const card = parseInt(args[1], 10);
      if (isNaN(col) || isNaN(card)) {
        return {
          ok: false,
          error: "select_card requires two numeric arguments: col card",
        };
      }
      return { ok: true, action: { type: "SELECT_CARD", col, card } };
    }

    // select_card_add <nodeId>
    case "select_card_add": {
      if (args.length === 0) {
        return {
          ok: false,
          error: "select_card_add requires a nodeId argument",
        };
      }
      return { ok: true, action: { type: "SELECT_CARD_ADD", nodeId: args[0] } };
    }

    // select_card_remove <nodeId>
    case "select_card_remove": {
      if (args.length === 0) {
        return {
          ok: false,
          error: "select_card_remove requires a nodeId argument",
        };
      }
      return {
        ok: true,
        action: { type: "SELECT_CARD_REMOVE", nodeId: args[0] },
      };
    }

    // select_card_toggle <nodeId>
    case "select_card_toggle": {
      if (args.length === 0) {
        return {
          ok: false,
          error: "select_card_toggle requires a nodeId argument",
        };
      }
      return {
        ok: true,
        action: { type: "SELECT_CARD_TOGGLE", nodeId: args[0] },
      };
    }

    // set_view_mode <mode>
    case "set_view_mode": {
      const mode = args[0] as ViewMode;
      const validModes: ViewMode[] = ["cards", "list", "columns", "tabs"];
      if (!validModes.includes(mode)) {
        return {
          ok: false,
          error: `Invalid view mode: ${args[0]}. Valid: ${validModes.join(", ")}`,
        };
      }
      return { ok: true, action: { type: "SET_VIEW_MODE", mode } };
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
      move_up: "Move cursor up one card",
      move_down: "Move cursor down one card",
      move_left: "Move cursor left one column",
      move_right: "Move cursor right one column",
      jump_top: "Jump to first card in column",
      jump_bottom: "Jump to last card in column",
      toggle_fold: "toggle_fold <cardId> - Toggle fold state of a card",
      fold_column: "fold_column <index> - Fold all cards in column",
      unfold_column: "unfold_column <index> - Unfold all cards in column",
      toggle_collapse: "toggle_collapse <index> - Toggle column collapse",
      select_card: "select_card <col> <card> - Select specific card by index",
      key: "key <keyspec> - Send raw key (e.g., key j, key <Enter>)",
      state: "Dump current BoardState as JSON",
      view: "Render current view as ASCII",
      help: "help [command] - Show help",
      quit: "Exit the shell",
    };
    return helpText[topic] || `Unknown command: ${topic}`;
  }

  // General help
  return `km-sh commands:

Navigation:
  move_up, move_down, move_left, move_right
  jump_top, jump_bottom
  nav_back, nav_forward

Selection:
  select_card <col> <card>
  select_card_add <nodeId>
  select_card_remove <nodeId>
  select_card_toggle <nodeId>
  select_all, select_all_column, clear_selection

View:
  toggle_fold <cardId>
  fold_column <index>, unfold_column <index>
  toggle_collapse <index>
  set_view_mode <cards|list|columns|tabs>

Search:
  toggle_search
  set_search_query <query>

Shell:
  state - dump BoardState as JSON
  view - render ASCII view
  help [command] - show help
  quit, exit, q - exit shell

Key input:
  key <char> - single key (e.g., key j)
  key <Name> - special key (e.g., key Enter, key Escape)

JSON mode:
  {"type": "MOVE_DOWN"} - any valid BoardAction as JSON
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
    "fold_column",
    "unfold_column",
    "toggle_collapse",
    "select_card",
    "select_card_add",
    "select_card_remove",
    "select_card_toggle",
    "set_view_mode",
    "set_search_query",
    "set_new_item_text",
    "key",
  ];
}
