/**
 * Shell Command - km sh
 *
 * Non-interactive shell for scripting and debugging TUI.
 * Reads commands from stdin (or file), executes them against BoardState,
 * and outputs trace/state to stdout.
 *
 * Usage:
 *   km sh @next.md -c 'move_down; move_down; state'
 *   echo 'move_down\nstate' | km sh @next.md
 *   km sh --json @next.md < commands.txt
 */

import { Command } from "@silvery/commander"
import { createInterface } from "readline"
import { createReadStream, existsSync, readFileSync, appendFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { resolvePathArg, type Repo } from "@km/storage"
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
// Main Export - Shell Command
// ============================================

export const shCommand = new Command("sh")
  .description("Non-interactive shell for scripting and debugging TUI")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--json", "JSON mode: input and output as NDJSON")
  .option("-c, --command <commands...>", "Execute commands (repeatable, semicolon/newline separated)")
  .option("-f, --file <path>", "Read commands from file instead of stdin")
  .option("-v, --verbose", "Output JSON action event for each command")
  // oxlint-disable-next-line complexity/complexity -- CLI REPL with 3 input modes
  .action(async (root, options) => {
    // Resolve the root argument - handles directory paths, file paths, and node IDs
    const resolved = resolvePathArg(root, getRootPath())

    // Create repo domain object (auto-closes via `using`)
    using repo = await loadRepo(resolved.repoRoot)

    // Initialize bound helper functions
    getNodeDisplayName = (node) => getNodeDisplayNameBase(node, (parentId) => repo.getChildren(parentId))

    // Resolve the node reference if provided
    let resolvedNodeId: string | null = null
    if (resolved.nodeRef) {
      const node = repo.resolveNode(resolved.nodeRef)
      if (node) {
        resolvedNodeId = node.id
      } else if (resolved.wasExplicitPath) {
        // Explicit path that didn't resolve - error
        if (options.json) {
          console.log(
            JSON.stringify({
              event: "error",
              error: `No node found for path: ${resolved.nodeRef}`,
              ts: Date.now(),
            }),
          )
        } else {
          console.error(`error: No node found for path: ${resolved.nodeRef}`)
        }
        process.exit(1)
      } else {
        // Non-path that didn't resolve - could be invalid ID
        resolvedNodeId = resolved.nodeRef // Let buildNodes handle it
      }
    }

    const nodes = buildNodes(repo, resolvedNodeId)

    if (nodes.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "error",
            error: "No nodes found",
            ts: Date.now(),
          }),
        )
      } else {
        console.error("error: No nodes found")
      }
      process.exit(1)
    }

    // Compute the root node's slug path for prompt display
    // e.g., if viewing @next.md, this will be "@next"
    let rootSlugPath: string | undefined
    if (resolvedNodeId) {
      const rootNode = repo.resolveNode(resolvedNodeId)
      if (rootNode) {
        rootSlugPath = getNodeName(rootNode)
      }
    }

    // Create initial state
    const initialState = createBoardState(nodes, resolvedNodeId, repo.path)

    // Create mutation handler for storage operations
    const onMutation = createMutationHandler(repo, resolvedNodeId, repo.path)

    // Output function
    const output = (event: OutputEvent | string) => {
      if (typeof event === "string") {
        console.log(event)
      } else {
        console.log(JSON.stringify(event))
      }
    }

    // Read input: -c takes priority, then -f, then stdin (REPL mode)
    const cmdStrings: string[] | undefined = options.command

    if (cmdStrings && cmdStrings.length > 0) {
      // Batch mode: -c flag with commands
      const lines = cmdStrings.flatMap(parseCommandString)
      const finalState = await runShell(lines, initialState, {
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
        onMutation,
      })

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(finalState),
            ts: Date.now(),
          }),
        )
      }
    } else if (options.file) {
      // Batch mode: -f flag with file
      const lines = await readInputLines(options.file)
      const finalState = await runShell(lines, initialState, {
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
        onMutation,
      })

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(finalState),
            ts: Date.now(),
          }),
        )
      }
    } else {
      // REPL mode: read from stdin line by line, execute immediately
      const ctx: ShellContext = {
        state: initialState,
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
        actionLog: [],
        onMutation,
      }

      // OSC 133 shell integration - auto-enabled in TTY or via env var
      const useOsc133 = shouldEmitOsc133()

      // History file path
      const historyPath = join(homedir(), ".km_history")

      // Load history from file
      let history: string[] = []
      try {
        const historyContent = readFileSync(historyPath, "utf-8")
        history = historyContent.split("\n").filter((line) => line.trim().length > 0)
      } catch {
        // No history file yet, that's fine
      }

      // Get all command names for completion
      const commandNames = getCommandNames()

      // Tab completion function
      const completer = (line: string): [string[], string] => {
        // Complete command names
        const hits = commandNames.filter((cmd) => cmd.startsWith(line.toLowerCase()))
        // Show all completions if none found
        return [hits.length ? hits : commandNames, line]
      }

      // Build prompt showing current path (including root node path)
      const buildPrompt = () => `${getPromptPath(ctx.state, rootSlugPath)}> `

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        completer,
        history,
        historySize: 1000,
        crlfDelay: Infinity,
        terminal: process.stdin.isTTY ?? false,
        prompt: buildPrompt(),
      })

      // Signal prompt ready and show initial prompt
      if (useOsc133) {
        process.stdout.write(OSC_133_A)
      }
      rl.prompt()

      await new Promise<void>((resolve) => {
        rl.on("line", (line) => {
          // Use void to handle async callback (lint: no-misused-promises)
          void (async () => {
            // Signal command start
            if (useOsc133) {
              process.stdout.write(OSC_133_C)
            }

            const { state, quit } = await executeCommand(line, ctx)
            ctx.state = state

            // Append to history file (only non-empty lines)
            if (line.trim().length > 0) {
              try {
                appendFileSync(historyPath, line + "\n")
              } catch {
                // Ignore history write errors
              }
            }

            // Signal command end (exit code 0 - shell commands don't have exit codes yet)
            if (useOsc133) {
              process.stdout.write(osc133D(0))
              // Signal next prompt ready (unless quitting)
              if (!quit) {
                process.stdout.write(OSC_133_A)
              }
            }

            if (quit) {
              rl.close()
            } else {
              // Update prompt with new path and show it
              rl.setPrompt(buildPrompt())
              rl.prompt()
            }
          })()
        })

        rl.on("close", () => {
          resolve()
        })
      })

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(ctx.state),
            ts: Date.now(),
          }),
        )
      }
    }
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
// Helper Functions
// ============================================

/**
 * Determine if we should emit OSC 133 sequences
 * - Auto-enabled when stdout is a real TTY (interactive terminal)
 * - Force-enabled via TERM_SHELL_INTEGRATION=1 (for mdspec PTY mode)
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
 * Uses node.name if available, otherwise derives from fs_path
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
  // Last resort: short ID
  return node.id.slice(-8)
}

/**
 * Convert KNode to TNode (recursive)
 */
function kNodeToTNode(repo: Repo, node: KNode, depth: number): TNode {
  const children = repo.getChildren(node.id)
  return {
    // KNode base properties
    id: node.id,
    type: node.type,
    parent_id: node.parent_id ?? null,
    parent_idx: node.parent_idx ?? 0,
    item: node.item,
    embed_source: node.embed_source,
    name: getNodeName(node),
    title: getNodeDisplayName(node),
    task_status: node.task_status,
    task_marker: node.task_marker,
    priority: node.priority,
    due_at: node.due_at,
    start_at: node.start_at,
    content: node.content,
    rules: node.rules,
    data: node.data ?? {},
    created_at: node.created_at ?? 0,
    updated_at: node.updated_at ?? 0,
    version: node.version ?? "",

    // TNode tree properties
    children: children.map((child, idx) => {
      const childNode = kNodeToTNode(repo, child, depth + 1)
      // Update parent reference for the child
      return {
        ...childNode,
        parent_id: node.id,
        parent_idx: child.parent_idx ?? idx,
      }
    }),
    childCount: children.length,
    childrenLoaded: true,
    isTask: node.task_marker !== undefined,
    depth,
  }
}

/**
 * Build tree nodes from root
 */
function buildNodes(repo: Repo, rootId: string | null): TNode[] {
  if (!rootId) {
    const roots = repo.getChildren(null)
    if (roots.length === 0) {
      return []
    }
    return roots.map((node) => kNodeToTNode(repo, node, 0))
  }

  const node = repo.resolveNode(rootId)
  if (!node) {
    return []
  }

  const children = repo.getChildren(node.id)
  return children.map((child) => kNodeToTNode(repo, child, 0))
}

/**
 * Read all lines from stdin or a file
 */
async function readInputLines(inputFile?: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = []
    const input = inputFile && existsSync(inputFile) ? createReadStream(inputFile) : process.stdin

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
function createMutationHandler(repo: Repo, rootId: string | null, rootPath: string): MutationHandler {
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
      const newNodes = buildNodes(repo, rootId)
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
          foldDepths: state.foldDepths,
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
