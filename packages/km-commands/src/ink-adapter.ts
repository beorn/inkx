/**
 * Ink Adapter for @km/commands
 *
 * Bridges Ink's useInput key events to the command system.
 * This allows gradual migration from keyboard-handler.ts.
 */

import type { CommandContext, CommandAction, ViewMode, TNode } from "./types.ts"
import type { KeybindingContext } from "./keybindings.ts"
import { resolveKeybinding, initDefaultKeybindings } from "./keybindings.ts"
import { executeCommand } from "./executor.ts"
import { registerCommands, clearRegistry } from "./registry.ts"
import { allCommands } from "./commands/index.ts"

/** Ink's Key event structure */
export interface InkKeyEvent {
  escape?: boolean
  return?: boolean
  ctrl?: boolean
  upArrow?: boolean
  downArrow?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  tab?: boolean
  backspace?: boolean
  delete?: boolean
  shift?: boolean
  meta?: boolean // Alt/Option on macOS
}

/** Initialize the command system with default commands and keybindings */
export function initCommandSystem(): void {
  clearRegistry()
  registerCommands(allCommands)
  initDefaultKeybindings()
}

/** Convert Ink key event to our key string format */
export function inkKeyToString(input: string, key: InkKeyEvent): string {
  if (key.upArrow) return "ArrowUp"
  if (key.downArrow) return "ArrowDown"
  if (key.leftArrow) return "ArrowLeft"
  if (key.rightArrow) return "ArrowRight"
  if (key.return) return "Enter"
  if (key.escape) return "Escape"
  if (key.backspace) return "Backspace"
  if (key.delete) return "Delete"
  if (key.tab) return "Tab"
  return input
}

/** Convert Ink key event to modifier flags */
export function inkKeyToModifiers(key: InkKeyEvent): {
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
} {
  return {
    ctrl: !!key.ctrl,
    meta: false, // Ink uses meta for Alt
    shift: !!key.shift,
    alt: !!key.meta, // In Ink, meta is Alt/Option
  }
}

export interface InkCommandResult {
  /** The command that was executed, or null if no command matched */
  commandId: string | null
  /** The action(s) to dispatch, or null if command returned null */
  actions: CommandAction | CommandAction[] | null
  /** Whether a command was found (even if it returned null) */
  handled: boolean
}

/**
 * Process an Ink key event through the command system.
 *
 * @param input - The input character from useInput
 * @param key - The key event from useInput
 * @param ctx - CommandContext built from current state
 * @param kbCtx - KeybindingContext for mode-aware resolution
 * @returns Result with commandId and actions to dispatch
 */
export function processInkKey(
  input: string,
  key: InkKeyEvent,
  ctx: CommandContext,
  kbCtx: KeybindingContext,
): InkCommandResult {
  const keyStr = inkKeyToString(input, key)
  const modifiers = inkKeyToModifiers(key)

  const commandId = resolveKeybinding(keyStr, modifiers, kbCtx)

  if (!commandId) {
    return { commandId: null, actions: null, handled: false }
  }

  const actions = executeCommand(commandId, ctx)

  return {
    commandId,
    actions,
    handled: true,
  }
}

/**
 * Build KeybindingContext from UI state.
 * This should be called with the current UI state before processing keys.
 */
export function buildKeybindingContext(options: {
  inMoveMode?: boolean
  inSearchMode?: boolean
  inInputMode?: boolean
  hasSelection?: boolean
  isInDetailPane?: boolean
  isInOutlineMode?: boolean
  currentNode?: TNode | null
}): KeybindingContext {
  let mode: "normal" | "move" | "search" | "input" = "normal"
  if (options.inMoveMode) mode = "move"
  else if (options.inSearchMode) mode = "search"
  else if (options.inInputMode) mode = "input"

  return {
    mode,
    hasSelection: options.hasSelection ?? false,
    isInDetailPane: options.isInDetailPane ?? false,
    isInOutlineMode: options.isInOutlineMode ?? false,
    currentNode: options.currentNode ?? null,
  }
}

/**
 * Check if a key event would be handled by the command system.
 * Useful for deciding whether to fall back to legacy handlers.
 */
export function wouldHandleKey(
  input: string,
  key: InkKeyEvent,
  kbCtx: KeybindingContext,
): boolean {
  const keyStr = inkKeyToString(input, key)
  const modifiers = inkKeyToModifiers(key)
  return resolveKeybinding(keyStr, modifiers, kbCtx) !== null
}

// Re-export for convenience
export { buildContext } from "./executor.ts"
export type { CommandContext, CommandAction, ViewMode }
