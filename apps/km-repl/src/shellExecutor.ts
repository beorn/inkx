/**
 * Shell Executor for km-sh
 *
 * Executes commands against a BoardState and produces output.
 * Supports both JSON and line (human-readable) output modes.
 */

import type { BoardState, BoardAction, TPath, TNode } from "./board-types.ts"
import type { TaskStatus } from "@km/core"
import { boardReducer, getNodeAtPath } from "./board-reducer.ts"
import { parseCommand, getCommandHelp } from "./commandParser.ts"
import type { ShellCommand } from "./commandParser.ts"
// Note: renderTree is imported lazily to avoid loading inkx/testing
// (which sets IS_REACT_ACT_ENVIRONMENT=true) when km-repl is imported

/**
 * Output event types for JSON mode
 */
export type OutputEvent =
  | { event: "init"; state: SerializedState; ts: number }
  | { event: "action"; action: BoardAction; ts: number }
  | { event: "state"; state: SerializedState; ts: number }
  | { event: "error"; error: string; ts: number }
  | { event: "output"; text: string; ts: number }

/**
 * Serialized state (Sets converted to arrays for JSON)
 */
export interface SerializedState {
  rootId: string | null
  rootPath: string | null
  cursor: TPath
  selectedNodes: string[]
  foldedNodes: string[]
  collapsedNodes: string[]
  nodeCount: number
  topLevelCount: number
}

/**
 * Action log entry for log/logs commands
 */
export interface ActionLogEntry {
  action: BoardAction
  cursor: TPath
  ts: number
}

/**
 * Mutation result from storage operations
 */
export interface MutationResult {
  /** Whether the mutation succeeded */
  ok: boolean
  /** Error message if failed */
  error?: string
  /** Updated state after mutation (if ok) */
  newState?: BoardState
}

/**
 * Mutation handler callback - provided by CLI layer for storage operations
 */
export type MutationHandler = (
  command: ShellCommand,
  state: BoardState,
) => MutationResult

/**
 * Shell execution context
 */
export interface ShellContext {
  state: BoardState
  jsonMode: boolean
  verbose: boolean
  output: (event: OutputEvent | string) => void
  stdlog?: (line: string) => void
  /** Action log for log command (optional, created on demand) */
  actionLog?: ActionLogEntry[]
  /** Mutation handler for storage operations (optional, provided by CLI) */
  onMutation?: MutationHandler
}

/**
 * Serialize BoardState for JSON output
 */
export function serializeState(state: BoardState): SerializedState {
  // Count total nodes recursively
  function countNodes(nodes: BoardState["nodes"]): number {
    return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
  }

  return {
    rootId: state.rootId,
    rootPath: state.rootPath,
    cursor: state.cursor,
    selectedNodes: Array.from(state.selectedNodes),
    foldedNodes: Array.from(state.foldedNodes),
    collapsedNodes: Array.from(state.collapsedNodes),
    nodeCount: countNodes(state.nodes),
    topLevelCount: state.nodes.length,
  }
}

/**
 * Format state for human-readable output
 */
export function formatStateHuman(state: BoardState): string {
  const currentNode = getNodeAtPath(state.nodes, state.cursor)
  const lines: string[] = [
    `cursor: [${state.cursor.join(",")}]`,
    `node: ${currentNode?.title ?? "(none)"}`,
    `topLevel: ${state.nodes.length} nodes`,
  ]

  if (state.selectedNodes.size > 0) {
    lines.push(`selected: ${state.selectedNodes.size} nodes`)
  }
  if (state.foldedNodes.size > 0) {
    lines.push(`folded: ${state.foldedNodes.size} nodes`)
  }
  if (state.collapsedNodes.size > 0) {
    lines.push(`collapsed: ${state.collapsedNodes.size} nodes`)
  }

  return lines.join("\n")
}

/**
 * Render a simple ASCII view of the tree
 */
export function renderAsciiView(state: BoardState): string {
  const lines: string[] = []

  // Header
  if (state.rootPath) {
    lines.push(`Path: ${state.rootPath}`)
    lines.push("")
  }

  // Render nodes recursively with indentation
  function renderNodes(
    nodes: BoardState["nodes"],
    path: TPath,
    indent: string,
  ) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node) continue
      const nodePath = [...path, i]
      const isSelected =
        state.cursor.length === nodePath.length &&
        state.cursor.every((v, idx) => v === nodePath[idx])
      const marker = isSelected ? "→" : " "
      const foldMarker = state.foldedNodes.has(node.id) ? "▸" : " "
      const STATUS_ICONS: Record<TaskStatus, string> = {
        todo: "○",
        wip: "◐",
        blocked: "⊘",
        done: "✓",
        dropped: "∅",
      }
      const statusIcon = node.task_status ? STATUS_ICONS[node.task_status] : " "

      lines.push(
        `${indent}${marker}${foldMarker} ${statusIcon} ${node.title}${node.childCount > 0 ? ` (+${node.childCount})` : ""}`,
      )

      // Render children if not folded
      if (node.children.length > 0 && !state.foldedNodes.has(node.id)) {
        renderNodes(node.children, nodePath, indent + "  ")
      }
    }
  }

  renderNodes(state.nodes, [], "")

  return lines.join("\n")
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
    .replace(/^-|-$/g, "")
}

/**
 * Get the current path as a string of node titles
 * e.g., "projects/km/inbox"
 */
function getPathAsString(state: BoardState): string {
  if (state.cursor.length === 0) {
    return state.rootPath ? state.rootPath : "/"
  }

  const parts: string[] = []
  let nodes = state.nodes

  for (const idx of state.cursor) {
    const node = nodes[idx]
    if (!node) break
    parts.push(node.title ?? node.id)
    nodes = node.children
  }

  return parts.join("/") || "/"
}

/**
 * Get the current path for shell prompt using node slugs
 * e.g., "/inbox/task-1" or "/" at root
 * @param state - BoardState with cursor position
 * @param rootSlugPath - Optional slug path prefix for the view root (e.g., "@inbox" when viewing inside @inbox.md)
 */
export function getPromptPath(
  state: BoardState,
  rootSlugPath?: string,
): string {
  const parts: string[] = []

  // Add root path prefix if viewing a subset of the tree
  if (rootSlugPath) {
    parts.push(rootSlugPath)
  }

  // Add cursor path
  let nodes = state.nodes
  for (const idx of state.cursor) {
    const node = nodes[idx]
    if (!node) break
    // Use name if available, otherwise fall back to slugified title
    parts.push(node.name ?? slugify(node.title ?? node.id))
    nodes = node.children
  }

  return "/" + parts.join("/")
}

/**
 * Find a child node by title or slug (case-insensitive)
 */
function findChildByName(
  nodes: TNode[],
  name: string,
): { node: TNode; index: number } | null {
  const lowerName = name.toLowerCase()
  const slugName = slugify(name)

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue

    // Match by exact title (case-insensitive)
    if (node.title && node.title.toLowerCase() === lowerName) {
      return { node, index: i }
    }

    // Match by slugified title
    if (node.title && slugify(node.title) === slugName) {
      return { node, index: i }
    }

    // Match by nodeId
    if (node.id === name) {
      return { node, index: i }
    }
  }

  return null
}

/**
 * Get nodes at a given cursor position
 */
function getNodesAtCursor(rootNodes: TNode[], cursor: TPath): TNode[] {
  let nodes = rootNodes
  for (const idx of cursor) {
    const node = nodes[idx]
    if (node) {
      nodes = node.children
    }
  }
  return nodes
}

/**
 * Get children of the current cursor position for relative path navigation
 */
function getChildrenForRelativePath(state: BoardState): {
  nodes: TNode[]
  error?: string
} {
  let nodes = state.nodes

  // Navigate to parent of cursor position
  for (const idx of state.cursor.slice(0, -1)) {
    const node = nodes[idx]
    if (!node) {
      return { nodes: [], error: "Invalid current path" }
    }
    nodes = node.children
  }

  // Get children of current node
  const lastIdx = state.cursor[state.cursor.length - 1]
  if (lastIdx !== undefined) {
    const currentNode = nodes[lastIdx]
    if (currentNode) {
      nodes = currentNode.children
    }
  }

  return { nodes }
}

/**
 * Handle parent directory navigation (..)
 */
function handleParentNav(
  state: BoardState,
  cursor: TPath,
): { cursor: TPath; nodes: TNode[] } {
  if (cursor.length === 0) {
    return { cursor, nodes: state.nodes }
  }
  const newCursor = cursor.slice(0, -1)
  return { cursor: newCursor, nodes: getNodesAtCursor(state.nodes, newCursor) }
}

/**
 * Resolve a path string to a cursor path
 * Supports: /, .., relative paths, absolute paths from root
 */
function resolvePath(
  state: BoardState,
  pathStr: string,
): { cursor: TPath; error?: string } {
  const parts = pathStr.split("/").filter((p) => p.length > 0)
  const isAbsolute = pathStr.startsWith("/")

  let cursor: TPath = isAbsolute ? [] : [...state.cursor]
  let nodes: TNode[]

  // Initialize nodes based on path type
  if (isAbsolute || cursor.length === 0) {
    nodes = state.nodes
  } else {
    const result = getChildrenForRelativePath(state)
    if (result.error) {
      return { cursor: [], error: result.error }
    }
    nodes = result.nodes
  }

  for (const part of parts) {
    if (part === "..") {
      const navResult = handleParentNav(state, cursor)
      cursor = navResult.cursor
      nodes = navResult.nodes
    } else if (part === ".") {
      continue
    } else {
      const found = findChildByName(nodes, part)
      if (!found) {
        return { cursor, error: `No such node: ${part}` }
      }
      cursor = [...cursor, found.index]
      nodes = found.node.children
    }
  }

  return { cursor }
}

/**
 * Navigate to a path and return the new cursor or error
 */
function navigateToPath(
  state: BoardState,
  pathStr: string,
): { newCursor?: TPath; error?: string } {
  const result = resolvePath(state, pathStr)

  if (result.error) {
    return { error: result.error }
  }

  // Validate the cursor points to a valid node (or root)
  if (result.cursor.length === 0) {
    // Root - valid if we have nodes
    if (state.nodes.length > 0) {
      return { newCursor: [0] } // Navigate to first top-level node
    }
    return { error: "No nodes at root" }
  }

  const node = getNodeAtPath(state.nodes, result.cursor)
  if (!node) {
    return { error: "Path not found" }
  }

  return { newCursor: result.cursor }
}

/**
 * List children of current or specified node
 */
function listNodes(state: BoardState, pathStr?: string): string {
  let nodes: TNode[]

  if (pathStr) {
    const result = resolvePath(state, pathStr)
    if (result.error) {
      return `ls: ${result.error}`
    }

    if (result.cursor.length === 0) {
      // Root level
      nodes = state.nodes
    } else {
      const node = getNodeAtPath(state.nodes, result.cursor)
      if (!node) {
        return "ls: path not found"
      }
      nodes = node.children
    }
  } else {
    // List children of current node
    const currentNode = getNodeAtPath(state.nodes, state.cursor)
    if (currentNode) {
      nodes = currentNode.children
    } else if (state.cursor.length === 0) {
      nodes = state.nodes
    } else {
      return "ls: invalid cursor position"
    }
  }

  if (nodes.length === 0) {
    return "(empty)"
  }

  // Status icons map
  const statusIcons: Record<TaskStatus, string> = {
    todo: "○",
    wip: "◐",
    blocked: "⊘",
    done: "✓",
    dropped: "∅",
  }

  // Format output like ls
  const items = nodes.map((node) => {
    const suffix = node.children.length > 0 ? "/" : ""
    const taskMark = node.task_status ? statusIcons[node.task_status] + " " : ""
    return `${taskMark}${node.title}${suffix}`
  })

  return items.join("  ")
}

/**
 * Render tree output with box-drawing characters
 */
function renderTreeCommand(
  state: BoardState,
  pathStr?: string,
  maxDepth?: number,
): string {
  let startNodes: TNode[]
  let rootTitle: string

  if (pathStr) {
    const result = resolvePath(state, pathStr)
    if (result.error) {
      return `tree: ${result.error}`
    }

    if (result.cursor.length === 0) {
      startNodes = state.nodes
      rootTitle = state.rootPath || "."
    } else {
      const node = getNodeAtPath(state.nodes, result.cursor)
      if (!node) {
        return "tree: path not found"
      }
      startNodes = [node]
      rootTitle = node.title ?? node.id
    }
  } else {
    // Tree from current node
    const currentNode = getNodeAtPath(state.nodes, state.cursor)
    if (currentNode) {
      startNodes = [currentNode]
      rootTitle = currentNode.title ?? currentNode.id
    } else {
      startNodes = state.nodes
      rootTitle = state.rootPath || "."
    }
  }

  const lines: string[] = [rootTitle]
  const depth = maxDepth ?? 99

  // Status icons map
  const statusIcons: Record<TaskStatus, string> = {
    todo: "○",
    wip: "◐",
    blocked: "⊘",
    done: "✓",
    dropped: "∅",
  }

  function renderNode(nodes: TNode[], prefix: string, currentDepth: number) {
    if (currentDepth > depth) return

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node) continue

      const isLast = i === nodes.length - 1
      const connector = isLast ? "└── " : "├── "
      const childPrefix = isLast ? "    " : "│   "

      const taskMark = node.task_status
        ? statusIcons[node.task_status] + " "
        : ""

      const suffix =
        node.children.length > 0 && currentDepth >= depth
          ? ` (+${node.childCount})`
          : ""

      lines.push(`${prefix}${connector}${taskMark}${node.title}${suffix}`)

      if (node.children.length > 0 && currentDepth < depth) {
        renderNode(node.children, prefix + childPrefix, currentDepth + 1)
      }
    }
  }

  // If we're showing a single node, render its children
  if (startNodes.length === 1 && startNodes[0]) {
    renderNode(startNodes[0].children, "", 1)
  } else {
    // Render all top-level nodes
    renderNode(startNodes, "", 1)
  }

  return lines.join("\n")
}

/**
 * Show node content/details (cat command)
 */
function catNode(state: BoardState, pathStr?: string): string {
  let node: TNode | null

  if (pathStr) {
    const result = resolvePath(state, pathStr)
    if (result.error) {
      return `cat: ${result.error}`
    }
    node = getNodeAtPath(state.nodes, result.cursor)
  } else {
    node = getNodeAtPath(state.nodes, state.cursor)
  }

  if (!node) {
    return "cat: no node selected"
  }

  const lines: string[] = []
  lines.push(`# ${node.title}`)
  lines.push(`id: ${node.id}`)

  if (node.task_status) {
    lines.push(`status: ${node.task_status}`)
  }

  if (node.childCount > 0) {
    lines.push(`children: ${node.childCount}`)
  }

  // If there's content on the node (stored in TNode), show it
  // Note: TNode doesn't typically store full content, just metadata
  // For full content, we'd need access to the store

  return lines.join("\n")
}

// ===== Shell command output helpers =====

/**
 * Output helper that handles both JSON and line modes
 */
function emitOutput(ctx: ShellContext, text: string, ts: number): void {
  if (ctx.jsonMode) {
    ctx.output({ event: "output", text, ts })
  } else {
    ctx.output(text)
  }
}

/**
 * Output state in appropriate format
 */
function emitState(ctx: ShellContext, ts: number): void {
  if (ctx.jsonMode) {
    ctx.output({ event: "state", state: serializeState(ctx.state), ts })
  } else {
    ctx.output(formatStateHuman(ctx.state))
  }
}

/**
 * Output error in appropriate format
 */
function emitError(ctx: ShellContext, error: string, ts: number): void {
  if (ctx.jsonMode) {
    ctx.output({ event: "error", error, ts })
  } else {
    ctx.output(`error: ${error}`)
  }
}

// ===== Shell command handlers =====

type CommandResult = { quit: boolean }

function handleState(ctx: ShellContext, ts: number): CommandResult {
  emitState(ctx, ts)
  return { quit: false }
}

function handleView(ctx: ShellContext, ts: number): CommandResult {
  emitOutput(ctx, renderAsciiView(ctx.state), ts)
  return { quit: false }
}

async function handleRender(
  command: Extract<ShellCommand, { type: "RENDER" }>,
  ctx: ShellContext,
  ts: number,
): Promise<CommandResult> {
  const { renderTree } = await import("./treeRenderer.tsx")
  const view = await renderTree(ctx.state, {
    width: command.width,
    height: command.height,
    ansi: command.ansi,
  })
  emitOutput(ctx, view, ts)
  return { quit: false }
}

function handleHelp(
  command: Extract<ShellCommand, { type: "HELP" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  emitOutput(ctx, getCommandHelp(command.topic), ts)
  return { quit: false }
}

function handleLog(
  command: Extract<ShellCommand, { type: "LOG" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  const log = ctx.actionLog ?? []
  if (log.length === 0) {
    emitOutput(ctx, "(no actions)", ts)
    return { quit: false }
  }

  const count = command.count ?? log.length
  const entries = log.slice(-count)
  const lines = entries.map(
    (entry) => `${entry.action.type} → cursor=[${entry.cursor.join(",")}]`,
  )
  emitOutput(ctx, lines.join("\n"), ts)
  return { quit: false }
}

function handlePwd(ctx: ShellContext, ts: number): CommandResult {
  emitOutput(ctx, getPathAsString(ctx.state), ts)
  return { quit: false }
}

function handleLs(
  command: Extract<ShellCommand, { type: "LS" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  emitOutput(ctx, listNodes(ctx.state, command.path), ts)
  return { quit: false }
}

function handleCd(
  command: Extract<ShellCommand, { type: "CD" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  const result = navigateToPath(ctx.state, command.path)
  if (result.error) {
    if (ctx.jsonMode) {
      ctx.output({ event: "error", error: result.error, ts })
    } else {
      ctx.output(`cd: ${result.error}`)
    }
    return { quit: false }
  }

  if (result.newCursor) {
    ctx.state = { ...ctx.state, cursor: result.newCursor }
    if (ctx.jsonMode) {
      ctx.output({ event: "state", state: serializeState(ctx.state), ts })
    } else if (ctx.verbose) {
      const node = getNodeAtPath(ctx.state.nodes, result.newCursor)
      ctx.output(`cd: ${node?.title ?? "(unknown)"}`)
    }
  }
  return { quit: false }
}

function handleTree(
  command: Extract<ShellCommand, { type: "TREE" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  emitOutput(ctx, renderTreeCommand(ctx.state, command.path, command.depth), ts)
  return { quit: false }
}

function handleCat(
  command: Extract<ShellCommand, { type: "CAT" }>,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  emitOutput(ctx, catNode(ctx.state, command.path), ts)
  return { quit: false }
}

function handleMutation(
  command: ShellCommand,
  ctx: ShellContext,
  ts: number,
): CommandResult {
  if (!ctx.onMutation) {
    emitError(ctx, "Mutation commands require storage integration", ts)
    return { quit: false }
  }

  const result = ctx.onMutation(command, ctx.state)
  if (!result.ok) {
    emitError(ctx, result.error ?? "Unknown error", ts)
    return { quit: false }
  }

  if (result.newState) {
    ctx.state = result.newState
    if (ctx.jsonMode) {
      ctx.output({ event: "state", state: serializeState(ctx.state), ts })
    } else if (ctx.verbose) {
      const node = getNodeAtPath(ctx.state.nodes, ctx.state.cursor)
      ctx.output(
        `mutation: ${command.type} → ${node?.title ?? "(cursor moved)"}`,
      )
    }
  }
  return { quit: false }
}

/**
 * Execute a shell command (not a BoardAction)
 */
export async function executeShellCommand(
  command: ShellCommand,
  ctx: ShellContext,
): Promise<{ quit: boolean }> {
  const ts = Date.now()

  switch (command.type) {
    case "STATE":
      return handleState(ctx, ts)
    case "VIEW":
      return handleView(ctx, ts)
    case "RENDER":
      return handleRender(command, ctx, ts)
    case "HELP":
      return handleHelp(command, ctx, ts)
    case "LOG":
      return handleLog(command, ctx, ts)
    case "QUIT":
      return { quit: true }
    case "PWD":
      return handlePwd(ctx, ts)

    case "LS":
      return handleLs(command, ctx, ts)
    case "CD":
      return handleCd(command, ctx, ts)
    case "TREE":
      return handleTree(command, ctx, ts)
    case "CAT":
      return handleCat(command, ctx, ts)
    case "SET_STATUS":
    case "DELETE":
    case "SHIFT":
      return handleMutation(command, ctx, ts)
  }
}

/**
 * Execute a BoardAction
 */
export function executeBoardAction(
  action: BoardAction,
  ctx: ShellContext,
): BoardState {
  const ts = Date.now()

  // Log the action (JSON mode to stdout, verbose mode to stderr via stdlog)
  if (ctx.jsonMode) {
    ctx.output({ event: "action", action, ts })
  } else if (ctx.verbose && ctx.stdlog) {
    ctx.stdlog(JSON.stringify({ event: "action", action, ts }))
  }

  // Execute the action
  const newState = boardReducer(ctx.state, action)

  // Record in action log for log command
  if (ctx.actionLog) {
    ctx.actionLog.push({
      action,
      cursor: newState.cursor,
      ts,
    })
  }

  // Log state change if something changed
  const changed =
    newState.cursor.length !== ctx.state.cursor.length ||
    !newState.cursor.every(
      (v: number, i: number) => v === ctx.state.cursor[i],
    ) ||
    newState.foldedNodes.size !== ctx.state.foldedNodes.size ||
    newState.collapsedNodes.size !== ctx.state.collapsedNodes.size ||
    newState.selectedNodes.size !== ctx.state.selectedNodes.size

  if (changed) {
    if (ctx.jsonMode) {
      ctx.output({ event: "state", state: serializeState(newState), ts })
    } else if (ctx.verbose) {
      // Only output intermediate state changes in verbose mode
      const node = getNodeAtPath(newState.nodes, newState.cursor)
      ctx.output(
        `state: cursor=[${newState.cursor.join(",")}]${node ? ` "${node.title}"` : ""}`,
      )
    }
  }

  return newState
}

// Key map used for KEY: and KEYS: markers
// Shell uses structural navigation (prev/next/in/out) - no visual cursor logic
// Note: App-specific actions (modals, search, help) are not available in km-sh
const KEY_MAP: Record<string, BoardAction> = {
  // Structural cursor movement (vim style keys)
  j: { type: "CURSOR_MOVE", dir: "next" },
  k: { type: "CURSOR_MOVE", dir: "prev" },
  h: { type: "CURSOR_MOVE", dir: "out" }, // h always goes to parent
  l: { type: "CURSOR_MOVE", dir: "in" }, // l always goes to child
  H: { type: "NAV_CROSS_COLUMN", direction: "left" },
  L: { type: "NAV_CROSS_COLUMN", direction: "right" },
  g: { type: "CURSOR_MOVE", dir: "first" },
  G: { type: "CURSOR_MOVE", dir: "last" },

  // Navigation
  Enter: { type: "CURSOR_MOVE", dir: "in" },
  Backspace: { type: "CURSOR_MOVE", dir: "out" },
  u: { type: "CURSOR_MOVE", dir: "out" },
  "[": { type: "NAV_BACK" },
  "]": { type: "NAV_FORWARD" },

  // Selection
  A: { type: "SELECT_ALL_SIBLINGS" },
  Escape: { type: "CLEAR_SELECTION" },

  // Extend-select (shift+hjkl)
  J: { type: "EXTEND_SELECT_DOWN" },
  K: { type: "EXTEND_SELECT_UP" },
  // Note: H/L are used for cross-column nav, so extend-select left/right
  // would need different key bindings in a real TUI

  // View controls (fold only - outline depth is app-level)
  z: { type: "TOGGLE_FOLD_CURRENT" },
  Z: { type: "UNFOLD_ALL" },

  // Moving (m + destination)
  m: { type: "ENTER_MOVE_MODE" },
}

/**
 * Handle single key command (KEY: marker)
 */
function handleSingleKey(
  key: string,
  ctx: ShellContext,
  ts: number,
): { state: BoardState; quit: boolean } {
  const action = KEY_MAP[key]
  if (action) {
    return { state: executeBoardAction(action, ctx), quit: false }
  }
  emitError(ctx, `Unknown key: ${key}`, ts)
  return { state: ctx.state, quit: false }
}

/**
 * Handle key sequence command (KEYS: marker)
 */
function handleKeySequence(
  keys: string[],
  ctx: ShellContext,
  ts: number,
): { state: BoardState; quit: boolean } {
  let currentState = ctx.state
  for (const key of keys) {
    const action = KEY_MAP[key]
    if (!action) {
      emitError(ctx, `Unknown key: ${key}`, ts)
      return { state: currentState, quit: false }
    }
    ctx.state = currentState
    currentState = executeBoardAction(action, ctx)
  }
  return { state: currentState, quit: false }
}

/**
 * Handle parse error from command parsing
 */
function handleParseError(
  error: string,
  ctx: ShellContext,
  ts: number,
): { state: BoardState; quit: boolean } | null {
  // Check for special KEY: marker (single key)
  if (error.startsWith("KEY:")) {
    return handleSingleKey(error.slice(4), ctx, ts)
  }

  // Check for special KEYS: marker (key sequence)
  if (error.startsWith("KEYS:")) {
    return handleKeySequence(error.slice(5).split(","), ctx, ts)
  }

  // Skip empty lines/comments silently
  if (error === "empty") {
    return { state: ctx.state, quit: false }
  }

  // Report error
  emitError(ctx, error, ts)
  return { state: ctx.state, quit: false }
}

/**
 * Execute a single command line
 * Returns new state and whether to quit
 */
export async function executeCommand(
  line: string,
  ctx: ShellContext,
): Promise<{ state: BoardState; quit: boolean }> {
  const ts = Date.now()
  const result = parseCommand(line)

  if (!result.ok) {
    return (
      handleParseError(result.error, ctx, ts) ?? {
        state: ctx.state,
        quit: false,
      }
    )
  }

  // Execute shell command or tree action
  if ("command" in result) {
    const { quit } = await executeShellCommand(result.command, ctx)
    return { state: ctx.state, quit }
  }

  return { state: executeBoardAction(result.action, ctx), quit: false }
}

/**
 * Run shell with input lines
 * Returns final state
 */
export async function runShell(
  lines: string[],
  initialState: BoardState,
  options: {
    jsonMode?: boolean
    verbose?: boolean
    output?: (event: OutputEvent | string) => void
    stdlog?: (line: string) => void
    onMutation?: MutationHandler
  } = {},
): Promise<BoardState> {
  const jsonMode = options.jsonMode ?? false
  const verbose = options.verbose ?? false
  const output =
    options.output ??
    ((e) => console.log(typeof e === "string" ? e : JSON.stringify(e)))
  const stdlog = options.stdlog ?? ((line) => console.error(line))

  // Initial state output
  const ts = Date.now()
  if (jsonMode) {
    output({ event: "init", state: serializeState(initialState), ts })
  }

  const ctx: ShellContext = {
    state: initialState,
    jsonMode,
    verbose,
    output,
    stdlog,
    actionLog: [],
    onMutation: options.onMutation,
  }

  for (const line of lines) {
    const { state, quit } = await executeCommand(line, ctx)
    ctx.state = state
    if (quit) break
  }

  return ctx.state
}
