/**
 * Board App — createApp() definition (Layer 3)
 *
 * Defines the board application with Zustand store + term:key/term:mouse event handlers.
 * Key flow: stdin → TermProvider → term:key handler → command system → set()/setUI() → React re-renders
 * Mouse flow: stdin → TermProvider → term:mouse handler → scroll=multi-CURSOR_MOVE, click=SELECT, dblclick=ENTER_INLINE_EDIT
 */

import { createApp, type EventHandlerContext } from "inkx/runtime"
import type { Key, ParsedMouse } from "inkx"
import { createLogger, type SpanLogger } from "@beorn/logger"
import { isErr } from "@km/core"
import type { BoardAppStore } from "./board-app-store.ts"
import { createBoardAppStoreState, type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext, processChordTimeout } from "./command-bridge.ts"
import { getModeStack } from "./dialog-guard.ts"
import { handleCommandAction } from "./board/board-actions.ts"
import { needsRenderFlush } from "./board/board-actions-edit.ts"
import type { ActionCtx } from "./tui-context.ts"
import { createCardsViewNavigation } from "./view-navigation.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "./hooks/use-columns.ts"

const perfLog = createLogger("km:perf")

// Inter-event gap tracking
let lastKeyTime = 0

// Singleton — stateless, so one instance suffices for all key events
const cardsViewNavigation = createCardsViewNavigation()

// =============================================================================
// Key Handler
// =============================================================================

/**
 * Build an ActionCtx from store state.
 * Called on each key event to get fresh state.
 */
function buildActionCtx(get: () => BoardAppStore, exit: () => void): ActionCtx {
  const s = get()
  // Derive layout fresh — no store cache, no feedback loop
  const columns = deriveColumnsFromRepo(s.repo, s.rootId, s.foldedNodes)
  const nodeIndex = buildNodeIndex(columns, (id) => s.repo.getChildren(id))
  const cursor = deriveCursorIndices(columns, s.cursorNodeId, nodeIndex)
  const column = columns[cursor.colIndex]
  const card = column?.cardNodes[cursor.cardIndex]
  const selectedNode = card ?? column?.node ?? null

  return {
    repo: s.repo,
    rootId: s.rootId,
    rootPath: s.rootPath,
    cursorNodeId: s.cursorNodeId,
    selectedNodes: s.selectedNodes,
    foldedNodes: s.foldedNodes,
    collapsedNodes: s.collapsedNodes,
    moveMode: s.moveMode,
    moveSourceNodes: s.moveSourceNodes,
    moveSourceCursorNodeId: s.moveSourceCursorNodeId,
    ui: s.ui,
    columns,
    colIndex: cursor.colIndex,
    cardIndex: cursor.cardIndex,
    isAtCardLevel: cursor.isAtCardLevel,
    nodeIndex,
    navigator: s.navigator,
    viewNavigation: cardsViewNavigation,
    toastQueue: s.toastQueue,
    undoStack: s.undoStack,
    undoHandle: s.undoHandle,
    selectedNode,
    column,
    card,
    dispatchBoard: (action) => s.dispatchBoard(action),
    setUI: (partial) => s.setUI(partial),
    setFoldedNodes: (nodes) => s.setFoldedNodes(nodes),
    exit,
    countVisibleDescendants: (node, depth, maxDepth, foldedNodes) =>
      countVisibleDescendants(s.repo, node, depth, maxDepth, foldedNodes),
  }
}

// Chord timeout timer
let chordTimer: ReturnType<typeof setTimeout> | null = null
const CHORD_TIMEOUT_MS = 300

// When the chord timeout fires and resolves the prefix as a standalone command
// (e.g., 't' → set_due_date), the user's intended chord-completion key ('d')
// may arrive shortly after. Without suppression, it leaks into the text input
// of the just-opened dialog. This timestamp tracks when the timeout last fired
// so handleKey can suppress keys arriving within a grace period.
let chordTimeoutFiredAt = 0
const CHORD_TIMEOUT_GRACE_MS = 150

/**
 * Handle term:key event — the single entry point for all keyboard input.
 * All modals (help, deleteConfirm, console, toast) are routed through the
 * command system via keybindings with when predicates and wildcard catch-alls.
 *
 * Span-instrumented: each keypress produces a km:perf:key span with sub-spans
 * for dispatch (keybinding resolution) and action (state mutation). Enable with
 * TRACE=km:perf or TRACE=1.
 */
export function handleKey(
  data: { input: string; key: Key },
  ctx: EventHandlerContext<BoardAppStore>,
  exitApp: () => void,
): void | "exit" | "flush" {
  const { input, key } = data
  const { get } = ctx

  // Track inter-event gap
  const now = performance.now()
  const gap = lastKeyTime > 0 ? now - lastKeyTime : 0
  lastKeyTime = now

  using keySpan = perfLog.span("key", { input, gap: Math.round(gap) })

  ensureCommandSystemInitialized()

  const ui = get().ui

  // Clear bell and status at start of each keypress (only if set, to avoid unnecessary re-renders).
  if (ui.bellState !== null || ui.status !== null) {
    get().setUI({ bellState: null, status: null })
  }

  // Clear any pending chord timeout (we got a new key)
  if (chordTimer !== null) {
    clearTimeout(chordTimer)
    chordTimer = null
  }

  // Suppress keystrokes that arrive shortly after a chord timeout fired.
  // When 't' starts a chord and times out (300ms), the standalone command
  // executes (e.g., set_due_date opens dialog). If the user's 'd' arrives
  // just after, it would leak into the dialog's text input. Swallow it.
  if (chordTimeoutFiredAt > 0) {
    const elapsed = now - chordTimeoutFiredAt
    chordTimeoutFiredAt = 0
    if (elapsed < CHORD_TIMEOUT_GRACE_MS && input.length === 1 && input >= " " && !key.ctrl && !key.meta) {
      return
    }
  }

  routeThroughCommandSystem(keySpan, input, key, get, exitApp)
  if (needsRenderFlush()) return "flush"
}

/** Fire the chord timeout: resolve the pending prefix as its standalone command. */
function fireChordTimeout(get: () => BoardAppStore, exitApp: () => void): void {
  chordTimeoutFiredAt = performance.now()
  const freshCtx = buildActionCtx(get, exitApp)
  const timeoutResult = processChordTimeout(freshCtx)
  if (timeoutResult?.actions) {
    const actionList = Array.isArray(timeoutResult.actions) ? timeoutResult.actions : [timeoutResult.actions]
    for (const action of actionList) {
      const actionResult = handleCommandAction(freshCtx, action)
      if (isErr(actionResult) && actionResult.error.type === "boundary") {
        freshCtx.setUI({
          bellState: actionResult.error.direction,
          status: {
            level: "warning",
            message: actionResult.error.message ?? `Can't move ${actionResult.error.direction}`,
          },
        })
        process.stdout.write("\x07")
      }
    }
  }
  // Clear chord status indicator
  freshCtx.setUI({ status: null })
}

/**
 * Test helper: manually trigger the chord timeout (bypasses real setTimeout).
 * Call after pressing a chord prefix key to simulate the timeout firing.
 */
export function __triggerChordTimeout(get: () => BoardAppStore, exitApp: () => void = () => {}): void {
  if (chordTimer !== null) {
    clearTimeout(chordTimer)
    chordTimer = null
  }
  fireChordTimeout(get, exitApp)
}

/**
 * Route key through the command system and handle resulting actions.
 * When a dialog is open, only dialog.* and text.* commands are processed.
 */
// oxlint-disable-next-line complexity/complexity -- Sequential key routing with dialog/boundary state guards
function routeThroughCommandSystem(
  parentSpan: SpanLogger,
  input: string,
  key: Key,
  get: () => BoardAppStore,
  exitApp: () => void,
): void {
  const ctx = buildActionCtx(get, exitApp)

  // Phase 1: Dispatch — resolve keybinding to command
  let result: ReturnType<typeof processKeyWithContext>
  {
    using _dispatch = parentSpan.span("dispatch")
    result = processKeyWithContext(input, key, ctx)
    if (result.commandId) parentSpan.spanData.command = result.commandId
  }

  // When a dialog is open, unhandled keys are expected (limited key set).
  // Uses the mode stack instead of checking individual UI booleans.
  const dialogOpen = getModeStack().isDialog()
  // Chord pending: show status indicator and start timeout
  if (result.pending) {
    parentSpan.spanData.outcome = "chord"
    ctx.setUI({ status: { level: "info", message: `${result.pending}-` } })
    chordTimer = setTimeout(() => {
      chordTimer = null
      fireChordTimeout(get, exitApp)
    }, CHORD_TIMEOUT_MS)
    return
  }

  if (!result.handled) {
    parentSpan.spanData.outcome = dialogOpen ? "dialog-pass" : "unhandled"
    // Visual bell for unhandled keys (only outside dialogs)
    if (!dialogOpen) {
      ctx.setUI({
        bellState: "unhandled",
        status: { level: "warning", message: `Unmapped key: ${describeKey(input, key)}` },
      })
      process.stdout.write("\x07")
    }
    return
  }

  if (result.actions) {
    const actionList = Array.isArray(result.actions) ? result.actions : [result.actions]

    // When a dialog is open, only process dialog, filter, and text commands
    if (dialogOpen && result.commandId) {
      const isDialogOrTextCommand =
        result.commandId.startsWith("dialog.") ||
        result.commandId.startsWith("text.") ||
        result.commandId.startsWith("filter.")
      if (!isDialogOrTextCommand) {
        parentSpan.spanData.outcome = "dialog-filtered"
        return
      }
    }

    // Phase 2: Actions — execute state mutations
    for (const action of actionList) {
      using actionSpan = parentSpan.span("action", { type: action.type })
      const actionResult = handleCommandAction(ctx, action)

      // Check for boundary errors - ring bell and show status message
      if (isErr(actionResult) && actionResult.error.type === "boundary") {
        actionSpan.spanData.boundary = actionResult.error.direction
        ctx.setUI({
          bellState: actionResult.error.direction,
          status: {
            level: "warning",
            message: actionResult.error.message ?? `Can't move ${actionResult.error.direction}`,
          },
        })
        process.stdout.write("\x07")
      }
    }
    parentSpan.spanData.outcome = "handled"
    parentSpan.spanData.actions = actionList.length
  }
}

// =============================================================================
// Mouse Handler
// =============================================================================

/** Scroll-wheel step count: each notch moves cursor by this many items */
const SCROLL_STEP = 3

/** Double-click detection state */
let lastClick = { time: 0, x: 0, y: 0 }
const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_DISTANCE = 2

/**
 * Resolve mouse (x, y) to a card node ID using the GridNavigator position registry.
 * Returns the node ID if the click lands on a registered card, or null otherwise.
 */
function resolveMouseToNode(
  actionCtx: ActionCtx,
  mouseX: number,
  mouseY: number,
): string | null {
  const { columns, navigator } = actionCtx

  // Find which column the click falls in by checking each section's x-range
  let targetColIndex = -1
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    // Check the first registered item in this section to get column x-bounds
    const itemCount = navigator.getItemCount(colIdx)
    if (itemCount === 0) continue

    // Find any registered item to get the column's x-range
    for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
      const rect = navigator.getPosition(colIdx, itemIdx)
      if (rect) {
        if (mouseX >= rect.x && mouseX < rect.x + rect.width) {
          targetColIndex = colIdx
        }
        break // Only need the first registered item for x-bounds
      }
    }
    if (targetColIndex >= 0) break
  }

  if (targetColIndex < 0) return null

  // Find which card in the column the click falls on
  const cardIndex = navigator.findItemAtY(targetColIndex, mouseY)
  if (cardIndex < 0) return null

  const column = columns[targetColIndex]
  const card = column?.cardNodes[cardIndex]
  return card?.id ?? null
}

/**
 * Handle term:mouse event — entry point for all mouse input.
 * - Scroll wheel: moves cursor by SCROLL_STEP items (feels like column scrolling)
 * - Left click: select the card under the cursor
 * - Double-click: enter inline edit mode on the clicked card
 */
function handleMouse(mouse: ParsedMouse, ctx: EventHandlerContext<BoardAppStore>): void {
  const { get } = ctx

  if (mouse.action === "wheel") {
    // Scroll wheel → move cursor by multiple items for scroll-like feel
    const dir = mouse.delta === -1 ? "prev" : "next"
    const actionCtx = buildActionCtx(get, () => {})
    for (let i = 0; i < SCROLL_STEP; i++) {
      const result = handleCommandAction(actionCtx, { type: "CURSOR_MOVE", dir })
      if (isErr(result) && result.error.type === "boundary") {
        break // Stop at boundary — don't overshoot
      }
    }
    return
  }

  if (mouse.action === "down" && mouse.button === 0) {
    const actionCtx = buildActionCtx(get, () => {})
    const nodeId = resolveMouseToNode(actionCtx, mouse.x, mouse.y)
    if (!nodeId) return

    const now = Date.now()
    const dx = Math.abs(mouse.x - lastClick.x)
    const dy = Math.abs(mouse.y - lastClick.y)
    const isDoubleClick =
      now - lastClick.time < DOUBLE_CLICK_MS &&
      dx <= DOUBLE_CLICK_DISTANCE &&
      dy <= DOUBLE_CLICK_DISTANCE

    if (isDoubleClick) {
      // Double-click → enter inline edit on the clicked card
      handleCommandAction(actionCtx, { type: "ENTER_INLINE_EDIT", nodeId, blockIndex: 0 })
      lastClick = { time: 0, x: 0, y: 0 } // Reset to prevent triple-click triggering
    } else {
      // Single click → select the card
      actionCtx.dispatchBoard({ type: "SELECT", nodeId })
      lastClick = { time: now, x: mouse.x, y: mouse.y }
    }
    return
  }
}

// =============================================================================
// App Definition
// =============================================================================

/** Produce a human-readable label for a key press (e.g. "Ctrl+x", "F5", "w"). */
function describeKey(input: string, key: Key): string {
  const parts: string[] = []
  if (key.ctrl) parts.push("Ctrl")
  if (key.meta) parts.push("Meta")
  if (key.shift) parts.push("Shift")

  const name = key.upArrow
    ? "Up"
    : key.downArrow
      ? "Down"
      : key.leftArrow
        ? "Left"
        : key.rightArrow
          ? "Right"
          : key.pageUp
            ? "PageUp"
            : key.pageDown
              ? "PageDown"
              : key.home
                ? "Home"
                : key.end
                  ? "End"
                  : key.return
                    ? "Enter"
                    : key.escape
                      ? "Esc"
                      : key.tab
                        ? "Tab"
                        : key.backspace
                          ? "Backspace"
                          : key.delete
                            ? "Delete"
                            : input.length === 1 && input >= " "
                              ? input
                              : input.length > 0
                                ? `<${input.charCodeAt(0).toString(16)}>`
                                : "?"

  parts.push(name)
  return parts.join("+")
}

/**
 * Create the board app definition.
 *
 * @param storeParams - Parameters for creating the initial store state
 * @returns AppDefinition that can be .run() with a React element
 */
export function createBoardApp(storeParams: CreateBoardAppStoreParams) {
  let exitFn: (() => void) | null = null

  const app = createApp<Record<string, unknown>, BoardAppStore>(() => createBoardAppStoreState(storeParams), {
    "term:key": (data, ctx) => {
      const result = handleKey(data as { input: string; key: Key }, ctx as EventHandlerContext<BoardAppStore>, () =>
        exitFn?.(),
      )
      return result
    },
    "term:resize": (data, ctx) => {
      const { cols, rows } = data as { cols: number; rows: number }
      ctx.get().setDimensions({ columns: cols, rows: rows })
    },
    "term:mouse": (data, ctx) => {
      handleMouse(data as ParsedMouse, ctx as EventHandlerContext<BoardAppStore>)
    },
  })

  // Wrap run to capture the exit function
  const originalRun = app.run.bind(app)
  return {
    run: (...args: Parameters<typeof originalRun>) => {
      const runner = originalRun(...args)
      // Wrap the promise to capture the handle
      return {
        then(onfulfilled?: ((value: unknown) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
          return runner.then((handle) => {
            exitFn = () => handle.unmount()
            return onfulfilled ? onfulfilled(handle) : handle
          }, onrejected)
        },
        [Symbol.asyncIterator]: () => (runner as AsyncIterable<unknown>)[Symbol.asyncIterator](),
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
    count += countVisibleDescendants(repo, child, depth + 1, maxDepth, foldedNodes)
  }
  return count
}
