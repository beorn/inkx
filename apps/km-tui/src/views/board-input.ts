/**
 * Board keyboard input handlers
 *
 * These are handler functions (not hooks) that are called from useInput.
 * They're extracted here for organization, but the actual useInput calls
 * remain in Board.tsx since they need access to component-level state.
 */
import type { Key } from "inkx"
import type { Dispatch } from "react"
import { createlogger } from "@beorn/logger"
import { actions, type UIAction } from "../ui-reducer.ts"
import type { BoardState, BoardAction } from "@km/board"
import type { Repo } from "../repo-context.tsx"
import type { TUIContext } from "../tui-context.ts"
import { handleTreeNavigation } from "../handlers/navigation-handlers.ts"
import { processKeyWithContext } from "../command-bridge.ts"
import { handleCommandAction } from "../board/board-actions.ts"
import { isErr } from "@km/core"

const perfLog = createlogger("km:perf")

/**
 * Handle main keyboard input through command system
 * Returns true if key was handled
 */
// oxlint-disable-next-line complexity/max-cognitive, complexity/max-cyclomatic -- Keyboard routing with dialog/modal state guards
export function handleBoardKeyInput(
  input: string,
  key: Key,
  tuiContext: TUIContext,
  ui: {
    showNewItemDialog: boolean
    showProjectPicker: boolean
    showSearchDialog: boolean
    showHelp: boolean
    showConsole: boolean
  },
  dispatch: Dispatch<UIAction>,
  _exit: () => void,
): boolean {
  // Dialog modes have their own input handling via dialog components
  if (ui.showNewItemDialog || ui.showProjectPicker) {
    return false
  }

  // Inline edit mode: text editing keys are routed through the command system
  // via when: textInputFocused predicates. Board's useInput handles them normally.

  // Search dialog: text editing routed through command system (textInputFocused).
  // Nav keys (Escape, Enter, arrows) handled by SearchDialog's own useInputLayer.
  // Only process text-editing-relevant keys here; block everything else.
  if (ui.showSearchDialog) {
    // Printable chars, Backspace, Delete, and Ctrl+letter editing shortcuts
    // go through the command system → TextEditTarget. All other keys are
    // either handled by the search dialog layer or should be blocked.
    const isTextKey =
      (input.length === 1 && input >= " " && !key.ctrl && !key.meta) ||
      key.backspace ||
      key.delete ||
      (key.ctrl &&
        ["a", "e", "b", "f", "w", "u", "k"].includes(input.toLowerCase()))
    if (!isTextKey) {
      return false
    }
    // Fall through to command system processing for text editing
  }

  // Help overlay blocks most keys - only allow dismiss keys
  if (ui.showHelp) {
    if (input === "?" || key.escape || input === "q") {
      dispatch(actions.hideHelp())
      return true
    }
    // All other keys are blocked while help is showing
    return true
  }

  // Console (normal screen) - dismiss with backtick or escape only.
  // No q-to-quit since user is on the normal terminal and may be reading scrollback.
  if (ui.showConsole) {
    if (key.escape || input === "`") {
      dispatch(actions.hideConsole())
      return true
    }
    return true // Block all other keys on normal screen
  }

  // Toggle console with backtick
  if (input === "`") {
    dispatch(actions.toggleConsole())
    return true
  }

  // Clear bell and status at start of each keypress
  dispatch(actions.clearBell())
  dispatch(actions.clearStatus())

  // DEV: Test toast command (Ctrl+T)
  if (key.ctrl && input === "t") {
    const { toastQueue } = tuiContext
    const examples = [
      () => toastQueue.success("Task completed!"),
      () =>
        toastQueue.error("Failed to save", { description: "Network error" }),
      () => toastQueue.warning("Disk space low"),
      () => toastQueue.info("3 tasks selected"),
      () =>
        toastQueue.info("File deleted", {
          action: { label: "Undo", trigger: "z" },
        }),
    ]
    const randomToast = examples[Math.floor(Math.random() * examples.length)]
    randomToast?.()
    return true
  }

  // Escape dismisses toast if present
  if (key.escape && tuiContext.toastQueue.getLatest()) {
    tuiContext.toastQueue.dismissAll()
    return true
  }

  // Route ALL keys through the command system
  const keyStart = performance.now()
  const result = processKeyWithContext(input, key, tuiContext)

  if (result.handled && result.actions) {
    const actionList = Array.isArray(result.actions)
      ? result.actions
      : [result.actions]
    for (const action of actionList) {
      const actionStart = performance.now()
      const actionResult = handleCommandAction(tuiContext, action)
      const actionDuration = performance.now() - actionStart
      if (actionDuration > 5) {
        perfLog.debug?.(`action ${action.type}: ${actionDuration.toFixed(2)}ms`)
      }

      // Check for boundary errors - ring bell and show status message
      if (isErr(actionResult) && actionResult.error.type === "boundary") {
        dispatch(actions.setBell(actionResult.error.direction))
        dispatch(
          actions.setStatus({
            level: "warning",
            message:
              actionResult.error.message ??
              `Can't move ${actionResult.error.direction}`,
          }),
        )
        // Output actual bell character to terminal
        process.stdout.write("\x07")
      }
    }
    const totalDuration = performance.now() - keyStart
    if (totalDuration > 10) {
      perfLog.debug?.(`total key handling: ${totalDuration.toFixed(2)}ms`)
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
  repo: Repo,
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
    const targetId = handleTreeNavigation("next", boardState, repo)
    if (targetId) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
    }
    return
  }
  if (input === "k" || key.upArrow) {
    const targetId = handleTreeNavigation("prev", boardState, repo)
    if (targetId) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
    }
    return
  }
}
