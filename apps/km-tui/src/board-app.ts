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
import { createBoardAppStoreState, getActiveBoardPane, type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { isBoardPane, isDetailViewPane } from "./board-types.ts"
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
import { deriveColumnsFromRepo, deriveDetailColumns, buildNodeIndex, deriveCursorIndices } from "./hooks/use-columns.ts"
import { hitTestSplitBorder, hitTestPaneId } from "./layout-helpers.ts"
import { type LayoutNode, mergePaneUI, hasDetailPaneFor } from "./board-types.ts"
import type { PaneUI } from "./ui-reducer.ts"

const perfLog = createLogger("km:perf")

// Singleton — stateless, so one instance suffices for all key events
const cardsViewNavigation = createCardsViewNavigation()

// =============================================================================
// Board App Locals — per-instance mutable state (no module-level lets)
// =============================================================================

export interface BoardAppLocals {
  lastKeyTime: number
  cachedFocusManager: FocusManager | null
  cachedFocus: ((testID: string) => void) | null
  cachedActivateScope: ((scopeId: string) => void) | null
  layoutCache: {
    rootId: string | null
    foldDepths: Map<string, number>
    repoVersion: number
    columns: ColumnView[]
    nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  } | null
  chordTimer: ReturnType<typeof setTimeout> | null
  pendingChordShownAt: number
  chordDismissTimer: ReturnType<typeof setTimeout> | null
  chordTimeoutFiredAt: number
  lastClick: { time: number; x: number; y: number }
  dragState: {
    splitNode: LayoutNode & { type: "split" }
    containerStart: number
    containerSize: number
  } | null
}

export function createBoardAppLocals(): BoardAppLocals {
  return {
    lastKeyTime: 0,
    cachedFocusManager: null,
    cachedFocus: null,
    cachedActivateScope: null,
    layoutCache: null,
    chordTimer: null,
    pendingChordShownAt: 0,
    chordDismissTimer: null,
    chordTimeoutFiredAt: 0,
    lastClick: { time: 0, x: 0, y: 0 },
    dragState: null,
  }
}

// =============================================================================
// Mouse Helpers (stateless — shared across all handler instances)
// =============================================================================

/** Scroll-wheel step count: each notch moves cursor by this many items */
const SCROLL_STEP = 3

const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_DISTANCE = 2

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

// =============================================================================
// Handler Factory
// =============================================================================

/** Return type of createBoardAppHandlers — all handler functions closed over one locals bag. */
export interface BoardAppHandlers {
  handleKey: (
    data: { input: string; key: Key },
    ctx: EventHandlerContext<BoardAppStore>,
    exitApp: () => void,
  ) => void | "exit" | "flush"
  handleMouse: (mouse: ParsedMouse, ctx: EventHandlerContext<BoardAppStore>) => void
  buildActionCtx: (get: () => BoardAppStore, exit: () => void) => ActionCtx
  dispatchCommandById: (
    commandId: string,
    get: () => BoardAppStore,
    exitApp?: () => void,
    targetId?: string,
  ) => void
  triggerChordTimeout: (get: () => BoardAppStore, exitApp?: () => void) => void
}

/**
 * Create all board-app handler functions, closed over a single BoardAppLocals bag.
 * Each createBoardApp() call gets its own locals, eliminating module-level mutable state.
 */
export function createBoardAppHandlers(locals: BoardAppLocals): BoardAppHandlers {

/**
 * Build an ActionCtx from store state.
 * Called on each key event to get fresh state.
 * Caches columns/nodeIndex between calls when state is unchanged.
 */
function buildActionCtx(get: () => BoardAppStore, exit: () => void): ActionCtx {
  const s = get()
  const board = getActiveBoardPane(s)
  const rootId = board?.rootId ?? null
  const cursorNodeId = board?.cursorNodeId ?? null
  const foldDepths = board?.foldDepths ?? new Map<string, number>()
  const repoVersion = s.repo.getSnapshot()

  // Reuse cached layout if state inputs haven't changed
  // foldDepths uses reference equality — each fold/unfold creates a new Map
  let columns: ColumnView[]
  let nodeIndex: Map<string, { colIndex: number; cardIndex: number }>
  if (
    locals.layoutCache &&
    locals.layoutCache.rootId === rootId &&
    locals.layoutCache.foldDepths === foldDepths &&
    locals.layoutCache.repoVersion === repoVersion
  ) {
    columns = locals.layoutCache.columns
    nodeIndex = locals.layoutCache.nodeIndex
  } else {
    // Adaptive preload: shallow for large boards (everything folded), deeper for small ones
    const topChildren = s.repo.getChildren(rootId)
    s.repo.preloadSubtree(rootId, topChildren.length > 20 ? 2 : 4)
    const derive = board?.viewMode === "detail" ? deriveDetailColumns : deriveColumnsFromRepo
    columns = derive(s.repo, rootId, foldDepths)
    nodeIndex = buildNodeIndex(columns)
    locals.layoutCache = { rootId, foldDepths, repoVersion, columns, nodeIndex }
  }
  const cursor = deriveCursorIndices(columns, cursorNodeId, nodeIndex, (id) => s.repo.getNode(id))
  const column = columns[cursor.colIndex]
  const card = column?.cardNodes[cursor.cardIndex]
  const selectedNode = card ?? column?.node ?? null

  // Merge per-pane UI fields into effective UI state for action handlers
  const effectiveUI: PaneUI = board
    ? mergePaneUI(s.ui, board)
    : (s.ui as PaneUI)

  return {
    repo: s.repo,
    rootId,
    rootPath: board?.rootPath ?? null,
    cursorNodeId,
    selectedNodes: board?.selectedNodes ?? new Set(),
    foldDepths,
    collapsedNodes: board?.collapsedNodes ?? new Set(),
    moveMode: board?.moveMode ?? false,
    moveSourceNodes: board?.moveSourceNodes ?? [],
    moveSourceCursorNodeId: board?.moveSourceCursorNodeId ?? null,
    ui: effectiveUI,
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
    getDetailCursorId: () => s.getDetailCursorId(),
    setDetailCursor: (id) => s.setDetailCursor(id),
    openDetailPane: () => s.openDetailPane(),
    closeDetailPane: () => s.closeDetailPane(),
    toggleDetailPane: () => s.toggleDetailPane(),
    splitFocusedPane: (direction) => s.splitFocusedPane(direction),
    closeFocusedPane: () => s.closeFocusedPane(),
    focusPaneInDirection: (direction) => s.focusPaneInDirection(direction),
    focusPreviousPane: () => s.focusPreviousPane(),
    cyclePaneFocus: (direction) => s.cyclePaneFocus(direction),
    focusPaneByNumber: (number) => s.focusPaneByNumber(number),
    focusPaneById: (paneId) => s.focusPaneById(paneId),
    resizeFocusedPane: (delta, axis) => s.resizeFocusedPane(delta, axis),
    equalizePanes: () => s.equalizePanes(),
    zoomFocusedPane: () => s.zoomFocusedPane(),
    closeAllButFocused: () => s.closeAllButFocused(),
    swapPaneInDirection: (direction) => s.swapPaneInDirection(direction),
    activateEmptyPane: () => s.activateEmptyPane(),
    focusedPaneViewType: () => {
      const ws = get().workspace
      const pane = ws.panes.get(ws.focusedPaneId)
      if (!pane) return "board"
      if (pane.viewType === "empty") return "empty"
      if (isDetailViewPane(pane)) return "detail"
      return "board"
    },
    focusedPaneId: () => get().workspace.focusedPaneId,
    getParentPaneId: () => {
      const ws = get().workspace
      const pane = ws.panes.get(ws.focusedPaneId)
      if (pane && isBoardPane(pane) && isDetailViewPane(pane) && pane.parentPaneId) {
        return pane.parentPaneId
      }
      return null
    },
    exit,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- set by handleKey/handleMouse before buildActionCtx is called
    focusManager: locals.cachedFocusManager!,
    focus: locals.cachedFocus ?? (() => {}),
    activateScope: locals.cachedActivateScope ?? (() => {}),
    syncFocusScope: () => {
      const paneId = get().workspace.focusedPaneId
      if (locals.cachedActivateScope) {
        locals.cachedActivateScope(paneId)
      }
    },
    hasDetailPane: hasDetailPaneFor(s.workspace, s.workspace.focusedPaneId),
    countVisibleDescendants: (node, depth, maxDepth, foldDepths) =>
      countVisibleDescendants(s.repo, node, depth, maxDepth, foldDepths),
    getVisibleDescendantIds: (cardNode, maxDepth, foldDepths) =>
      getVisibleDescendantIds(s.repo, cardNode, maxDepth, foldDepths, rootId),
  }
}

const CHORD_TIMEOUT_MS = 500

// After chord timeout fires, hints stay visible (dimmed) for this long before auto-dismissing.
const CHORD_DIMMED_DISPLAY_MS = 1200

// Minimum display duration for the which-key popup (ms).
// The popup stays visible for at least this long after appearing, even after
// the chord timeout fires the standalone command. Only dismissed by:
// (1) valid suffix key, (2) Escape, (3) any key after min duration elapsed.
const WHICH_KEY_MIN_DISPLAY_MS = CHORD_TIMEOUT_MS + CHORD_DIMMED_DISPLAY_MS

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
function handleKey(
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
  if (locals.cachedFocusManager !== ctx.focusManager) {
    locals.cachedFocusManager = ctx.focusManager
    locals.cachedFocus = ctx.focus.bind(ctx)
    locals.cachedActivateScope = ctx.activateScope.bind(ctx)
  }

  // Activate the initial focus scope on first key event (before any command processing)
  if (ctx.focusManager.activeScopeId === null) {
    const paneId = get().workspace.focusedPaneId
    ctx.activateScope(paneId)
  }

  // Track inter-event gap
  const now = performance.now()
  const gap = locals.lastKeyTime > 0 ? now - locals.lastKeyTime : 0
  locals.lastKeyTime = now

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
    const elapsed = now - locals.pendingChordShownAt
    if (key.escape || elapsed >= WHICH_KEY_MIN_DISPLAY_MS) {
      // Dismiss: Escape cancels, or min display time elapsed + any key
      if (locals.chordDismissTimer !== null) {
        clearTimeout(locals.chordDismissTimer)
        locals.chordDismissTimer = null
      }
      get().setUI({ pendingChord: null, chordTimedOut: false })
    }
    // If within min display time: pendingChord stays set.
    // The chord state machine still processes the key (suffix → resolve, which clears pendingChord below).
  }

  // Clear any pending chord timeout (we got a new key)
  if (locals.chordTimer !== null) {
    clearTimeout(locals.chordTimer)
    locals.chordTimer = null
  }

  // Suppress keystrokes that arrive shortly after a chord timeout fired.
  // When 't' starts a chord and times out (300ms), the standalone command
  // executes (e.g., set_due_date opens dialog). If the user's 'd' arrives
  // just after, it would leak into the dialog's text input. Swallow it.
  if (locals.chordTimeoutFiredAt > 0) {
    const elapsed = now - locals.chordTimeoutFiredAt
    locals.chordTimeoutFiredAt = 0
    if (elapsed < CHORD_TIMEOUT_GRACE_MS && input.length === 1 && input >= " " && !key.ctrl && !key.meta) {
      return
    }
  }

  routeThroughCommandSystem(keySpan, input, key, get, exitApp)
  if (needsRenderFlush()) return "flush"
}

/** Fire the chord timeout: resolve the pending prefix as its standalone command. */
function fireChordTimeout(get: () => BoardAppStore, exitApp: () => void): void {
  locals.chordTimeoutFiredAt = performance.now()
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
  locals.chordDismissTimer = setTimeout(() => {
    locals.chordDismissTimer = null
    get().setUI({ pendingChord: null, chordTimedOut: false })
  }, CHORD_DIMMED_DISPLAY_MS)
}

/**
 * Execute a command by ID — used by omnibox/command palette.
 *
 * Builds fresh ActionCtx, calls executeCommand, then dispatches resulting actions.
 * Call from React callbacks (e.g., omnibox onSelect) that have store access.
 */
function dispatchCommandById(
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
function triggerChordTimeout(get: () => BoardAppStore, exitApp: () => void = () => {}): void {
  if (locals.chordTimer !== null) {
    clearTimeout(locals.chordTimer)
    locals.chordTimer = null
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
    locals.pendingChordShownAt = performance.now()
    if (locals.chordDismissTimer !== null) {
      clearTimeout(locals.chordDismissTimer)
      locals.chordDismissTimer = null
    }
    ctx.setUI({
      status: { level: "info", message: `${result.pending}-` },
      pendingChord: result.pending,
      chordTimedOut: false,
    })
    locals.chordTimer = setTimeout(() => {
      locals.chordTimer = null
      fireChordTimeout(get, exitApp)
    }, CHORD_TIMEOUT_MS)
    return
  }

  // Chord resolved (valid suffix key pressed) — immediately clear the which-key popup
  if (result.chordResolved && get().ui.pendingChord !== null) {
    if (locals.chordDismissTimer !== null) {
      clearTimeout(locals.chordDismissTimer)
      locals.chordDismissTimer = null
    }
    ctx.setUI({ pendingChord: null, chordTimedOut: false })
  }

  // Chord cancelled (invalid second key or Escape) — clear popup, ring bell
  if (result.chordCancelled) {
    parentSpan.spanData.outcome = "chord-cancelled"
    if (locals.chordDismissTimer !== null) {
      clearTimeout(locals.chordDismissTimer)
      locals.chordDismissTimer = null
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
function handleMouse(mouse: ParsedMouse, ctx: EventHandlerContext<BoardAppStore>): void {
  const { get } = ctx

  // Cache focus manager from EventHandlerContext (update if changed, e.g. new test env)
  if (locals.cachedFocusManager !== ctx.focusManager) {
    locals.cachedFocusManager = ctx.focusManager
    locals.cachedFocus = ctx.focus.bind(ctx)
    locals.cachedActivateScope = ctx.activateScope.bind(ctx)
  }

  // Activate the initial focus scope on first mouse event (before any processing)
  if (ctx.focusManager.activeScopeId === null) {
    const paneId = get().workspace.focusedPaneId
    ctx.activateScope(paneId)
  }

  // --- Border drag resize (Phase 7: mouse support) ---
  if (locals.dragState) {
    if (mouse.action === "move") {
      const { splitNode, containerStart, containerSize } = locals.dragState
      const pos = splitNode.direction === "h" ? mouse.x : mouse.y
      const newRatio = (pos - containerStart) / containerSize
      get().setSplitRatio(splitNode, newRatio)
      return
    }
    if (mouse.action === "up") {
      locals.dragState = null
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
        locals.dragState = {
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
    const dx = Math.abs(mouse.x - locals.lastClick.x)
    const dy = Math.abs(mouse.y - locals.lastClick.y)
    const isDoubleClick =
      now - locals.lastClick.time < DOUBLE_CLICK_MS && dx <= DOUBLE_CLICK_DISTANCE && dy <= DOUBLE_CLICK_DISTANCE

    // Non-Ctrl clicks clear multi-selection (Ctrl-click extends it)
    if (!mouse.ctrl && actionCtx.ui.multiSelected.size > 0) {
      clearSelection(actionCtx)
    }

    if (target.kind === "column") {
      // Column background / empty space click → deselect all, cursor to board root
      actionCtx.dispatchBoard({ type: "SELECT", nodeId: actionCtx.rootId })
      locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
      return
    }

    // Card click (target.kind === "card")
    const nodeId = target.cardNodeId
    if (!nodeId) return

    if (isDoubleClick) {
      // Double-click → enter inline edit on the clicked block
      handleCommandAction(actionCtx, { type: "ENTER_INLINE_EDIT", nodeId, blockIndex: target.blockIndex })
      locals.lastClick = { time: 0, x: 0, y: 0 } // Reset to prevent triple-click triggering
    } else if (mouse.ctrl) {
      // Ctrl-click → move cursor to clicked card and toggle its selection
      actionCtx.dispatchBoard({ type: "SELECT", nodeId })
      actionCtx.dispatchBoard({ type: "SELECT_NODE_TOGGLE", nodeId })
      locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
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
      locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
    }
    return
  }
}

return { handleKey, handleMouse, buildActionCtx, dispatchCommandById, triggerChordTimeout }

} // end createBoardAppHandlers

// =============================================================================
// Default handlers — backward-compatible module-level exports
// =============================================================================

const defaultLocals = createBoardAppLocals()
const defaultHandlers = createBoardAppHandlers(defaultLocals)

export const handleKey = defaultHandlers.handleKey
export const handleMouse = defaultHandlers.handleMouse
export const dispatchCommandById = defaultHandlers.dispatchCommandById
export const __triggerChordTimeout = defaultHandlers.triggerChordTimeout

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

/**
 * Reset the default module-level handlers' state for isolate: false test compat.
 * Clears pending timers, then replaces with a fresh bag.
 */
export function resetBoardAppState(): void {
  if (defaultLocals.chordTimer !== null) clearTimeout(defaultLocals.chordTimer)
  if (defaultLocals.chordDismissTimer !== null) clearTimeout(defaultLocals.chordDismissTimer)
  Object.assign(defaultLocals, createBoardAppLocals())
}
