/**
 * Shell Command - km sh
 *
 * Non-interactive shell for scripting and debugging TUI.
 * Reads commands from stdin (or file), executes them against BoardState,
 * and outputs trace/state to stdout.
 *
 * Usage:
 *   km sh @inbox.md -c 'move_down; move_down; state'
 *   echo 'move_down\nstate' | km sh @inbox.md
 *   km sh --json @inbox.md < commands.txt
 */

import { Command } from "@commander-js/extra-typings"
import { createInterface, type Interface as ReadlineInterface } from "readline"
import { createReadStream, existsSync, readFileSync, appendFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { Database } from "bun:sqlite"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import {
  getChildren,
  resolveNode,
  resolvePathArg,
  type Repo,
} from "@km/storage"
import { getNodeDisplayName as getNodeDisplayNameBase } from "@km/tree"

// Bound version with store dependency (closure will be set after repo init)
let getNodeDisplayName: (
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => ReturnType<typeof getNodeDisplayNameBase>
import {
  createBoardState,
  runShell,
  executeCommand,
  serializeState,
  getCommandNames,
  getPromptPath,
  type TNode,
  type OutputEvent,
  type ShellContext,
  type MutationHandler,
  type ShellCommand,
  type BoardState,
} from "@km/repl"
import type { KNode } from "@km/core"

// ============================================
// Types
// ============================================

interface ShellOptions {
  json?: boolean
  command?: string[]
  file?: string
  verbose?: boolean
}

// ============================================
// Main Export - Shell Command
// ============================================

export const shCommand = new Command("sh")
  .description("Non-interactive shell for scripting and debugging TUI")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--json", "JSON mode: input and output as NDJSON")
  .option(
    "-c, --command <commands...>",
    "Execute commands (repeatable, semicolon/newline separated)",
  )
  .option("-f, --file <path>", "Read commands from file instead of stdin")
  .option("-v, --verbose", "Output JSON action event for each command")
  .action(async (root, options) => {
    const result = await initializeShell(root, options)
    if (!result) return // Error already handled

    const { initialState, onMutation, rootSlugPath, options: opts } = result

    // Output function
    const output = (event: OutputEvent | string) => {
      if (typeof event === "string") {
        console.log(event)
      } else {
        console.log(JSON.stringify(event))
      }
    }

    // Read input: -c takes priority, then -f, then stdin (REPL mode)
    const cmdStrings: string[] | undefined = opts.command

    if (cmdStrings && cmdStrings.length > 0) {
      await runCommandMode(cmdStrings, initialState, opts, output, onMutation)
      return
    }

    if (opts.file) {
      await runFileMode(opts.file, initialState, opts, output, onMutation)
      return
    }

    await runReplMode(initialState, opts, output, onMutation, rootSlugPath)
  })

// ============================================
// Helper Constants
// ============================================

// OSC 133 Shell Integration Protocol (Kitty, WezTerm, iTerm2, VS Code)
// Emitted automatically when running in a real TTY, or when TERM_SHELL_INTEGRATION=1
const OSC_133_A = "\x1b]133;A\x07" // Prompt start (ready for input)
const OSC_133_C = "\x1b]133;C\x07" // Command start (execution beginning)
const osc133D = (exitCode: number) => `\x1b]133;D;${exitCode}\x07` // Command end

// ============================================
// Mode Handlers
// ============================================

interface ShellInitResult {
  initialState: BoardState
  onMutation: MutationHandler
  rootSlugPath: string | undefined
  options: ShellOptions
}

/**
 * Initialize shell: resolve root, load repo, build nodes
 * Returns null if initialization fails (error already output)
 */
async function initializeShell(
  root: string | undefined,
  options: ShellOptions,
): Promise<ShellInitResult | null> {
  // Resolve the root argument - handles directory paths, file paths, and node IDs
  const resolved = resolvePathArg(root, getRootPath())

  // Create repo domain object (auto-closes via `using`)
  using repo = await loadRepo(resolved.repoRoot)

  // Use repo's database (ADR-002: no singletons)
  const db = repo.database

  // Initialize bound helper functions
  getNodeDisplayName = (node) =>
    getNodeDisplayNameBase(node, (parentId) => getChildren(db, parentId))

  // Resolve the node reference if provided
  const resolvedNodeId = resolveNodeReference(db, resolved, options)
  if (resolvedNodeId === false) return null // Error already handled

  const nodes = buildNodes(db, resolvedNodeId)

  if (nodes.length === 0) {
    outputError("No nodes found", options.json)
    process.exit(1)
  }

  // Compute the root node's slug path for prompt display
  const rootSlugPath = resolvedNodeId
    ? getRootSlugPath(db, resolvedNodeId)
    : undefined

  // Create initial state
  const initialState = createBoardState(nodes, resolvedNodeId, repo.path)

  // Create mutation handler for storage operations
  const onMutation = createMutationHandler(db, repo, resolvedNodeId, repo.path)

  return { initialState, onMutation, rootSlugPath, options }
}

/**
 * Resolve node reference, handling errors
 * Returns node ID, null (no ref), or false (error)
 */
function resolveNodeReference(
  db: Database,
  resolved: ReturnType<typeof resolvePathArg>,
  options: ShellOptions,
): string | null | false {
  if (!resolved.nodeRef) return null

  const node = resolveNode(db, resolved.nodeRef)
  if (node) return node.id

  if (resolved.wasExplicitPath) {
    outputError(`No node found for path: ${resolved.nodeRef}`, options.json)
    process.exit(1)
  }

  // Non-path that didn't resolve - could be invalid ID
  return resolved.nodeRef // Let buildNodes handle it
}

/**
 * Get the root node's slug path for prompt display
 */
function getRootSlugPath(db: Database, nodeId: string): string | undefined {
  const rootNode = resolveNode(db, nodeId)
  return rootNode ? getNodeName(rootNode) : undefined
}

/**
 * Output an error in JSON or text format
 */
function outputError(message: string, jsonMode?: boolean): void {
  if (jsonMode) {
    console.log(
      JSON.stringify({ event: "error", error: message, ts: Date.now() }),
    )
  } else {
    console.error(`error: ${message}`)
  }
}

/**
 * Output final state in JSON format
 */
function outputFinalState(state: BoardState): void {
  console.log(
    JSON.stringify({
      event: "final",
      state: serializeState(state),
      ts: Date.now(),
    }),
  )
}

/**
 * Run shell in command mode (-c flag)
 */
async function runCommandMode(
  cmdStrings: string[],
  initialState: BoardState,
  options: ShellOptions,
  output: (event: OutputEvent | string) => void,
  onMutation: MutationHandler,
): Promise<void> {
  const lines = cmdStrings.flatMap(parseCommandString)
  const finalState = await runShell(lines, initialState, {
    jsonMode: options.json ?? false,
    verbose: options.verbose ?? false,
    output,
    onMutation,
  })

  if (options.json) {
    outputFinalState(finalState)
  }
}

/**
 * Run shell in file mode (-f flag)
 */
async function runFileMode(
  filePath: string,
  initialState: BoardState,
  options: ShellOptions,
  output: (event: OutputEvent | string) => void,
  onMutation: MutationHandler,
): Promise<void> {
  const lines = await readInputLines(filePath)
  const finalState = await runShell(lines, initialState, {
    jsonMode: options.json ?? false,
    verbose: options.verbose ?? false,
    output,
    onMutation,
  })

  if (options.json) {
    outputFinalState(finalState)
  }
}

/**
 * Run shell in REPL mode (interactive stdin)
 */
async function runReplMode(
  initialState: BoardState,
  options: ShellOptions,
  output: (event: OutputEvent | string) => void,
  onMutation: MutationHandler,
  rootSlugPath: string | undefined,
): Promise<void> {
  const ctx: ShellContext = {
    state: initialState,
    jsonMode: options.json ?? false,
    verbose: options.verbose ?? false,
    output,
    actionLog: [],
    onMutation,
  }

  const rl = createReplInterface(ctx, rootSlugPath)
  const historyPath = join(homedir(), ".km_history")
  const useOsc133 = shouldEmitOsc133()

  // Signal prompt ready and show initial prompt
  if (useOsc133) {
    process.stdout.write(OSC_133_A)
  }
  rl.prompt()

  await runReplLoop(rl, ctx, historyPath, rootSlugPath, useOsc133)

  if (options.json) {
    outputFinalState(ctx.state)
  }
}

/**
 * Create readline interface for REPL mode
 */
function createReplInterface(
  ctx: ShellContext,
  rootSlugPath: string | undefined,
): ReadlineInterface {
  const historyPath = join(homedir(), ".km_history")
  const history = loadHistory(historyPath)
  const commandNames = getCommandNames()

  const completer = (line: string): [string[], string] => {
    const hits = commandNames.filter((cmd) =>
      cmd.startsWith(line.toLowerCase()),
    )
    return [hits.length ? hits : commandNames, line]
  }

  const buildPrompt = () => `${getPromptPath(ctx.state, rootSlugPath)}> `

  return createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    history,
    historySize: 1000,
    crlfDelay: Infinity,
    terminal: process.stdin.isTTY ?? false,
    prompt: buildPrompt(),
  })
}

/**
 * Load command history from file
 */
function loadHistory(historyPath: string): string[] {
  try {
    const content = readFileSync(historyPath, "utf-8")
    return content.split("\n").filter((line) => line.trim().length > 0)
  } catch {
    return [] // No history file yet
  }
}

/**
 * Run the REPL event loop
 */
async function runReplLoop(
  rl: ReadlineInterface,
  ctx: ShellContext,
  historyPath: string,
  rootSlugPath: string | undefined,
  useOsc133: boolean,
): Promise<void> {
  const buildPrompt = () => `${getPromptPath(ctx.state, rootSlugPath)}> `

  await new Promise<void>((resolve) => {
    rl.on("line", (line) => {
      void handleReplLine(rl, ctx, line, historyPath, buildPrompt, useOsc133)
    })

    rl.on("close", resolve)
  })
}

/**
 * Handle a single REPL line input
 */
async function handleReplLine(
  rl: ReadlineInterface,
  ctx: ShellContext,
  line: string,
  historyPath: string,
  buildPrompt: () => string,
  useOsc133: boolean,
): Promise<void> {
  if (useOsc133) {
    process.stdout.write(OSC_133_C)
  }

  const { state, quit } = await executeCommand(line, ctx)
  ctx.state = state

  appendToHistory(historyPath, line)

  if (useOsc133) {
    process.stdout.write(osc133D(0))
    if (!quit) {
      process.stdout.write(OSC_133_A)
    }
  }

  if (quit) {
    rl.close()
    return
  }

  rl.setPrompt(buildPrompt())
  rl.prompt()
}

/**
 * Append a line to history file (if non-empty)
 */
function appendToHistory(historyPath: string, line: string): void {
  if (line.trim().length === 0) return
  try {
    appendFileSync(historyPath, line + "\n")
  } catch {
    // Ignore history write errors
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Determine if we should emit OSC 133 sequences
 * - Auto-enabled when stdout is a real TTY (interactive terminal)
 * - Force-enabled via TERM_SHELL_INTEGRATION=1 (for mdtest PTY mode)
 * - Force-disabled via TERM_SHELL_INTEGRATION=0
 */
function shouldEmitOsc133(): boolean {
  const envFlag = process.env.TERM_SHELL_INTEGRATION
  if (envFlag === "1") return true
  if (envFlag === "0") return false
  // Auto-detect: emit if running in a real TTY
  return process.stdout.isTTY === true
}

/**
 * Get node name (slug identifier)
 * Uses node.name if available, otherwise derives from fs_path/md_slug
 */
function getNodeName(node: KNode): string {
  // Prefer the stored name
  if (node.name) {
    return node.name
  }
  // Fallback: derive from fs_path for files
  if (node.fs_path) {
    const filename = node.fs_path.split("/").pop()
    if (filename) {
      return filename.replace(/\.md$/, "")
    }
  }
  // Fallback: use md_slug for sections
  if (node.md_slug) {
    return node.md_slug
  }
  // Last resort: short ID
  return node.id.slice(0, 8)
}

/**
 * Convert KNode to TNode (recursive)
 */
function kNodeToTNode(db: Database, node: KNode, depth: number): TNode {
  const children = getChildren(db, node.id)
  return {
    // KNode base properties
    id: node.id,
    type: node.type,
    parent_id: node.parent_id ?? null,
    parent_idx: node.parent_idx ?? 0,
    link_to: node.link_to ?? null,
    link_alias: node.link_alias,
    name: getNodeName(node),
    title: getNodeDisplayName(node),
    task_status: node.task_status,
    task_mark: node.task_mark,
    priority: node.priority,
    due_date: node.due_date,
    scheduled_date: node.scheduled_date,
    content: node.content,
    rules: node.rules,
    data: node.data ?? {},
    created_at: node.created_at ?? 0,
    updated_at: node.updated_at ?? 0,
    version: node.version ?? "",

    // TNode tree properties
    children: children.map((child, idx) => {
      const childNode = kNodeToTNode(db, child, depth + 1)
      // Update parent reference for the child
      return {
        ...childNode,
        parent_id: node.id,
        parent_idx: child.parent_idx ?? idx,
      }
    }),
    childCount: children.length,
    childrenLoaded: true,
    isTask: node.task_status !== undefined,
    depth,
  }
}

/**
 * Build tree nodes from root
 */
function buildNodes(db: Database, rootId: string | null): TNode[] {
  if (!rootId) {
    const roots = getChildren(db, null)
    if (roots.length === 0) {
      return []
    }
    return roots.map((node) => kNodeToTNode(db, node, 0))
  }

  const node = resolveNode(db, rootId)
  if (!node) {
    return []
  }

  const children = getChildren(db, node.id)
  return children.map((child) => kNodeToTNode(db, child, 0))
}

/**
 * Read all lines from stdin or a file
 */
async function readInputLines(inputFile?: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = []
    const input =
      inputFile && existsSync(inputFile)
        ? createReadStream(inputFile)
        : process.stdin

    const rl = createInterface({
      input,
      crlfDelay: Infinity,
    })

    rl.on("line", (line) => {
      lines.push(line)
    })

    rl.on("close", () => {
      resolve(lines)
    })

    rl.on("error", reject)
  })
}

/**
 * Parse commands from -c option
 * Supports semicolon or newline separated commands
 */
function parseCommandString(cmdString: string): string[] {
  return cmdString
    .split(/[;\n]/)
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0)
}

/**
 * Get node at current cursor position
 */
function getNodeAtCursor(state: BoardState): TNode | null {
  let nodes = state.nodes
  for (let i = 0; i < state.cursor.length; i++) {
    const idx = state.cursor[i]
    if (idx === undefined || idx >= nodes.length) return null
    const node = nodes[idx]
    if (!node) return null
    if (i === state.cursor.length - 1) return node
    nodes = node.children
  }
  return nodes[0] ?? null
}

/**
 * Create mutation handler that integrates with storage layer
 * Uses the repo's methods which handle filesystem writes synchronously
 */
function createMutationHandler(
  db: Database,
  repo: Repo,
  rootId: string | null,
  rootPath: string,
): MutationHandler {
  return (command: ShellCommand, state: BoardState) => {
    const currentNode = getNodeAtCursor(state)
    if (!currentNode) {
      return { ok: false, error: "No node at cursor" }
    }

    try {
      switch (command.type) {
        case "SET_STATUS": {
          // Use repo's updateNode which writes to filesystem synchronously
          repo.updateNode(currentNode.id, { task_status: command.status })
          break
        }
        case "DELETE": {
          // TODO: Implement delete - requires regenerating markdown file
          return { ok: false, error: "delete command not yet implemented" }
        }
        case "SHIFT": {
          // TODO: Implement shift - requires regenerating markdown file
          return {
            ok: false,
            error: "shift_up/shift_down commands not yet implemented",
          }
        }
        default:
          return {
            ok: false,
            error: `Unknown mutation: ${(command as ShellCommand).type}`,
          }
      }

      // Rebuild state from storage after mutation
      const newNodes = buildNodes(db, rootId)
      const newState = createBoardState(newNodes, rootId, rootPath)

      // Preserve cursor position if valid, otherwise reset
      let newCursor = state.cursor
      let testNodes = newState.nodes
      for (let i = 0; i < newCursor.length; i++) {
        const idx = newCursor[i]
        if (idx === undefined || idx >= testNodes.length) {
          // Cursor invalid, truncate
          newCursor = newCursor.slice(0, i)
          break
        }
        const node = testNodes[idx]
        if (!node) {
          newCursor = newCursor.slice(0, i)
          break
        }
        testNodes = node.children
      }

      return {
        ok: true,
        newState: {
          ...newState,
          cursor: newCursor.length > 0 ? newCursor : [0],
          // Preserve UI state
          foldedNodes: state.foldedNodes,
          collapsedNodes: state.collapsedNodes,
          selectedNodes: new Set(), // Clear selection after mutation
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
