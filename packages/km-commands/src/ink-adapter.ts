/**
 * Ink Adapter for @km/commands
 *
 * Bridges Ink's useInput key events to the command system.
 * This allows gradual migration from keyboard-handler.ts.
 */

import type { CommandContext, CommandAction, TNode } from "./types.ts"
import type { KeybindingContext } from "./keybindings.ts"
import { resolveKeybinding, initDefaultKeybindings, isChordPrefix, resolveChord } from "./keybindings.ts"
import { executeCommand } from "./executor.ts"
import { registerCommands, clearRegistry } from "./registry.ts"
import { allCommands } from "./commands/index.ts"
import { createChordState, type ChordState } from "./chord-state.ts"

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
  super?: boolean // Cmd on macOS (requires Kitty protocol)
}

/** Initialize the command system with default commands and keybindings */
export function initCommandSystem(): void {
  clearRegistry()
  registerCommands(allCommands)
  initDefaultKeybindings()
  chordState = createChordState()
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
  super: boolean
} {
  return {
    ctrl: !!key.ctrl,
    meta: !!key.meta, // Alt/Option on macOS terminals
    shift: !!key.shift,
    alt: false,
    super: !!key.super, // Cmd on macOS (requires Kitty protocol)
  }
}

// Module-level chord state (persists across key events)
let chordState: ChordState = createChordState()

export interface InkCommandResult {
  /** The command that was executed, or null if no command matched */
  commandId: string | null
  /** The action(s) to dispatch, or null if command returned null */
  actions: CommandAction | CommandAction[] | null
  /** Whether a command was found (even if it returned null) */
  handled: boolean
  /** If set, a chord is pending (show in status bar, start timeout) */
  pending?: string
  /** True when a chord prefix+suffix resolved to a command (for which-key popup dismissal) */
  chordResolved?: boolean
}

/** Check if a blocking modal is active (chords should not activate during these) */
function isBlockingModal(kbCtx: KeybindingContext): boolean {
  return kbCtx.helpOverlayOpen || kbCtx.consoleOpen || kbCtx.deleteConfirmOpen
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
// oxlint-disable-next-line complexity/complexity -- Sequential chord + keybinding resolution pipeline
export function processInkKey(
  input: string,
  key: InkKeyEvent,
  ctx: CommandContext,
  kbCtx: KeybindingContext,
): InkCommandResult {
  const keyStr = inkKeyToString(input, key)
  const modifiers = inkKeyToModifiers(key)
  const hasModifiers = !!modifiers.ctrl || !!modifiers.meta || !!modifiers.shift || !!modifiers.alt || !!modifiers.super

  // Text input priority: when textInputFocused and input is a printable character
  // (not a special key), short-circuit to text insert BEFORE keybinding resolution.
  // Also cancel any pending chord since we're in text mode.
  if (
    kbCtx.textInputFocused &&
    input.length === 1 &&
    input >= " " &&
    !key.ctrl &&
    !key.meta &&
    !key.super &&
    !key.return &&
    !key.escape &&
    !key.backspace &&
    !key.delete &&
    !key.tab
  ) {
    chordState.cancel()
    return {
      commandId: "text.insert",
      actions: { type: "TEXT_INSERT", char: input },
      handled: true,
    }
  }

  // Cancel chord on text input mode or blocking modals
  if (kbCtx.textInputFocused || isBlockingModal(kbCtx)) {
    chordState.cancel()
  }

  // Chord processing (only when not in text mode and no blocking modal)
  if (!kbCtx.textInputFocused && !isBlockingModal(kbCtx)) {
    const chordResult = chordState.processKey(keyStr, hasModifiers, modifiers, kbCtx, {
      isChordPrefix,
      resolveChord: (prefix, k, mods, kbCtxArg) => resolveChord(prefix, k, mods, kbCtxArg as KeybindingContext),
      resolveStandalone: (k) => resolveKeybinding(k, {}, kbCtx),
    })

    switch (chordResult.type) {
      case "pending":
        return { commandId: null, actions: null, handled: true, pending: chordResult.prefix }
      case "resolved": {
        const actions = executeCommand(chordResult.commandId, ctx)
        return { commandId: chordResult.commandId, actions, handled: true, chordResolved: true }
      }
      case "replay": {
        // Execute the standalone command
        const standaloneActions = executeCommand(chordResult.standaloneId, ctx)
        // Then resolve the replayed key normally
        const replayCommandId = resolveKeybinding(chordResult.replayKey, modifiers, kbCtx)
        if (replayCommandId) {
          const replayActions = executeCommand(replayCommandId, ctx)
          // Return both actions combined
          const allActions: CommandAction[] = []
          if (standaloneActions) {
            if (Array.isArray(standaloneActions)) allActions.push(...standaloneActions)
            else allActions.push(standaloneActions)
          }
          if (replayActions) {
            if (Array.isArray(replayActions)) allActions.push(...replayActions)
            else allActions.push(replayActions)
          }
          return {
            commandId: chordResult.standaloneId,
            actions: allActions.length > 0 ? allActions : null,
            handled: true,
          }
        }
        // Replay key didn't match — just return standalone
        return { commandId: chordResult.standaloneId, actions: standaloneActions, handled: true }
      }
      case "fallback": {
        const actions = executeCommand(chordResult.commandId, ctx)
        return { commandId: chordResult.commandId, actions, handled: true }
      }
      // "passthrough" — continue to normal resolution below
    }
  }

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

/** Get the current chord state (for external timeout handling) */
export function getChordState(): ChordState {
  return chordState
}

/**
 * Handle chord timeout: resolve the pending prefix as its standalone command.
 * Called by the TUI layer after 300ms of no second key.
 */
export function handleChordTimeout(ctx: CommandContext, kbCtx: KeybindingContext): InkCommandResult | null {
  const prefix = chordState.timeout()
  if (!prefix) return null

  const commandId = resolveKeybinding(prefix, {}, kbCtx)
  if (!commandId) return null

  const actions = executeCommand(commandId, ctx)
  return { commandId, actions, handled: true }
}

/**
 * Build KeybindingContext from UI state.
 * This should be called with the current UI state before processing keys.
 */
export function buildKeybindingContext(options: {
  inMoveMode?: boolean
  inSearchMode?: boolean
  inInputMode?: boolean
  hasMultiSelection?: boolean
  isInDetailPane?: boolean
  isInOutlineMode?: boolean
  isInlineEditing?: boolean
  currentNode?: TNode | null
  textInputFocused?: boolean
  searchDialogOpen?: boolean
  projectPickerOpen?: boolean
  newItemDialogOpen?: boolean
  datePromptOpen?: boolean
  filterDialogOpen?: boolean
  helpOverlayOpen?: boolean
  deleteConfirmOpen?: boolean
  consoleOpen?: boolean
  hasActiveToast?: boolean
  /** Current input mode from the mode stack (e.g., "command", "dialog:search"). */
  inputMode?: string
  /** True when in visual mode (vim-style range selection) */
  visualMode?: boolean
}): KeybindingContext {
  let mode: "normal" | "move" | "search" | "input" = "normal"
  if (options.inMoveMode) mode = "move"
  else if (options.inSearchMode) mode = "search"
  else if (options.inInputMode) mode = "input"

  return {
    mode,
    hasMultiSelection: options.hasMultiSelection ?? false,
    isInDetailPane: options.isInDetailPane ?? false,
    isInOutlineMode: options.isInOutlineMode ?? false,
    isInlineEditing: options.isInlineEditing ?? false,
    currentNode: options.currentNode ?? null,
    textInputFocused: options.textInputFocused ?? false,
    searchDialogOpen: options.searchDialogOpen ?? false,
    projectPickerOpen: options.projectPickerOpen ?? false,
    newItemDialogOpen: options.newItemDialogOpen ?? false,
    datePromptOpen: options.datePromptOpen ?? false,
    filterDialogOpen: options.filterDialogOpen ?? false,
    helpOverlayOpen: options.helpOverlayOpen ?? false,
    deleteConfirmOpen: options.deleteConfirmOpen ?? false,
    consoleOpen: options.consoleOpen ?? false,
    hasActiveToast: options.hasActiveToast ?? false,
    inputMode: options.inputMode,
    visualMode: options.visualMode ?? false,
  }
}

/**
 * Check if a key event would be handled by the command system.
 * Useful for deciding whether to fall back to legacy handlers.
 */
export function wouldHandleKey(input: string, key: InkKeyEvent, kbCtx: KeybindingContext): boolean {
  const keyStr = inkKeyToString(input, key)
  const modifiers = inkKeyToModifiers(key)
  return resolveKeybinding(keyStr, modifiers, kbCtx) !== null
}

// Re-export for convenience

export type { CommandContext, CommandAction }
