/**
 * Board keyboard input handlers
 *
 * These are handler functions (not hooks) that are called from useInput.
 * They're extracted here for organization, but the actual useInput calls
 * remain in Board.tsx since they need access to component-level state.
 */
import type { Key } from "inkx"
import type { Dispatch } from "react"
import { actions, type UIAction } from "../ui-reducer.ts"
import type { BoardState, BoardAction } from "@km/board"
import type { Vault } from "../vault-context.tsx"
import type { TUIContext } from "../tui-context.ts"
import { handleTreeNavigation } from "../navigation-handlers.ts"
import {
  processKeyWithContext,
  ensureCommandSystemInitialized,
} from "../command-bridge.ts"
import { handleCommandAction } from "../board-actions.ts"

// Re-export for convenience
export { ensureCommandSystemInitialized }

/**
 * Handle main keyboard input through command system
 * Returns true if key was handled
 */
export function handleBoardKeyInput(
  input: string,
  key: Key,
  tuiContext: TUIContext,
  ui: {
    showNewItemDialog: boolean
    showProjectPicker: boolean
    showHelp: boolean
  },
  dispatch: Dispatch<UIAction>,
  exit: () => void,
): boolean {
  // Dialog modes have their own input handling via dialog components
  if (ui.showNewItemDialog || ui.showProjectPicker) {
    return false
  }

  // Help overlay blocks most keys - only allow dismiss keys
  if (ui.showHelp) {
    if (input === "?" || key.escape) {
      dispatch(actions.hideHelp())
      return true
    } else if (input === "q") {
      exit()
      return true
    }
    // All other keys are blocked while help is showing
    return true
  }

  // Route ALL keys through the command system
  const result = processKeyWithContext(input, key, tuiContext)

  if (result.handled && result.actions) {
    const actionList = Array.isArray(result.actions)
      ? result.actions
      : [result.actions]
    for (const action of actionList) {
      handleCommandAction(tuiContext, action)
    }
    return true
  }

  // Unhandled keys are silently ignored
  return false
}

/**
 * Handle detail pane keyboard input
 * Limited navigation: j/k/arrows for cards, h/Esc to close, q to quit
 *
 * Uses navigation handlers to compute target nodeId, then dispatches SELECT.
 */
export function handleDetailPaneKeyInput(
  input: string,
  key: Key,
  vault: Vault,
  boardState: BoardState,
  dispatch: Dispatch<UIAction>,
  dispatchBoard: Dispatch<BoardAction>,
  exit: () => void,
): void {
  if (input === "h" || key.escape) {
    dispatch(actions.setDetailPane(false))
    return
  }
  if (input === "q") {
    exit()
    return
  }

  // Use navigation handlers to compute target nodeId
  if (input === "j" || key.downArrow) {
    const targetId = handleTreeNavigation("next", boardState, vault)
    if (targetId) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
    }
    return
  }
  if (input === "k" || key.upArrow) {
    const targetId = handleTreeNavigation("prev", boardState, vault)
    if (targetId) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
    }
    return
  }
}
