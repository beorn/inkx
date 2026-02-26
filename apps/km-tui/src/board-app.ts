/**
 * Board App — createApp() definition (Layer 3)
 *
 * Defines the board application with Zustand store + term:key/term:mouse event handlers.
 * Key flow: stdin → TermProvider → term:key handler → command system → set()/setUI() → React re-renders
 * Mouse flow: stdin → TermProvider → term:mouse handler → scroll=viewport-scroll, click=SELECT(card/column/sub-block), ctrl-click=SELECT+TOGGLE, dblclick=ENTER_INLINE_EDIT(blockIndex)
 */

import { createApp, type EventHandlerContext } from "inkx/runtime"
import type { Key, ParsedMouse, FocusManager } from "inkx"
import { createLogger, type SpanLogger } from "@beorn/logger"
import { isErr } from "@km/core"
import type { BoardAppStore } from "./board-app-store.ts"
import { createBoardAppStoreState, type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext, processChordTimeout } from "./command-bridge.ts"
import { executeCommand } from "@km/commands"
import { getModeStack } from "./dialog-guard.ts"
import { handleCommandAction } from "./board/board-actions.ts"
import { needsRenderFlush } from "./board/board-actions-edit.ts"
import { clearSelection } from "./keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "./tui-context.ts"
import type { ColumnView } from "./types.ts"
import { createCardsViewNavigation } from "./view-navigation.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "./hooks/use-columns.ts"
import { hitTestSplitBorder, hitTestPaneId } from "./layout-helpers.ts"
import type { LayoutNode } from "./board-types.ts"

const perfLog = createLogger("km:perf")

// Inter-event gap tracking
let lastKeyTime = 0

// Singleton — stateless, so one instance suffices for all key events
const cardsViewNavigation = createCardsViewNavigation()

// Focus manager cached from EventHandlerContext (singleton, set on first key/mouse event).
let cachedFocusManager: FocusManager | null = null
let cachedFocus: ((testID: string) => void) | null = null

// =============================================================================
// Key Handler
// =============================================================================

// Layout cache — avoids recomputing columns+nodeIndex on every keypress when state hasn't changed.
// Uses Map reference equality for foldDepths (each mutation creates a new Map).
let layoutCache: {
  rootId: string | null
  foldDepths: Map<string, number>
  repoVersion: number
  columns: ColumnView[]
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
} | null = null

/**
 * Build an ActionCtx from store state.
 * Called on each key event to get fresh state.
 * Caches columns/nodeIndex between calls when state is unchanged.
 */
function buildActionCtx(get: () => BoardAppStore, exit: () => void): ActionCtx {
  const s = get()
  const repoVersion = s.repo.getSnapshot()

  // Reuse cached layout if state inputs haven't changed
  // foldDepths uses reference equality — each fold/unfold creates a new Map
  let columns: ColumnView[]
  let nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  if (
    layoutCache &&
    layoutCache.rootId === s.rootId &&
    layoutCache.foldDepths === s.foldDepths &&
    layoutCache.repoVersion === repoVersion
  ) {
    columns = layoutCache.columns
    nodeIndex = layoutCache.nodeIndex
  } else {
    // Adaptive preload: shallow for large boards (everything folded), deeper for small ones
    const topChildren = s.repo.getChildren(s.rootId)
    s.repo.preloadSubtree(s.rootId, topChildren.length > 20 ? 2 : 4)
    columns = deriveColumnsFromRepo(s.repo, s.rootId, s.foldDepths)
    nodeIndex = buildNodeIndex(columns)
    layoutCache = { rootId: s.rootId, foldDepths: s.foldDepths, repoVersion, columns, nodeIndex }
  }
  const cursor = deriveCursorIndices(columns, s.cursorNodeId, nodeIndex, (id) => s.repo.getNode(id))
  const column = columns[cursor.colIndex]
  const card = column?.cardNodes[cursor.cardIndex]
  const selectedNode = card ?? column?.node ?? null

  return {
    repo: s.repo,
    rootId: s.rootId,
    rootPath: s.rootPath,
    cursorNodeId: s.cursorNodeId,
    selectedNodes: s.selectedNodes,
    foldDepths: s.foldDepths,
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
    setFoldDepths: (depths) => s.setFoldDepths(depths),
    openDetailPane: () => s.openDetailPane(),
    closeDetailPane: () => s.closeDetailPane(),
    toggleDetailPane: () => s.toggleDetailPane(),
    splitFocusedPane: (direction) => s.splitFocusedPane(direction),
    closeFocusedPane: () => s.closeFocusedPane(),
    focusPaneInDirection: (direction) => s.focusPaneInDirection(direction),
    focusPreviousPane: () => s.focusPreviousPane(),
    cyclePaneFocus: (direction) => s.cyclePaneFocus(direction),
    focusPaneByNumber: (number) => s.focusPaneByNumber(number),
    resizeFocusedPane: (delta, axis) => s.resizeFocusedPane(delta, axis),
    equalizePanes: () => s.equalizePanes(),
    zoomFocusedPane: () => s.zoomFocusedPane(),
    closeAllButFocused: () => s.closeAllButFocused(),
    swapPaneInDirection: (direction) => s.swapPaneInDirection(direction),
    activateEmptyPane: () => s.activateEmptyPane(),
    focusedPaneViewType: () => {
      const ws = get().workspace
      const pane = ws.panes.get(ws.focusedPaneId)
      return pane?.viewType ?? "board"
    },
    exit,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- set by handleKey/handleMouse before buildActionCtx is called
    focusManager: cachedFocusManager!,
    focus: cachedFocus ?? (() => {}),
    hasDetailPane: s.workspace.panes.has("main-detail"),
    countVisibleDescendants: (node, depth, maxDepth, foldDepths) =>
      countVisibleDescendants(s.repo, node, depth, maxDepth, foldDepths),
    getVisibleDescendantIds: (cardNode, maxDepth, foldDepths) =>
      getVisibleDescendantIds(s.repo, cardNode, maxDepth, foldDepths, s.rootId),
  }
}

// Chord timeout timer
let chordTimer: ReturnType<typeof setTimeout> | null = null
const CHORD_TIMEOUT_MS = 500

// After chord timeout fires, hints stay visible (dimmed) for this long before auto-dismissing.
const CHORD_DIMMED_DISPLAY_MS = 1200

// Minimum display duration for the which-key popup (ms).
// The popup stays visible for at least this long after appearing, even after
// the chord timeout fires the standalone command. Only dismissed by:
// (1) valid suffix key, (2) Escape, (3) any key after min duration elapsed.
const WHICH_KEY_MIN_DISPLAY_MS = CHORD_TIMEOUT_MS + CHORD_DIMMED_DISPLAY_MS

// Timestamp when pendingChord was set (for minimum display duration)
let pendingChordShownAt = 0
// Auto-dismiss timer (clears pendingChord after dimmed display period)
let chordDismissTimer: ReturnType<typeof setTimeout> | null = null

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

  // Track last key for event loop block diagnostics (read by heartbeat in tui.tsx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
  ;(globalThis as any).__km_last_key = key.escape
    ? "Escape"
    : key.return
      ? "Enter"
      : key.backspace
        ? "Backspace"
        : key.tab
          ? "Tab"
          : key.upArrow
            ? "Up"
            : key.downArrow
              ? "Down"
              : key.leftArrow
                ? "Left"
                : key.rightArrow
                  ? "Right"
                  : input || "?"

  // Cache focus manager from EventHandlerContext (update if changed, e.g. new test env)
  if (cachedFocusManager !== ctx.focusManager) {
    cachedFocusManager = ctx.focusManager
    cachedFocus = ctx.focus.bind(ctx)
  }

  // Track inter-event gap
  const now = performance.now()
  const gap = lastKeyTime > 0 ? now - lastKeyTime : 0
  lastKeyTime = now

  using keySpan = perfLog.span("key", { input, gap: Math.round(gap) })

  ensureCommandSystemInitialized()

  const ui = get().ui

  // Clear bell and status at start of each keypress (only if set, to avoid unnecessary re-renders).
  // pendingChord is NOT cleared here — it has its own lifecycle (see which-key popup logic below).
  if (ui.bellState !== null || ui.status !== null) {
    get().setUI({ bellState: null, status: null })
  }

  // Which-key popup dismissal logic:
  // The popup stays visible for at least WHICH_KEY_MIN_DISPLAY_MS. After that,
  // any keypress dismisses it. Before that, only valid suffix or Escape dismisses.
  if (ui.pendingChord !== null) {
    const elapsed = now - pendingChordShownAt
    if (key.escape || elapsed >= WHICH_KEY_MIN_DISPLAY_MS) {
      // Dismiss: Escape cancels, or min display time elapsed + any key
      if (chordDismissTimer !== null) {
        clearTimeout(chordDismissTimer)
        chordDismissTimer = null
      }
      get().setUI({ pendingChord: null, chordTimedOut: false })
    }
    // If within min display time: pendingChord stays set.
    // The chord state machine still processes the key (suffix → resolve, which clears pendingChord below).
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
  // Mark chord as timed out (hints go dimmed), but keep pendingChord for visual display.
  freshCtx.setUI({ status: null, chordTimedOut: true })
  // Auto-dismiss after the dimmed display period (no keypress needed)
  chordDismissTimer = setTimeout(() => {
    chordDismissTimer = null
    get().setUI({ pendingChord: null, chordTimedOut: false })
  }, CHORD_DIMMED_DISPLAY_MS)
}

/**
 * Execute a command by ID — used by omnibox/command palette.
 *
 * Builds fresh ActionCtx, calls executeCommand, then dispatches resulting actions.
 * Call from React callbacks (e.g., omnibox onSelect) that have store access.
 */
export function dispatchCommandById(
  commandId: string,
  get: () => BoardAppStore,
  exitApp: () => void = () => {},
  targetId?: string,
): void {
  ensureCommandSystemInitialized()
  const ctx = buildActionCtx(get, exitApp)

  // Build command context for the executor
  const cmdCtx = {
    currentNode: ctx.selectedNode
      ? ({
          ...ctx.selectedNode,
          isTask: ctx.selectedNode.task_status != null,
          children: [],
          depth: 0,
          childCount: 0,
          childrenLoaded: true,
        } as import("@km/commands").TNode)
      : null,
    currentNodeId: ctx.selectedNode?.id ?? null,
    selectedNodes: Array.from(ctx.selectedNodes),
    viewMode: ctx.ui.viewMode,
    siblingIndex: ctx.cardIndex >= 0 ? ctx.cardIndex : 0,
    siblingCount: ctx.columns[ctx.colIndex]?.cardNodes.length ?? 0,
    columnIndex: ctx.colIndex >= 0 ? ctx.colIndex : 0,
    columnCount: ctx.columns.length,
    moveMode: ctx.moveMode,
    foldDepths: ctx.foldDepths,
  }

  const actions = executeCommand(commandId, cmdCtx, targetId)
  if (!actions) return

  const actionList = Array.isArray(actions) ? actions : [actions]
  for (const action of actionList) {
    const actionResult = handleCommandAction(ctx, action)
    if (isErr(actionResult) && actionResult.error.type === "boundary") {
      ctx.setUI({
        bellState: actionResult.error.direction,
        status: {
          level: "warning",
          message: actionResult.error.message ?? `Can't: ${commandId}`,
        },
      })
      process.stdout.write("\x07")
    }
  }
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
    if (result.commandId) {
      parentSpan.spanData.command = result.commandId
      // Update last key label to include command (for heartbeat diagnostics)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
      ;(globalThis as any).__km_last_key += ` → ${result.commandId}`
    }
  }

  // When a dialog is open, unhandled keys are expected (limited key set).
  // Uses the mode stack instead of checking individual UI booleans.
  const dialogOpen = getModeStack().isDialog()
  // Chord pending: show status indicator and start timeout
  if (result.pending) {
    parentSpan.spanData.outcome = "chord"
    pendingChordShownAt = performance.now()
    if (chordDismissTimer !== null) {
      clearTimeout(chordDismissTimer)
      chordDismissTimer = null
    }
    ctx.setUI({
      status: { level: "info", message: `${result.pending}-` },
      pendingChord: result.pending,
      chordTimedOut: false,
    })
    chordTimer = setTimeout(() => {
      chordTimer = null
      fireChordTimeout(get, exitApp)
    }, CHORD_TIMEOUT_MS)
    return
  }

  // Chord resolved (valid suffix key pressed) — immediately clear the which-key popup
  if (result.chordResolved && get().ui.pendingChord !== null) {
    if (chordDismissTimer !== null) {
      clearTimeout(chordDismissTimer)
      chordDismissTimer = null
    }
    ctx.setUI({ pendingChord: null, chordTimedOut: false })
  }

  // Chord cancelled (invalid second key or Escape) — clear popup, ring bell
  if (result.chordCancelled) {
    parentSpan.spanData.outcome = "chord-cancelled"
    if (chordDismissTimer !== null) {
      clearTimeout(chordDismissTimer)
      chordDismissTimer = null
    }
    ctx.setUI({ pendingChord: null, chordTimedOut: false, bellState: "chord-cancelled" })
    process.stdout.write("\x07")
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
        result.commandId === "filter" ||
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

/** Drag state for split border resize */
let dragState: {
  splitNode: LayoutNode & { type: "split" }
  containerStart: number
  containerSize: number
} | null = null

/** Mouse click target — what the user clicked on */
export interface MouseTarget {
  /** "card" = clicked on a card, "column" = clicked on column header or empty space */
  kind: "card" | "column"
  /** Column index in the columns array */
  colIndex: number
  /** Column node ID (the column's own node) */
  columnNodeId: string
  /** Card node ID (only for kind="card") */
  cardNodeId?: string
  /** Sub-block index within the card: 0 = title, 1+ = body children (only for kind="card") */
  blockIndex: number
}

/** Find which column index the mouse x-coordinate falls in, or -1 if none. */
function resolveMouseToColumn(actionCtx: ActionCtx, mouseX: number): number {
  const { navigator } = actionCtx

  // Primary: use registered column bounds (covers all columns including empty ones)
  const colIdx = navigator.findColumnAtX(mouseX)
  if (colIdx >= 0) return colIdx

  // Fallback: check card positions (for columns whose bounds haven't been registered yet)
  const { columns } = actionCtx
  for (let ci = 0; ci < columns.length; ci++) {
    const itemCount = navigator.getItemCount(ci)
    if (itemCount === 0) continue
    for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
      const rect = navigator.getPosition(ci, itemIdx)
      if (rect) {
        if (mouseX >= rect.x && mouseX < rect.x + rect.width) return ci
        break
      }
    }
  }
  return -1
}

/**
 * Resolve mouse (x, y) to a precise click target.
 *
 * Returns a MouseTarget describing what was clicked:
 * - Card click: identifies the specific card and sub-block (title vs body child)
 * - Column click: clicking the header or empty space below cards selects the column
 * - null: click didn't land on any recognizable UI element
 */
function resolveMouseTarget(actionCtx: ActionCtx, mouseX: number, mouseY: number): MouseTarget | null {
  const targetColIndex = resolveMouseToColumn(actionCtx, mouseX)
  if (targetColIndex < 0) return null

  const column = actionCtx.columns[targetColIndex]
  if (!column) return null
  const columnNodeId = column.node.id

  // Find which card in the column the click falls on.
  // findItemAtY may snap to the closest card (for keyboard stickyY navigation),
  // so we verify the click actually intersects the card's bounding box.
  const cardIndex = actionCtx.navigator.findItemAtY(targetColIndex, mouseY)

  if (cardIndex < 0) {
    // Click didn't land on a card — column header or empty space.
    return { kind: "column", colIndex: targetColIndex, columnNodeId, blockIndex: 0 }
  }

  const card = column.cardNodes[cardIndex]
  if (!card) return null

  // Verify the click actually falls within this card's bounding box.
  // Without this check, clicks on empty space between/below cards would snap to the nearest card.
  const cardRect = actionCtx.navigator.getPosition(targetColIndex, cardIndex)
  if (!cardRect) {
    return { kind: "card", colIndex: targetColIndex, columnNodeId, cardNodeId: card.id, blockIndex: 0 }
  }

  if (mouseY < cardRect.y || mouseY >= cardRect.y + cardRect.height) {
    // Click is outside the card's vertical bounds — treat as column background
    return { kind: "column", colIndex: targetColIndex, columnNodeId, blockIndex: 0 }
  }

  // Relative Y within the card's bounding box
  const relY = mouseY - cardRect.y

  // Bordered cards: row 0 = top border, row 1 = title, row 2+ = children
  // The first content row (title) is at relY=1 for bordered cards.
  // Children start at relY=2.
  // For virtual/body block cards (which still have borders per bodyBlockLayoutProps),
  // the layout is the same.
  const isVirtual = column.isVirtual || column.virtualCardIds.has(card.id)
  const titleRow = isVirtual ? 0 : 1 // virtual cards may not have borders, but bodyBlockLayoutProps adds them
  const childStartRow = titleRow + 1

  if (relY <= titleRow) {
    // Clicked on the title row (or border above it)
    return { kind: "card", colIndex: targetColIndex, columnNodeId, cardNodeId: card.id, blockIndex: 0 }
  }

  // Clicked below the title — determine which child block
  const childOffset = relY - childStartRow
  // Get children to validate the offset
  const children = actionCtx.repo.getChildren(card.id)
  if (children.length === 0 || childOffset < 0) {
    // No children or clicked on a non-child row (e.g., bottom border)
    return { kind: "card", colIndex: targetColIndex, columnNodeId, cardNodeId: card.id, blockIndex: 0 }
  }

  // blockIndex: 0 = title, 1 = first child, 2 = second child, etc.
  const blockIndex = Math.min(childOffset + 1, children.length)
  return { kind: "card", colIndex: targetColIndex, columnNodeId, cardNodeId: card.id, blockIndex }
}

/**
 * Handle term:mouse event — entry point for all mouse input.
 * - Scroll wheel: moves cursor by SCROLL_STEP items (feels like column scrolling)
 * - Left click on card title: select the card (clears multi-selection)
 * - Left click on card sub-block: select card + enter outline mode at that block
 * - Left click on column header or empty space: select the column
 * - Ctrl-click: move cursor to card and toggle it in multi-selection
 * - Double-click on card/sub-block: enter inline edit on the clicked block
 */
// oxlint-disable-next-line complexity/complexity -- mouse handler with necessary branching
export function handleMouse(mouse: ParsedMouse, ctx: EventHandlerContext<BoardAppStore>): void {
  const { get } = ctx

  // Cache focus manager from EventHandlerContext (update if changed, e.g. new test env)
  if (cachedFocusManager !== ctx.focusManager) {
    cachedFocusManager = ctx.focusManager
    cachedFocus = ctx.focus.bind(ctx)
  }

  // --- Border drag resize (Phase 7: mouse support) ---
  if (dragState) {
    if (mouse.action === "move") {
      const { splitNode, containerStart, containerSize } = dragState
      const pos = splitNode.direction === "h" ? mouse.x : mouse.y
      const newRatio = (pos - containerStart) / containerSize
      get().setSplitRatio(splitNode, newRatio)
      return
    }
    if (mouse.action === "up") {
      dragState = null
      return
    }
  }

  // Check for border click to start drag, or click-to-focus another pane
  if (mouse.action === "down" && mouse.button === 0) {
    const state = get()
    const { workspace } = state
    if (workspace.panes.size > 1) {
      const dims = state.ui.dimensions
      const bounds = { x: 0, y: 0, width: dims.columns, height: dims.rows }

      // Check split border hit first (drag resize)
      const hit = hitTestSplitBorder(workspace.layout, mouse.x, mouse.y, bounds)
      if (hit) {
        dragState = {
          splitNode: hit.splitNode,
          containerStart: hit.containerStart,
          containerSize: hit.containerSize,
        }
        return
      }

      // Click-to-focus: if click lands in a non-focused pane, switch focus
      const clickedPaneId = hitTestPaneId(workspace.layout, mouse.x, mouse.y, bounds)
      if (clickedPaneId && clickedPaneId !== workspace.focusedPaneId) {
        state.focusPaneById(clickedPaneId)
        // Don't return — let the click also do card selection in the newly focused pane
      }
    }
  }

  if (mouse.action === "wheel") {
    // Scroll wheel → scroll the column or detail pane under the mouse pointer
    const actionCtx = buildActionCtx(get, () => {})
    const colIdx = resolveMouseToColumn(actionCtx, mouse.x)

    if (colIdx < 0) {
      // Not over a column — detail pane scrolling is handled by VirtualList internally
      return
    }

    const col = actionCtx.columns[colIdx]
    if (!col || col.cardNodes.length === 0) return

    const currentAnchor = actionCtx.ui.columnScrollAnchor
    // If anchor exists for this column, continue from it; otherwise start from middle
    const baseIndex = currentAnchor?.colIdx === colIdx ? currentAnchor.anchor : Math.floor(col.cardNodes.length / 2)
    const delta = mouse.delta === -1 ? -SCROLL_STEP : SCROLL_STEP
    const maxIndex = col.cardNodes.length - 1
    const newAnchor = Math.max(0, Math.min(maxIndex, baseIndex + delta))

    actionCtx.setUI({ columnScrollAnchor: { colIdx, anchor: newAnchor } })
    return
  }

  if (mouse.action === "down" && mouse.button === 0) {
    const actionCtx = buildActionCtx(get, () => {})
    const target = resolveMouseTarget(actionCtx, mouse.x, mouse.y)
    if (!target) return

    const now = Date.now()
    const dx = Math.abs(mouse.x - lastClick.x)
    const dy = Math.abs(mouse.y - lastClick.y)
    const isDoubleClick =
      now - lastClick.time < DOUBLE_CLICK_MS && dx <= DOUBLE_CLICK_DISTANCE && dy <= DOUBLE_CLICK_DISTANCE

    // Non-Ctrl clicks clear multi-selection (Ctrl-click extends it)
    if (!mouse.ctrl && actionCtx.ui.multiSelected.size > 0) {
      clearSelection(actionCtx)
    }

    if (target.kind === "column") {
      // Column background / empty space click → deselect all, cursor to board root
      actionCtx.dispatchBoard({ type: "SELECT", nodeId: actionCtx.rootId })
      lastClick = { time: now, x: mouse.x, y: mouse.y }
      return
    }

    // Card click (target.kind === "card")
    const nodeId = target.cardNodeId
    if (!nodeId) return

    if (isDoubleClick) {
      // Double-click → enter inline edit on the clicked block
      handleCommandAction(actionCtx, { type: "ENTER_INLINE_EDIT", nodeId, blockIndex: target.blockIndex })
      lastClick = { time: 0, x: 0, y: 0 } // Reset to prevent triple-click triggering
    } else if (mouse.ctrl) {
      // Ctrl-click → move cursor to clicked card and toggle its selection
      actionCtx.dispatchBoard({ type: "SELECT", nodeId })
      actionCtx.dispatchBoard({ type: "SELECT_NODE_TOGGLE", nodeId })
      lastClick = { time: now, x: mouse.x, y: mouse.y }
    } else {
      // Single click on card: select card and (if sub-block) navigate cursor to that child node
      actionCtx.dispatchBoard({ type: "SELECT", nodeId })
      if (target.blockIndex > 0) {
        // Clicked a sub-block within the card body — set cursor to that child's node ID
        const descendantIds = getVisibleDescendantIds(
          actionCtx.repo,
          { id: nodeId },
          Infinity,
          actionCtx.foldDepths,
          actionCtx.rootId,
        )
        const childId = descendantIds[target.blockIndex]
        if (childId) {
          actionCtx.dispatchBoard({ type: "SELECT", nodeId: childId })
        }
      }
      lastClick = { time: now, x: mouse.x, y: mouse.y }
    }
    return
  }
}

// =============================================================================
// App Definition
// =============================================================================

/** Produce a human-readable label for a key press (e.g. "Ctrl+x", "F5", "w"). */
// oxlint-disable-next-line complexity/complexity -- exhaustive ternary chain for key descriptions
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
  foldDepths: Map<string, number>,
  remainingDepth?: number,
): number {
  const effectiveDepth = foldDepths.get(node.id) ?? remainingDepth ?? Infinity
  if (depth > maxDepth || effectiveDepth <= 0) {
    return 0
  }
  const children = repo.getChildren(node.id).slice(0, 10)
  let count = children.length
  for (const child of children) {
    const childDepth = foldDepths.get(child.id) ?? effectiveDepth - 1
    count += countVisibleDescendants(repo, child, depth + 1, maxDepth, foldDepths, childDepth)
  }
  return count
}

/**
 * Get flat list of visible descendant IDs in DFS order for outline navigation.
 * First entry is the card itself (index 0), then its visible descendants.
 * Uses foldDepths for depth-based visibility: each node's effective depth is
 * its explicit override or inherited (parent depth - 1).
 */
function getVisibleDescendantIds(
  repo: { getChildren(id: string): { id: string }[] },
  cardNode: { id: string },
  maxDepth: number,
  foldDepths: Map<string, number>,
  rootId?: string | null,
): string[] {
  const result: string[] = [cardNode.id]
  const cardDepth = foldDepths.get(cardNode.id) ?? foldDepths.get(rootId ?? "") ?? 1
  function walk(node: { id: string }, depth: number, remainingDepth: number): void {
    if (depth >= maxDepth || remainingDepth <= 0) return
    const children = repo.getChildren(node.id)
    for (const child of children) {
      result.push(child.id)
      const childDepth = foldDepths.get(child.id) ?? remainingDepth - 1
      walk(child, depth + 1, childDepth)
    }
  }
  walk(cardNode, 0, cardDepth)
  return result
}
