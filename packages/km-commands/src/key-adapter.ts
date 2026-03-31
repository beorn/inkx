/**
 * Key Adapter for @km/commands
 *
 * Bridges key events to the command system.
 * This allows gradual migration from keyboard-handler.ts.
 */

import type { CommandContext, CommandAction, TNode } from "./types.ts"
import type { KeybindingContext } from "./keybindings.ts"
import { resolveKeybinding, initDefaultKeybindings, isChordPrefix, resolveChord } from "./keybindings.ts"
import { executeCommand } from "./executor.ts"
import { registerCommands, clearRegistry } from "./registry.ts"
import { allCommands } from "./commands/index.ts"
import { createChordState, type ChordState } from "./chord-state.ts"

/** Resolve actions from a binding — prefer execute function over registry lookup */
function resolveActions(
  resolved: {
    commandId: string
    targetId?: string
    execute?: (ctx: CommandContext) => CommandAction | CommandAction[] | null
  },
  ctx: CommandContext,
): CommandAction | CommandAction[] | null {
  if (resolved.execute) {
    const effectiveCtx = resolved.targetId ? { ...ctx, targetId: resolved.targetId } : ctx
    return resolved.execute(effectiveCtx)
  }
  return executeCommand(resolved.commandId, ctx, resolved.targetId)
}

/** Flatten multiple nullable action results into a single array */
function flattenActions(...results: (CommandAction | CommandAction[] | null)[]): CommandAction[] {
  const out: CommandAction[] = []
  for (const r of results) {
    if (r) {
      if (Array.isArray(r)) out.push(...r)
      else out.push(r)
    }
  }
  return out
}

/** Key event structure */
export interface KeyEvent {
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
  /** Actual typed character (pre-normalization). '#' not '3' for Shift+3. */
  text?: string
}

/** Initialize the command system with default commands and keybindings */
export function initCommandSystem(): void {
  clearRegistry()
  registerCommands(allCommands)
  initDefaultKeybindings()
  chordState = createChordState()
}

/** Convert key event to our key string format */
export function keyToString(input: string, key: KeyEvent): string {
  if (key.upArrow) return "ArrowUp"
  if (key.downArrow) return "ArrowDown"
  if (key.leftArrow) return "ArrowLeft"
  if (key.rightArrow) return "ArrowRight"
  if (key.return) return "Enter"
  if (key.escape) return "Escape"
  if (key.backspace) return "Backspace"
  if (key.delete) return "Delete"
  if (key.tab) return "Tab"
  // Normalize uppercase to lowercase — shift is captured separately in modifiers.
  // With Kitty protocol, shift+a reports base key 'a' + shift modifier;
  // keybindings use "shift-a" format so the lookup key must be lowercase.
  if (input.length === 1 && input >= "A" && input <= "Z") return input.toLowerCase()
  return input
}

/** Convert key event to modifier flags (translates silvery names to km-commands names) */
export function keyToModifiers(key: KeyEvent): {
  ctrl: boolean
  opt: boolean
  shift: boolean
  cmd: boolean
} {
  return {
    ctrl: !!key.ctrl,
    opt: !!key.meta, // silvery "meta" = Option (⌥) on macOS terminals
    shift: !!key.shift,
    cmd: !!key.super, // silvery "super" = Cmd (⌘) on macOS (requires Kitty protocol)
  }
}

// Module-level chord state (persists across key events)
let chordState: ChordState = createChordState()

export interface KeyCommandResult {
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
  /** True when a pending chord was cancelled (invalid second key or Escape) — ring bell */
  chordCancelled?: boolean
}

/** Check if a blocking modal is active (chords should not activate during these) */
function isBlockingModal(kbCtx: KeybindingContext): boolean {
  return kbCtx.helpOverlayOpen || kbCtx.consoleOpen || kbCtx.deleteConfirmOpen
}

/**
 * Process a key event through the command system.
 *
 * @param input - The input character from useInput
 * @param key - The key event from useInput
 * @param ctx - CommandContext built from current state
 * @param kbCtx - KeybindingContext for mode-aware resolution
 * @returns Result with commandId and actions to dispatch
 */
// oxlint-disable-next-line complexity/complexity -- Sequential chord + keybinding resolution pipeline
export function processKey(
  input: string,
  key: KeyEvent,
  ctx: CommandContext,
  kbCtx: KeybindingContext,
): KeyCommandResult {
  const keyStr = keyToString(input, key)
  const modifiers = keyToModifiers(key)
  const hasModifiers = !!modifiers.ctrl || !!modifiers.opt || !!modifiers.shift || !!modifiers.cmd

  // Text input priority: when textInputFocused and input is a printable character
  // (not a special key), short-circuit to text insert BEFORE keybinding resolution.
  // Use key.text (the actual typed character) instead of input (which is normalized
  // for keybinding matching — e.g., '#' → '3' + shift). This ensures shifted chars,
  // opt+key composed chars, and IME output insert correctly.
  const textChar = key.text ?? input
  if (
    kbCtx.textInputFocused &&
    textChar.length >= 1 &&
    textChar >= " " &&
    !key.ctrl &&
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
      actions: { type: "TEXT_INSERT", char: textChar },
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
        const actions = resolveActions(chordResult, ctx)
        return { commandId: chordResult.commandId, actions, handled: true, chordResolved: true }
      }
      case "replay": {
        // Execute the standalone command, then resolve the replayed key normally
        const standaloneActions = executeCommand(chordResult.standaloneId, ctx, chordResult.standaloneTargetId)
        const resolved = resolveKeybinding(chordResult.replayKey, modifiers, kbCtx)
        if (resolved) {
          const allActions = flattenActions(standaloneActions, resolveActions(resolved, ctx))
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
        const actions = resolveActions(chordResult, ctx)
        return { commandId: chordResult.commandId, actions, handled: true }
      }
      case "cancelled":
        // Invalid chord second key or Escape — consume key, signal bell
        return { commandId: null, actions: null, handled: true, chordCancelled: true }
      // "passthrough" — continue to normal resolution below
    }
  }

  const resolved = resolveKeybinding(keyStr, modifiers, kbCtx)

  if (!resolved) {
    return { commandId: null, actions: null, handled: false }
  }

  const actions = resolveActions(resolved, ctx)

  return {
    commandId: resolved.commandId,
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
export function handleChordTimeout(ctx: CommandContext, kbCtx: KeybindingContext): KeyCommandResult | null {
  const prefix = chordState.timeout()
  if (!prefix) return null

  const resolved = resolveKeybinding(prefix, {}, kbCtx)
  if (!resolved) return null

  const actions = resolveActions(resolved, ctx)
  return { commandId: resolved.commandId, actions, handled: true }
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
  itemPickerOpen?: boolean
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
  /** True when the omnibox/command palette is open */
  omniboxOpen?: boolean
  /** True when the local find bar is active (has matches or input) */
  localFindActive?: boolean
  /** True when the search/replace dialog is open */
  searchReplaceOpen?: boolean
  /** True when the favorites dialog is open */
  favoritesDialogOpen?: boolean
  /** True when a key is selected in the favorites detail view */
  favoritesKeySelected?: boolean
  /** True when the terminal supports Kitty keyboard protocol (Cmd key available) */
  hasKitty?: boolean
  /** Active input type: "field" for single-line inputs, "textarea" for multi-line (inline edit) */
  inputType?: "field" | "textarea"
  /** Index of the block being edited (0 = title, 1+ = body) */
  editBlockIndex?: number
  /** True when cursor is at position 0 and content is non-empty */
  cursorAtStart?: () => boolean
  /** True when cursor is at or past end of content */
  cursorAtEnd?: () => boolean
  /** True when the edited node has visible (unfolded) structural children */
  hasVisibleChildren?: () => boolean
  /** True when the edited node is a structural outline node (board/column title, not a task card) */
  isEditingOutlineNode?: () => boolean
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
    itemPickerOpen: options.itemPickerOpen ?? false,
    newItemDialogOpen: options.newItemDialogOpen ?? false,
    datePromptOpen: options.datePromptOpen ?? false,
    filterDialogOpen: options.filterDialogOpen ?? false,
    helpOverlayOpen: options.helpOverlayOpen ?? false,
    deleteConfirmOpen: options.deleteConfirmOpen ?? false,
    consoleOpen: options.consoleOpen ?? false,
    hasActiveToast: options.hasActiveToast ?? false,
    inputMode: options.inputMode,
    visualMode: options.visualMode ?? false,
    omniboxOpen: options.omniboxOpen ?? false,
    localFindActive: options.localFindActive ?? false,
    searchReplaceOpen: options.searchReplaceOpen ?? false,
    favoritesDialogOpen: options.favoritesDialogOpen ?? false,
    favoritesKeySelected: options.favoritesKeySelected ?? false,
    hasKitty: options.hasKitty ?? false,
    inputType: options.inputType,
    editBlockIndex: options.editBlockIndex,
    cursorAtStart: options.cursorAtStart ?? (() => false),
    cursorAtEnd: options.cursorAtEnd ?? (() => true),
    hasVisibleChildren: options.hasVisibleChildren ?? (() => false),
    isEditingOutlineNode: options.isEditingOutlineNode ?? (() => false),
  }
}

/**
 * Check if a key event would be handled by the command system.
 * Useful for deciding whether to fall back to legacy handlers.
 */
export function wouldHandleKey(input: string, key: KeyEvent, kbCtx: KeybindingContext): boolean {
  const keyStr = keyToString(input, key)
  const modifiers = keyToModifiers(key)
  return resolveKeybinding(keyStr, modifiers, kbCtx) != null
}

// Re-export for convenience

export type { CommandContext, CommandAction }
