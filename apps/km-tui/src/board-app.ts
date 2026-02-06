/**
 * Board App — createApp() definition (Layer 3)
 *
 * Defines the board application with Zustand store + term:key event handler.
 * Key flow: stdin → TermProvider → term:key handler → command system → set() store → React re-renders
 *
 * This replaces:
 * - Board.tsx useInput() handler → term:key handler here
 * - Board.tsx useReducer(uiReducer) → store.ui + dispatchUI
 * - Board.tsx useReducer(boardReducer) → store.boardState + dispatchBoard
 * - board-input.ts handleBoardKeyInput() → term:key handler here
 * - onStateCaptureREPLACE_WITH_CREATEAPP_STORE → store.getState() directly
 */

import { createApp, type EventHandlerContext } from "inkx/runtime"
import type { Key } from "inkx"
import { createLogger } from "@beorn/logger"
import { isErr } from "@km/core"
import type { BoardAppStore } from "./board-app-store.ts"
import {
  createBoardAppStoreState,
  type CreateBoardAppStoreParams,
} from "./board-app-store.ts"
import { actions } from "./ui-reducer.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext } from "./command-bridge.ts"
import { handleCommandAction } from "./board/board-actions.ts"
import type { ActionCtx } from "./tui-context.ts"
import { blockEditTargetRef } from "./block-edit-target.ts"

const perfLog = createLogger("km:perf")

// =============================================================================
// Key Handler
// =============================================================================

/**
 * Build an ActionCtx from store state.
 * Called on each key event to get fresh state.
 */
function buildActionCtx(get: () => BoardAppStore, exit: () => void): ActionCtx {
  const s = get()
  const column = s.layout.columns[s.layout.colIndex]
  const card = column?.cards[s.layout.cardIndex]
  return {
    repo: s.repo,
    boardState: s.boardState,
    ui: s.ui,
    layout: s.layout,
    layoutRegistry: s.layoutRegistry,
    toastQueue: s.toastQueue,
    selectedNode: s.selectedNode,
    column,
    card,
    dispatchUI: (action) => s.dispatchUI(action),
    dispatchBoard: (action) => s.dispatchBoard(action),
    exit,
    countVisibleDescendants: (node, depth, maxDepth, foldedNodes) =>
      countVisibleDescendants(s.repo, node, depth, maxDepth, foldedNodes),
  }
}

/**
 * Handle term:key event — the single entry point for all keyboard input.
 *
 * Replaces handleBoardKeyInput from board-input.ts.
 * Same dialog guards, command routing, bell/status handling —
 * but using get()/set() instead of dispatch().
 */
// oxlint-disable-next-line complexity/max-cognitive, complexity/max-cyclomatic -- Keyboard routing with dialog/modal state guards
export function handleKey(
  data: { input: string; key: Key },
  ctx: EventHandlerContext<BoardAppStore>,
  exitApp: () => void,
): void | "exit" {
  const { input, key } = data
  const { get, set } = ctx

  ensureCommandSystemInitialized()

  const ui = get().ui
  const dialogOpen =
    ui.showSearchDialog || ui.showNewItemDialog || ui.showProjectPicker

  // When a dialog is open, route through the command system directly
  // (dialog and text commands are matched via when predicates)
  if (dialogOpen) {
    routeThroughCommandSystem(input, key, get, exitApp)
    return
  }

  // Help overlay blocks most keys - only allow dismiss keys
  if (ui.showHelp) {
    if (input === "?" || key.escape || input === "q") {
      get().dispatchUI(actions.hideHelp())
    }
    return
  }

  // Console (normal screen) - dismiss with backtick or escape only
  if (ui.showConsole) {
    if (key.escape || input === "`") {
      get().dispatchUI(actions.hideConsole())
    }
    return
  }

  // Toggle console with backtick
  if (input === "`") {
    get().dispatchUI(actions.toggleConsole())
    return
  }

  // Clear bell and status at start of each keypress
  get().dispatchUI(actions.clearBell())
  get().dispatchUI(actions.clearStatus())

  // DEV: Test toast command (Ctrl+T)
  if (key.ctrl && input === "t") {
    const { toastQueue } = get()
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
    return
  }

  // Escape dismisses toast if present
  if (key.escape && get().toastQueue.getLatest()) {
    get().toastQueue.dismissAll()
    return
  }

  routeThroughCommandSystem(input, key, get, exitApp)
}

/**
 * Route key through the command system and handle resulting actions.
 * When a dialog is open, only dialog.* and text.* commands are processed.
 */
function routeThroughCommandSystem(
  input: string,
  key: Key,
  get: () => BoardAppStore,
  exitApp: () => void,
): void {
  const ctx = buildActionCtx(get, exitApp)

  const keyStart = performance.now()
  const result = processKeyWithContext(input, key, ctx)

  if (result.handled && result.actions) {
    const actionList = Array.isArray(result.actions)
      ? result.actions
      : [result.actions]

    // When a dialog is open, only process dialog and text commands
    const dialogOpen =
      ctx.ui.showSearchDialog ||
      ctx.ui.showNewItemDialog ||
      ctx.ui.showProjectPicker
    if (dialogOpen && result.commandId) {
      const isDialogOrTextCommand =
        result.commandId.startsWith("dialog.") ||
        result.commandId.startsWith("text.")
      if (!isDialogOrTextCommand) return
    }

    for (const action of actionList) {
      const actionStart = performance.now()
      const actionResult = handleCommandAction(ctx, action)
      const actionDuration = performance.now() - actionStart
      if (actionDuration > 5) {
        perfLog.debug?.(`action ${action.type}: ${actionDuration.toFixed(2)}ms`)
      }

      // Check for boundary errors - ring bell and show status message
      if (isErr(actionResult) && actionResult.error.type === "boundary") {
        ctx.dispatchUI(actions.setBell(actionResult.error.direction))
        ctx.dispatchUI(
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
  }
}

// =============================================================================
// App Definition
// =============================================================================

/**
 * Create the board app definition.
 *
 * @param storeParams - Parameters for creating the initial store state
 * @returns AppDefinition that can be .run() with a React element
 */
export function createBoardApp(storeParams: CreateBoardAppStoreParams) {
  let exitFn: (() => void) | null = null

  const app = createApp<Record<string, unknown>, BoardAppStore>(
    () => createBoardAppStoreState(storeParams),
    {
      "term:key": (data, ctx) => {
        const result = handleKey(
          data as { input: string; key: Key },
          ctx as EventHandlerContext<BoardAppStore>,
          () => exitFn?.(),
        )
        return result
      },
    },
  )

  // Wrap run to capture the exit function
  const originalRun = app.run.bind(app)
  return {
    run: (...args: Parameters<typeof originalRun>) => {
      const runner = originalRun(...args)
      // Wrap the promise to capture the handle
      return {
        then(
          onfulfilled?: ((value: unknown) => unknown) | null,
          onrejected?: ((reason: unknown) => unknown) | null,
        ) {
          return runner.then((handle) => {
            exitFn = () => handle.unmount()
            return onfulfilled ? onfulfilled(handle) : handle
          }, onrejected)
        },
        [Symbol.asyncIterator]: () =>
          (runner as AsyncIterable<unknown>)[Symbol.asyncIterator](),
      } as typeof runner
    },
  }
}

// =============================================================================
// Helpers
// =============================================================================

function countVisibleDescendants(
  repo: { getChildren(id: string): { id: string }[] },
  node: { id: string },
  depth: number,
  maxDepth: number,
  foldedNodes: Set<string>,
): number {
  if (depth > maxDepth || foldedNodes.has(node.id)) {
    return 0
  }
  const children = repo.getChildren(node.id).slice(0, 10)
  let count = children.length
  for (const child of children) {
    count += countVisibleDescendants(
      repo,
      child,
      depth + 1,
      maxDepth,
      foldedNodes,
    )
  }
  return count
}
