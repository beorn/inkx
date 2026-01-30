/**
 * Command Parser for km-sh
 *
 * Parses command strings (line mode or JSON mode) into BoardAction objects.
 * Supports:
 * - snake_case commands: cursor_next, cursor_prev, toggle_fold
 * - Key commands: key j, key <Enter>
 * - JSON actions: {"type": "CURSOR_NEXT"}
 */

import type { BoardAction } from "./board-types.ts"
import type { TaskStatus } from "@km/core"

/**
 * Result of parsing a command
 */
export type ParseResult =
  | { ok: true; action: BoardAction }
  | { ok: true; command: ShellCommand }
  | { ok: false; error: string }

/**
 * Shell-specific commands (not BoardActions)
 */
export type ShellCommand =
  | { type: "STATE" } // Dump current state
  | { type: "VIEW" } // Render current view as ASCII
  | { type: "RENDER"; width?: number; height?: number; ansi?: boolean } // Render TUI-style view using inkx
  | { type: "HELP"; topic?: string } // Show help
  | { type: "LOG"; count?: number } // Dump last n actions (default: all)
  | { type: "QUIT" } // Exit shell
  // Filesystem-like commands (REPL mode)
  | { type: "PWD" } // Show current path as slugs
  | { type: "LS"; path?: string } // List children
  | { type: "CD"; path: string } // Change to node
  | { type: "TREE"; path?: string; depth?: number } // Hierarchical listing
  | { type: "CAT"; path?: string } // Show node content/details
  // Mutation commands (require storage integration)
  | { type: "SET_STATUS"; status: TaskStatus } // Set task status
  | { type: "DELETE" } // Delete current node
  | { type: "SHIFT"; direction: "up" | "down" } // Move node within siblings

/**
 * Map of snake_case command names to BoardAction types
 */
const SIMPLE_ACTIONS: Record<string, BoardAction> = {
  // Structural cursor movement (prev/next/in/out)
  cursor_prev: { type: "CURSOR_MOVE", dir: "prev" },
  cursor_next: { type: "CURSOR_MOVE", dir: "next" },
  cursor_in: { type: "CURSOR_MOVE", dir: "in" },
  cursor_out: { type: "CURSOR_MOVE", dir: "out" },
  cursor_first: { type: "CURSOR_MOVE", dir: "first" },
  cursor_last: { type: "CURSOR_MOVE", dir: "last" },

  // Visual cursor movement (up/down/left/right)
  cursor_up: { type: "CURSOR_MOVE", dir: "up" },
  cursor_down: { type: "CURSOR_MOVE", dir: "down" },
  cursor_left: { type: "CURSOR_MOVE", dir: "left" },
  cursor_right: { type: "CURSOR_MOVE", dir: "right" },

  // Cross-column navigation (preserves Y position)
  nav_cross_column_left: { type: "NAV_CROSS_COLUMN", direction: "left" },
  nav_cross_column_right: { type: "NAV_CROSS_COLUMN", direction: "right" },

  // History navigation
  nav_back: { type: "NAV_BACK" },
  nav_forward: { type: "NAV_FORWARD" },

  // Multi-select
  select_all: { type: "SELECT_ALL" },
  select_all_siblings: { type: "SELECT_ALL_SIBLINGS" },
  clear_selection: { type: "CLEAR_SELECTION" },

  // Extend-select (shift+direction)
  extend_select_up: { type: "EXTEND_SELECT_UP" },
  extend_select_down: { type: "EXTEND_SELECT_DOWN" },
  extend_select_left: { type: "EXTEND_SELECT_LEFT" },
  extend_select_right: { type: "EXTEND_SELECT_RIGHT" },

  // Shifting (opt+direction) - move nodes visually
  // NOTE: shift_up/shift_down are mutation commands (ShellCommand),
  // handled in the switch statement below, not here as BoardActions.
  // They require storage integration to persist changes.
  shift_left: { type: "SHIFT_LEFT" },
  shift_right: { type: "SHIFT_RIGHT" },

  // Moving (m + destination) - move nodes to arbitrary location
  enter_move_mode: { type: "ENTER_MOVE_MODE" },
  confirm_move: { type: "CONFIRM_MOVE" },
  cancel_move: { type: "CANCEL_MOVE" },

  // View configuration
  increase_outline_depth: { type: "INCREASE_OUTLINE_DEPTH" },
  decrease_outline_depth: { type: "DECREASE_OUTLINE_DEPTH" },
  increase_content_lines: { type: "INCREASE_CONTENT_LINES" },
  decrease_content_lines: { type: "DECREASE_CONTENT_LINES" },
}

/**
 * Shell commands (not BoardActions)
 * Note: 'log', 'ls', 'cd', 'tree', 'cat' are handled specially in parseCommand to support args
 */
const SHELL_COMMANDS: Record<string, ShellCommand> = {
  state: { type: "STATE" },
  view: { type: "VIEW" },
  help: { type: "HELP" },
  quit: { type: "QUIT" },
  exit: { type: "QUIT" },
  q: { type: "QUIT" },
  pwd: { type: "PWD" },
}

/**
 * Single-char commands mapped to actions or special handling
 * These can be used directly without the "key" prefix
 */
const SINGLE_CHAR_MAP: Record<string, BoardAction | "KEY"> = {
  // Structural cursor movement (vim style hjkl)
  j: { type: "CURSOR_MOVE", dir: "next" }, // Next sibling
  k: { type: "CURSOR_MOVE", dir: "prev" }, // Previous sibling
  h: { type: "CURSOR_MOVE", dir: "out" }, // To parent
  l: { type: "CURSOR_MOVE", dir: "in" }, // Into child
  g: { type: "CURSOR_MOVE", dir: "first" }, // First sibling
  G: { type: "CURSOR_MOVE", dir: "last" }, // Last sibling
  u: { type: "CURSOR_MOVE", dir: "out" }, // Alias for h

  // Cross-column navigation
  H: { type: "NAV_CROSS_COLUMN", direction: "left" },
  L: { type: "NAV_CROSS_COLUMN", direction: "right" },

  // History navigation
  "[": { type: "NAV_BACK" },
  "]": { type: "NAV_FORWARD" },

  // Selection
  A: { type: "SELECT_ALL_SIBLINGS" },

  // Fold controls
  z: { type: "TOGGLE_FOLD_CURRENT" },
  Z: { type: "UNFOLD_ALL" },

  // View configuration
  "<": { type: "DECREASE_OUTLINE_DEPTH" },
  ">": { type: "INCREASE_OUTLINE_DEPTH" },
  "+": { type: "INCREASE_CONTENT_LINES" },
  "-": { type: "DECREASE_CONTENT_LINES" },
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
}

/**
 * Valid task statuses
 */
const VALID_STATUSES: TaskStatus[] = [
  "todo",
  "wip",
  "blocked",
  "done",
  "dropped",
]

/**
 * Parse a quoted string like "jjk" into individual characters
 */
function parseQuotedString(input: string): string[] | null {
  if (
    !(
      (input.startsWith('"') && input.endsWith('"')) ||
      (input.startsWith("'") && input.endsWith("'"))
    )
  ) {
    return null
  }
  return input.slice(1, -1).split("")
}

/**
 * Check if input is a quoted string
 */
function isQuotedString(input: string): boolean {
  return (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  )
}

/**
 * Parse a key specification like "j", "<Enter>", "<Ctrl-z>"
 */
export function parseKeySpec(spec: string): string | null {
  if (spec.length === 1) return spec
  const match = spec.match(/^<(.+)>$/)
  return match?.[1] ?? null
}

/**
 * Parse numeric argument, returns error message or parsed number
 */
function parseNumericArg(
  arg: string | undefined,
  cmdName: string,
): { value: number } | { error: string } {
  if (!arg) {
    return { error: `${cmdName} requires a numeric argument` }
  }
  const num = parseInt(arg, 10)
  if (isNaN(num)) {
    return { error: `${cmdName} requires a numeric argument` }
  }
  return { value: num }
}

/**
 * Parse required nodeId argument
 */
function parseNodeIdArg(
  arg: string | undefined,
  cmdName: string,
): { nodeId: string } | { error: string } {
  if (!arg) {
    return { error: `${cmdName} requires a nodeId argument` }
  }
  return { nodeId: arg }
}

/**
 * Parse comma-separated path like "0,1,2"
 */
function parsePathArg(
  arg: string | undefined,
  cmdName: string,
): { path: number[] } | { error: string } {
  if (!arg) {
    return { error: `${cmdName} requires a path argument` }
  }
  const path = arg.split(",").map((s) => parseInt(s, 10))
  if (path.some(isNaN)) {
    return { error: `${cmdName} requires comma-separated numeric indices` }
  }
  return { path }
}

// ============================================================================
// Command Parsers - each returns ParseResult or null (not handled)
// ============================================================================

/**
 * Parse quoted key sequence: "jjk" or 'jjk'
 */
function parseQuotedKeySequence(trimmed: string): ParseResult | null {
  if (!isQuotedString(trimmed)) return null

  const keys = parseQuotedString(trimmed)
  if (keys && keys.length > 0) {
    return { ok: false, error: `KEYS:${keys.join(",")}` }
  }
  return { ok: false, error: `Invalid key sequence: ${trimmed}` }
}

/**
 * Parse JSON action: {"type": "CURSOR_NEXT"}
 */
function parseJsonAction(trimmed: string): ParseResult | null {
  if (!trimmed.startsWith("{")) return null

  try {
    const parsed = JSON.parse(trimmed) as { type?: string }
    if (!parsed.type) {
      return { ok: false, error: "JSON action missing 'type' field" }
    }
    return { ok: true, action: parsed as unknown as BoardAction }
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * Parse 'log' command: log [n]
 */
function parseLogCommand(args: string[]): ParseResult {
  const countArg = args[0]
  if (!countArg) {
    return { ok: true, command: { type: "LOG" } }
  }
  const count = parseInt(countArg, 10)
  if (isNaN(count) || count < 1) {
    return { ok: false, error: "log count must be a positive number" }
  }
  return { ok: true, command: { type: "LOG", count } }
}

/**
 * Parse 'key' command: key <keyspec>
 */
function parseKeyCommand(args: string[]): ParseResult {
  if (args.length === 0) {
    return { ok: false, error: "key command requires a key argument" }
  }
  const keySpec = args.join(" ")

  // Quoted string: key "jjk"
  if (isQuotedString(keySpec)) {
    const keys = parseQuotedString(keySpec)
    if (keys && keys.length > 0) {
      return { ok: false, error: `KEYS:${keys.join(",")}` }
    }
    return { ok: false, error: `Invalid key sequence: ${keySpec}` }
  }

  // Special key name (esc, enter, tab, etc.)
  const specialKey = SPECIAL_KEYS[keySpec.toLowerCase()]
  if (specialKey) {
    return { ok: false, error: `KEY:${specialKey}` }
  }

  // Single character or <Name> format
  const key = parseKeySpec(keySpec)
  if (!key) {
    return { ok: false, error: `Invalid key specification: ${keySpec}` }
  }
  return { ok: false, error: `KEY:${key}` }
}

/**
 * Parse fold commands: toggle_fold, toggle_collapse (require nodeId)
 */
function parseFoldCommand(cmd: string, args: string[]): ParseResult | null {
  if (cmd === "toggle_fold") {
    const result = parseNodeIdArg(args[0], "toggle_fold")
    if ("error" in result) return { ok: false, error: result.error }
    return { ok: true, action: { type: "TOGGLE_FOLD", nodeId: result.nodeId } }
  }
  if (cmd === "toggle_collapse") {
    const result = parseNodeIdArg(args[0], "toggle_collapse")
    if ("error" in result) return { ok: false, error: result.error }
    return {
      ok: true,
      action: { type: "TOGGLE_COLLAPSE", nodeId: result.nodeId },
    }
  }
  return null
}

/**
 * Parse level commands: fold_level, unfold_level (require numeric depth)
 */
function parseLevelCommand(cmd: string, args: string[]): ParseResult | null {
  if (cmd === "fold_level") {
    const result = parseNumericArg(args[0], "fold_level")
    if ("error" in result) return { ok: false, error: result.error }
    return { ok: true, action: { type: "FOLD_LEVEL", depth: result.value } }
  }
  if (cmd === "unfold_level") {
    const result = parseNumericArg(args[0], "unfold_level")
    if ("error" in result) return { ok: false, error: result.error }
    return { ok: true, action: { type: "UNFOLD_LEVEL", depth: result.value } }
  }
  return null
}

/**
 * Parse navigation path commands: nav_to_path, select_position
 */
function parseNavPathCommand(cmd: string, args: string[]): ParseResult | null {
  if (cmd !== "nav_to_path" && cmd !== "select_position") return null

  const result = parsePathArg(args[0], cmd)
  if ("error" in result) return { ok: false, error: result.error }
  return { ok: true, action: { type: "NAV_TO_PATH", path: result.path } }
}

/**
 * Parse select node commands: select_node_add, select_node_remove, select_node_toggle
 */
function parseSelectNodeCommand(
  cmd: string,
  args: string[],
): ParseResult | null {
  const actionMap: Record<
    string,
    "SELECT_NODE_ADD" | "SELECT_NODE_REMOVE" | "SELECT_NODE_TOGGLE"
  > = {
    select_node_add: "SELECT_NODE_ADD",
    select_node_remove: "SELECT_NODE_REMOVE",
    select_node_toggle: "SELECT_NODE_TOGGLE",
  }
  const actionType = actionMap[cmd]
  if (!actionType) return null

  const result = parseNodeIdArg(args[0], cmd)
  if ("error" in result) return { ok: false, error: result.error }
  return { ok: true, action: { type: actionType, nodeId: result.nodeId } }
}

/**
 * Parse filesystem commands: ls, cd, tree, cat
 */
function parseFsCommand(cmd: string, args: string[]): ParseResult | null {
  if (cmd === "ls") {
    return { ok: true, command: { type: "LS", path: args[0] } }
  }
  if (cmd === "cd") {
    if (!args[0]) {
      return { ok: false, error: "cd requires a path argument" }
    }
    return { ok: true, command: { type: "CD", path: args[0] } }
  }
  if (cmd === "cat") {
    return { ok: true, command: { type: "CAT", path: args[0] } }
  }
  if (cmd === "tree") {
    return parseTreeCommand(args)
  }
  return null
}

/**
 * Parse tree command with optional path and depth
 */
function parseTreeCommand(args: string[]): ParseResult {
  const pathOrDepth = args[0]
  const depthArg = args[1]

  // tree (no args)
  if (!pathOrDepth) {
    return { ok: true, command: { type: "TREE" } }
  }

  // Check if first arg is a number (depth only)
  const firstAsNum = parseInt(pathOrDepth, 10)
  if (!isNaN(firstAsNum) && String(firstAsNum) === pathOrDepth) {
    return { ok: true, command: { type: "TREE", depth: firstAsNum } }
  }

  // tree <path> [depth]
  let depth: number | undefined
  if (depthArg) {
    depth = parseInt(depthArg, 10)
    if (isNaN(depth)) {
      return { ok: false, error: "tree depth must be a number" }
    }
  }
  return { ok: true, command: { type: "TREE", path: pathOrDepth, depth } }
}

/**
 * Parse mutation commands: set_status, delete, shift_up, shift_down
 */
function parseMutationCommand(cmd: string, args: string[]): ParseResult | null {
  if (cmd === "set_status") {
    const statusArg = args[0]?.toLowerCase()
    if (!statusArg || !VALID_STATUSES.includes(statusArg as TaskStatus)) {
      return {
        ok: false,
        error: `set_status requires a status: ${VALID_STATUSES.join(", ")}`,
      }
    }
    return {
      ok: true,
      command: { type: "SET_STATUS", status: statusArg as TaskStatus },
    }
  }
  if (cmd === "delete") {
    return { ok: true, command: { type: "DELETE" } }
  }
  if (cmd === "shift_up") {
    return { ok: true, command: { type: "SHIFT", direction: "up" } }
  }
  if (cmd === "shift_down") {
    return { ok: true, command: { type: "SHIFT", direction: "down" } }
  }
  return null
}

/**
 * Parse render command with flags: render [--width N] [--height N] [--ansi]
 */
function parseRenderCommand(args: string[]): ParseResult {
  let width: number | undefined
  let height: number | undefined
  let ansi = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]
    if (arg === "--width" && nextArg) {
      width = parseInt(nextArg, 10)
      if (isNaN(width)) {
        return { ok: false, error: "render --width requires a number" }
      }
      i++
    } else if (arg === "--height" && nextArg) {
      height = parseInt(nextArg, 10)
      if (isNaN(height)) {
        return { ok: false, error: "render --height requires a number" }
      }
      i++
    } else if (arg === "--ansi") {
      ansi = true
    } else if (arg?.startsWith("--")) {
      return { ok: false, error: `Unknown render option: ${arg}` }
    }
  }

  return { ok: true, command: { type: "RENDER", width, height, ansi } }
}

/**
 * Parse parameterized command by dispatching to specific parsers
 */
function parseParameterizedCommand(
  cmd: string,
  args: string[],
): ParseResult | null {
  // Try each command parser
  return (
    parseFoldCommand(cmd, args) ??
    parseLevelCommand(cmd, args) ??
    parseNavPathCommand(cmd, args) ??
    parseSelectNodeCommand(cmd, args) ??
    parseFsCommand(cmd, args) ??
    parseMutationCommand(cmd, args) ??
    (cmd === "log" ? parseLogCommand(args) : null) ??
    (cmd === "key" ? parseKeyCommand(args) : null) ??
    (cmd === "render" ? parseRenderCommand(args) : null)
  )
}

/**
 * Parse a command string into a BoardAction or ShellCommand
 */
export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim()

  // Empty line or comment
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { ok: false, error: "empty" }
  }

  // Try special formats first
  const quotedResult = parseQuotedKeySequence(trimmed)
  if (quotedResult) return quotedResult

  const jsonResult = parseJsonAction(trimmed)
  if (jsonResult) return jsonResult

  // Line mode: command [args...]
  const parts = trimmed.split(/\s+/)
  const firstPart = parts[0]
  if (!firstPart) {
    return { ok: false, error: "empty" }
  }
  const cmd = firstPart.toLowerCase()
  const args = parts.slice(1)

  // Check shell commands first
  const shellCmd = SHELL_COMMANDS[cmd]
  if (shellCmd) {
    if (shellCmd.type === "HELP" && args.length > 0) {
      return { ok: true, command: { type: "HELP", topic: args[0] } }
    }
    return { ok: true, command: shellCmd }
  }

  // Check simple actions (no arguments)
  const simpleAction = SIMPLE_ACTIONS[cmd]
  if (simpleAction) {
    return { ok: true, action: simpleAction }
  }

  // Single character command
  if (trimmed.length === 1) {
    const singleCharAction = SINGLE_CHAR_MAP[trimmed]
    if (singleCharAction && singleCharAction !== "KEY") {
      return { ok: true, action: singleCharAction }
    }
    return { ok: false, error: `KEY:${trimmed}` }
  }

  // Parameterized commands
  const paramResult = parseParameterizedCommand(cmd, args)
  if (paramResult) return paramResult

  return { ok: false, error: `Unknown command: ${cmd}` }
}

/**
 * Get help text for available commands
 */
export function getCommandHelp(topic?: string): string {
  if (topic) {
    // Specific command help
    const helpText: Record<string, string> = {
      cursor_prev: "Move to previous sibling (k)",
      cursor_next: "Move to next sibling (j)",
      cursor_out: "Move to parent (h, u)",
      cursor_in: "Move into first child (l)",
      cursor_first: "Jump to first sibling (g)",
      cursor_last: "Jump to last sibling (G)",
      cursor_up: "Move to previous visible block (arrow up)",
      cursor_down: "Move to next visible block (arrow down)",
      cursor_left: "Cross-column left (arrow left)",
      cursor_right: "Cross-column right (arrow right)",
      toggle_fold: "toggle_fold <nodeId> - Toggle fold state of a node",
      toggle_collapse: "toggle_collapse <nodeId> - Toggle collapse state",
      fold_level: "fold_level <depth> - Fold all nodes at depth",
      unfold_level: "unfold_level <depth> - Unfold all nodes at depth",
      nav_to_path: "nav_to_path <path> - Navigate to path (e.g., 0,1,2)",
      select_position: "select_position <path> - Select specific position",
      key: "key <keyspec> - Send raw key (e.g., key j, key <Enter>)",
      state: "Dump current BoardState as JSON",
      view: "Render current view as ASCII",
      render:
        "render [--width N] [--height N] [--ansi] - Render TUI-style view using inkx",
      help: "help [command] - Show help",
      quit: "Exit the shell",
      // Filesystem-like commands
      pwd: "Show current path as node titles (e.g., projects/km/inbox)",
      ls: "ls [path] - List children of current or specified node",
      cd: "cd <path> - Navigate to node (supports .., /, relative paths)",
      tree: "tree [path] [depth] - Hierarchical listing with box-drawing",
      cat: "cat [path] - Show node content/details",
      // Mutation commands
      set_status:
        "set_status <status> - Set task status (todo, wip, blocked, done, dropped)",
      delete: "delete - Delete current node",
      shift_up: "shift_up - Move node up within siblings",
      shift_down: "shift_down - Move node down within siblings",
    }
    return helpText[topic] || `Unknown command: ${topic}`
  }

  // General help
  return `km-sh commands:

Cursor Movement (structural - hjkl):
  cursor_prev, cursor_next    (k/j) - previous/next sibling
  cursor_out, cursor_in       (h/l) - to parent / into child
  cursor_first, cursor_last   (g/G) - first/last sibling

Cursor Movement (visual - arrows):
  cursor_up, cursor_down      - previous/next visible block
  cursor_left, cursor_right   - cross-column movement

Navigation:
  nav_cross_column_left/right (H/L) - cross-column preserving Y
  nav_to_path <path>          - go to path (e.g., 0,1,2)
  nav_back, nav_forward       ([/]) - history navigation

Selection:
  select_position <path>
  select_node_add/remove/toggle <nodeId>
  select_all, select_all_siblings, clear_selection

View:
  toggle_fold <nodeId>
  toggle_collapse <nodeId>
  fold_level <depth>, unfold_level <depth>
  increase/decrease_outline_depth  (</>)
  increase/decrease_content_lines  (+/-)

Shell:
  state - dump BoardState as JSON
  view - render ASCII view
  render [--width N] [--height N] [--ansi] - TUI-style view
  help [command] - show help
  quit, exit, q - exit shell

Filesystem (REPL mode):
  pwd - show current path as node titles
  ls [path] - list children
  cd <path> - navigate to node
  tree [path] [depth] - hierarchical listing
  cat [path] - show node content

Mutations:
  set_status <status>   - set task status (todo/wip/blocked/done/dropped)
  delete                - delete current node
  shift_up, shift_down  - move node within siblings

Key input:
  key <char> - single key (e.g., key j)
  key <Name> - special key (e.g., key Enter)

JSON mode:
  {"type": "CURSOR_MOVE", "dir": "next"} - any valid BoardAction
`
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
    "key",
    "render",
    // Filesystem-like commands
    "ls",
    "cd",
    "tree",
    "cat",
    // Mutation commands
    "set_status",
    "delete",
    "shift_up",
    "shift_down",
  ]
}
