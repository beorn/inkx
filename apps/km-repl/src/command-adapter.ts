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
  type CommandAction,
  type CommandContext,
  type BoardState,
  type ViewMode,
} from "@km/commands";

// Re-export types for consumers
export type { CommandAction, CommandContext };

let initialized = false;

/**
 * Initialize the command system for shell use.
 * Call this once at startup.
 */
export function initShellCommands(): void {
  if (!initialized) {
    initCommandSystem();
    initialized = true;
  }
}

/**
 * Get all registered command IDs for help/completion.
 */
export function getRegisteredCommandIds(): string[] {
  initShellCommands();
  return getAllCommands().map((cmd) => cmd.id);
}

/**
 * Get command info by ID for help display.
 */
export function getCommandInfo(
  id: string,
): { name: string; description: string; category: string } | null {
  initShellCommands();
  const cmd = getCommand(id);
  if (!cmd) return null;
  return {
    name: cmd.name,
    description: cmd.description,
    category: cmd.category,
  };
}

/**
 * Build CommandContext from shell state.
 * Shell doesn't have all UI context, so we provide sensible defaults.
 */
export function buildShellContext(
  state: BoardState,
  viewMode: ViewMode = "list",
): CommandContext {
  return buildContext(state, viewMode, {
    // Shell doesn't track these UI-specific values precisely
    // but buildContext computes them from boardState
  });
}

/**
 * Try to execute a command by ID through the unified registry.
 *
 * @param commandId - The command ID (e.g., "cursor_next")
 * @param state - Current BoardState
 * @param viewMode - Current view mode (defaults to "list" for shell)
 * @returns Actions to execute, or null if command not found/not applicable
 */
export function tryExecuteRegisteredCommand(
  commandId: string,
  state: BoardState,
  viewMode: ViewMode = "list",
): CommandAction | CommandAction[] | null {
  initShellCommands();

  const cmd = getCommand(commandId);
  if (!cmd) {
    return null;
  }

  const ctx = buildShellContext(state, viewMode);
  return executeRegisteredCommand(commandId, ctx);
}

/**
 * Check if a command ID exists in the unified registry.
 */
export function isRegisteredCommand(commandId: string): boolean {
  initShellCommands();
  return getCommand(commandId) !== null;
}

/**
 * Get all commands grouped by category for help display.
 */
export function getCommandsByCategory(): Map<
  string,
  Array<{ id: string; name: string; description: string }>
> {
  initShellCommands();
  const commands = getAllCommands();
  const byCategory = new Map<
    string,
    Array<{ id: string; name: string; description: string }>
  >();

  for (const cmd of commands) {
    const existing = byCategory.get(cmd.category) ?? [];
    existing.push({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
    });
    byCategory.set(cmd.category, existing);
  }

  return byCategory;
}
