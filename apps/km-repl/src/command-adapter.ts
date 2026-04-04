/**
 * Command Adapter for km-sh
 *
 * Bridges the @km/commands unified registry to km-repl.
 * Allows shell commands to execute through the same command system as TUI.
 *
 * Usage:
 * 1. Call initShellCommands() once at startup
 * 2. Use tryExecuteRegisteredCommand() to try the unified registry
 * 3. Fall back to existing parseCommand() for shell-specific commands
 */

import {
  initCommandSystem,
  getCommand,
  getAllCommands,
  buildContext,
  executeCommand as executeRegisteredCommand,
  type KmOp,
  type CommandContext,
  type ViewMode,
} from "@km/commands"
import type { TNode } from "@km/board"

// Re-export types for consumers
export type { KmOp, CommandContext }

let initialized = false

/**
 * Initialize the command system for shell use.
 * Call this once at startup.
 */
export function initShellCommands(): void {
  if (!initialized) {
    initCommandSystem()
    initialized = true
  }
}

/**
 * Get all registered command IDs for help/completion.
 */
export function getRegisteredCommandIds(): string[] {
  initShellCommands()
  return getAllCommands().map((cmd) => cmd.id)
}

/**
 * Get command info by ID for help display.
 */
export function getCommandInfo(id: string): { name: string; description: string; category: string } | null {
  initShellCommands()
  const cmd = getCommand(id)
  if (!cmd) return null
  return {
    name: cmd.name,
    description: cmd.description,
    category: cmd.category,
  }
}

/**
 * Shell context options for building CommandContext.
 * Most fields have sensible defaults for shell use.
 */
interface ShellContextOptions {
  currentNode?: TNode | null
  currentNodeId?: string | null
  selectedNodes?: string[]
  siblingIndex?: number
  siblingCount?: number
  columnIndex?: number
  columnCount?: number
  moveMode?: boolean
  foldDepths?: Map<string, number>
}

/**
 * Build CommandContext from shell state.
 * Shell doesn't have all UI context, so we provide sensible defaults.
 */
export function buildShellContext(viewMode: ViewMode = "list", options: ShellContextOptions = {}): CommandContext {
  return buildContext(viewMode, {
    currentNode: options.currentNode ?? null,
    currentNodeId: options.currentNodeId ?? null,
    selectedNodes: options.selectedNodes ?? [],
    siblingIndex: options.siblingIndex ?? 0,
    siblingCount: options.siblingCount ?? 0,
    columnIndex: options.columnIndex ?? 0,
    columnCount: options.columnCount ?? 0,
    moveMode: options.moveMode ?? false,
    foldDepths: options.foldDepths ?? new Map(),
  })
}

/**
 * Try to execute a command by ID through the unified registry.
 *
 * @param commandId - The command ID (e.g., "cursor_next")
 * @param viewMode - Current view mode (defaults to "list" for shell)
 * @param options - Optional context fields
 * @returns Actions to execute, or null if command not found/not applicable
 */
export function tryExecuteRegisteredCommand(
  commandId: string,
  viewMode: ViewMode = "list",
  options: ShellContextOptions = {},
): KmOp | KmOp[] | null {
  initShellCommands()

  const cmd = getCommand(commandId)
  if (!cmd) {
    return null
  }

  const ctx = buildShellContext(viewMode, options)
  return executeRegisteredCommand(commandId, ctx)
}

/**
 * Check if a command ID exists in the unified registry.
 */
export function isRegisteredCommand(commandId: string): boolean {
  initShellCommands()
  return getCommand(commandId) !== null
}

/**
 * Get all commands grouped by category for help display.
 */
export function getCommandsByCategory(): Map<string, Array<{ id: string; name: string; description: string }>> {
  initShellCommands()
  const commands = getAllCommands()
  const byCategory = new Map<string, Array<{ id: string; name: string; description: string }>>()

  for (const cmd of commands) {
    const existing = byCategory.get(cmd.category) ?? []
    existing.push({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
    })
    byCategory.set(cmd.category, existing)
  }

  return byCategory
}
