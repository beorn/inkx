/**
 * Board App — createApp() definition (Layer 3)
 *
 * Defines the board application with Zustand store + term:key/term:mouse event handlers.
 * Key flow: stdin → TermProvider → term:key handler → command system → set()/setUI() → React re-renders
 * Mouse flow: stdin → TermProvider → term:mouse handler → scroll=viewport-scroll, click=hitTest→SELECT(node), ctrl-click=SELECT+TOGGLE, dblclick=ENTER_INLINE_EDIT
 */

import { createApp, type EventHandlerContext } from "@silvery/create/create-app"
import type { Key, ParsedMouse, FocusManager, AgNode } from "@silvery/ag-react"
import { activeEditTargetRef, activeEditContextRef, lastModifierState } from "@silvery/ag-react"
import { createLogger } from "loggily"

/** Local type alias — works around loggily's `export *` not resolving via tsc bundler mode */
type SpanLogger = ReturnType<ReturnType<typeof createLogger>["span"]>
import { isErr } from "@km/core"
import type { BoardAppStore } from "./board-app-store.ts"
import { createBoardAppStoreState, getActiveBoardPane, type CreateBoardAppStoreParams } from "./board-app-store.ts"
import { isBoardPane, isDetailViewPane } from "./board-types.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext, processChordTimeout } from "./command-bridge.ts"
import { executeCommand } from "@km/commands"
import { getModeStack, resetModeStack } from "./dialog-guard.ts"
import { handleCommandAction } from "./board/board-actions.ts"
import { clickToCursorOffset } from "./board/click-to-cursor.ts"
import { needsRenderFlush } from "./board/board-actions-edit.ts"
import { clearSelection } from "./keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "./tui-context.ts"
import type { ColumnView } from "./types.ts"
import { readBoardHidden, isHidden } from "./hidden.ts"
import { getViewNavigation } from "./view-navigation.ts"
import { checkInvariants } from "./invariants.ts"
import { deriveColumnsFromRepo, deriveDetailColumns, buildNodeIndex, deriveCursorIndices } from "./hooks/use-columns.ts"
import { hitTestSplitBorder, hitTestPaneId } from "./layout-helpers.ts"
import { type LayoutNode, mergePaneUI, hasDetailPaneFor } from "./board-types.ts"
import type { PaneUI } from "./ui-reducer.ts"

const perfLog = createLogger("km:perf")

// =============================================================================
// Shared key-name lookup table (Key boolean → display name)
// =============================================================================

/** Map Key boolean properties to human-readable names. Used by diagnostics and describeKey(). */
const KEY_NAMES: [keyof Key, string][] = [
  ["escape", "Escape"],
  ["return", "Enter"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["tab", "Tab"],
  ["upArrow", "Up"],
  ["downArrow", "Down"],
  ["leftArrow", "Left"],
  ["rightArrow", "Right"],
  ["pageUp", "PageUp"],
  ["pageDown", "PageDown"],
  ["home", "Home"],
  ["end", "End"],
]

/** Look up the display name for a special key, or return null for printable/unknown keys. */
function lookupKeyName(key: Key): string | null {
  for (const [prop, name] of KEY_NAMES) {
    if (key[prop]) return name
  }
  return null
}

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
  dispatchCommandById: (commandId: string, get: () => BoardAppStore, exitApp?: () => void, targetId?: string) => void
  triggerChordTimeout: (get: () => BoardAppStore, exitApp?: () => void) => void
}

/**
 * Create all board-app handler functions, closed over a single BoardAppLocals bag.
 * Each createBoardApp() call gets its own locals, eliminating module-level mutable state.
 */
/** Compute the set of hidden node IDs from columns + hidden paths.
 * Checked per-keypress but cached via the hidden version counter. */
function computeHiddenNodeIds(
  repo: { path: string; getNode: (id: string) => any; getChildren: (id: string | null) => any[] },
  columns: ColumnView[],
): Set<string> {
  const hiddenPaths = readBoardHidden(repo.path)
  if (hiddenPaths.size === 0) return new Set()
  const ids = new Set<string>()
  for (const col of columns) {
    if (isHidden(hiddenPaths, col.node, repo as any)) ids.add(col.node.id)
    for (const card of col.cardNodes) {
      if (isHidden(hiddenPaths, card, repo as any)) ids.add(card.id)
    }
  }
  return ids
}

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
    const cursorCardNodeId = s.cursorStore.getState().cursorCardNodeId
    const cursor = deriveCursorIndices(columns, cursorNodeId, nodeIndex, (id) => s.repo.getNode(id), cursorCardNodeId)
    const column = columns[cursor.colIndex]
    const card = column?.cardNodes[cursor.cardIndex]
    const selectedNode = card ?? column?.node ?? null

    // Merge per-pane UI fields into effective UI state for action handlers
    const effectiveUI: PaneUI = board ? mergePaneUI(s.ui, board) : (s.ui as PaneUI)

    return {
      repo: s.repo,
      rootId,
      rootPath: board?.rootPath ?? null,
      cursorNodeId,
      cursorCardNodeId: s.cursorStore.getState().cursorCardNodeId,
      hiddenNodeIds: computeHiddenNodeIds(s.repo, columns),
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
      viewNavigation: getViewNavigation(board?.viewMode ?? "cards"),
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

  const CHORD_TIMEOUT_MS = 1500

  // After chord timeout fires, hints stay visible (dimmed) for this long before auto-dismissing.
  const CHORD_DIMMED_DISPLAY_MS = 3600

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
    ;(globalThis as any).__km_last_key = lookupKeyName(key) ?? (input || "?")

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
            isTask: ctx.selectedNode.item?.task?.status != null,
            children: [],
            depth: 0,
            childCount: 0,
            childrenLoaded: true,
          } as import("@km/commands").TNode)
        : null,
      currentNodeId: ctx.selectedNode?.id ?? null,
      cursorNodeId: ctx.cursorNodeId,
      selectedNodes: Array.from(ctx.ui.multiSelected),
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
   * Handle chord state transitions after keybinding resolution.
   *
   * Returns "consumed" if the chord state machine fully handled the key (pending/cancelled),
   * or "continue" if the caller should proceed with action execution.
   */
  function handleChordInput(
    result: ReturnType<typeof processKeyWithContext>,
    ctx: ActionCtx,
    get: () => BoardAppStore,
    exitApp: () => void,
    parentSpan: SpanLogger,
  ): "consumed" | "continue" {
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
      return "consumed"
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
      return "consumed"
    }

    return "continue"
  }

  /**
   * Route key through the command system and handle resulting actions.
   * When a dialog is open, only dialog.* and text.* commands are processed.
   */
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

    // Phase 1.5: Chord state machine — pending/resolved/cancelled
    if (handleChordInput(result, ctx, get, exitApp, parentSpan) === "consumed") return

    // When a dialog is open, unhandled keys are expected (limited key set).
    // TODO(km-canonical): The dialog mode stack and command filtering below could
    // potentially be replaced with withFocus() scoping, where dialog components
    // create focus scopes that intercept keys before they reach the board command
    // system. This would move dialog key filtering from imperative mode checks to
    // declarative focus tree structure.
    const dialogOpen = getModeStack().isDialog()

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
          result.commandId.startsWith("filter.") ||
          result.commandId.startsWith("favorites.")
        if (!isDialogOrTextCommand) {
          parentSpan.spanData.outcome = "dialog-filtered"
          return
        }
      }

      // Inject pressed key into FAVORITES_SELECT_KEY (wildcard catches key, command doesn't have it)
      for (const action of actionList) {
        if (action.type === "FAVORITES_SELECT_KEY" && !(action as { key?: string }).key) {
          ;(action as { key: string }).key = input
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

      // Phase 3: Invariant checks — verify state consistency after mutations
      {
        using _invariants = parentSpan.span("invariants")
        const freshCtx = buildActionCtx(get, exitApp)
        const violations = checkInvariants(freshCtx)
        if (violations.length > 0) {
          parentSpan.spanData.invariantViolations = violations.length
        }
      }
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

      // DOM-style hit testing via silvery render tree
      const hitNode = ctx.hitTest(mouse.x, mouse.y)
      if (!hitNode) return

      // Walk up ancestors to find clicked item and card-level node.
      // data-view="item" = sub-block, data-view="card"/data-card-id = card wrapper, data-view="column" = column
      let nodeId: string | null = null // First id found (may be sub-block)
      let idNode: AgNode | null = null
      let cardId: string | null = null // Card-level id (for border-click fallback)
      let firstIdIsColumn = false
      let colIndex: number | null = null
      let hasClickHandler = false
      let current: AgNode | null = hitNode
      while (current) {
        const props = current.props as Record<string, unknown>
        if (typeof props.id === "string") {
          if (!nodeId) {
            nodeId = props.id
            idNode = current
            firstIdIsColumn = props["data-view"] === "column"
          }
          if (props["data-view"] === "card") cardId = props.id
        }
        // Card wrapper uses data-card-id (not id) to avoid duplicate id conflicts with TreeNode.
        if (!cardId && typeof props["data-card-id"] === "string") cardId = props["data-card-id"] as string
        if (colIndex === null && props["data-col-index"] != null) colIndex = Number(props["data-col-index"])
        if (typeof props.onClick === "function") hasClickHandler = true
        current = current.parent
      }
      // Column click = no card ancestor found AND the first id-bearing element is the column.
      // Clicks inside cards always find data-card-id or data-view="item" before the column.
      const isColumnNode = firstIdIsColumn && !cardId
      // Selection priority:
      // 1. Sub-block nodeId (click on content inside card → j/k sub-block navigation)
      // 2. Card-level cardId (click on border → card selection, not column deselect)
      // 3. Column nodeId (click on column header → column-level, handled below)
      const selectId = nodeId && !firstIdIsColumn ? nodeId : (cardId ?? nodeId)

      const now = Date.now()
      const dx = Math.abs(mouse.x - locals.lastClick.x)
      const dy = Math.abs(mouse.y - locals.lastClick.y)
      const isDoubleClick =
        now - locals.lastClick.time < DOUBLE_CLICK_MS && dx <= DOUBLE_CLICK_DISTANCE && dy <= DOUBLE_CLICK_DISTANCE

      // Non-Ctrl clicks clear multi-selection (Ctrl-click extends it)
      if (!mouse.ctrl && actionCtx.ui.multiSelected.size > 0) {
        clearSelection(actionCtx)
      }

      // When in inline edit mode, handle clicks differently:
      // - Inside same card → save + re-enter edit on clicked node
      // - Outside card → exit edit mode, proceed with normal click
      const edit = actionCtx.ui.inlineEditBlock
      if (edit && selectId && !isColumnNode) {
        const editCardId = actionCtx.card?.id
        // Check if clicked node is inside the same card
        let inSameCard = selectId === editCardId
        if (!inSameCard && editCardId) {
          let walkId: string | null = selectId
          while (walkId && walkId !== editCardId) {
            const n = actionCtx.repo.getNode(walkId)
            walkId = n?.parent_id ?? null
          }
          inSameCard = walkId === editCardId
        }
        if (inSameCard) {
          if (nodeId === edit.nodeId && idNode) {
            // Same node being edited → reposition cursor at click position
            const editCtx = activeEditContextRef.current
            const editTarget = activeEditTargetRef.current
            if (editCtx && editTarget) {
              const offset = clickToCursorOffset(mouse.x, mouse.y, editCtx, idNode)
              editTarget.setCursorOffset(offset)
            }
          } else if (nodeId) {
            // Different node in same card → save + re-enter edit on clicked node
            activeEditTargetRef.current?.save()
            actionCtx.dispatchBoard({ type: "SELECT", nodeId })
            actionCtx.setUI({
              inlineEditBlock: { nodeId, blockIndex: 0, initialCursorPos: "start" },
            })
          }
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
          return
        }
        // Different card → exit edit mode, fall through to normal click
        activeEditTargetRef.current?.save()
        actionCtx.setUI({ inlineEditBlock: null })
      }

      if (!selectId) {
        // Empty space click → deselect all, cursor to board root
        actionCtx.dispatchBoard({ type: "SELECT", nodeId: actionCtx.rootId })
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
        return
      }

      // Double-click check must come BEFORE isColumnNode early return so that
      // double-clicking a column header enters inline edit (title-as-card behavior).
      if (isDoubleClick) {
        // Double-click → select and enter inline edit on the clicked node
        actionCtx.dispatchBoard({ type: "SELECT", nodeId: selectId })
        handleCommandAction(actionCtx, { type: "ENTER_INLINE_EDIT", nodeId: nodeId ?? selectId, blockIndex: 0 })
        locals.lastClick = { time: 0, x: 0, y: 0 } // Reset to prevent triple-click triggering
        return
      }

      if (isColumnNode) {
        // Column header single click → select the column (not board root)
        actionCtx.dispatchBoard({ type: "SELECT", nodeId: selectId })
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
        return
      }

      // Interactive element (e.g. Link with onClick) + Cmd held — defer to
      // DOM event system. Cmd+click on a Link should open it, not select the card.
      // Uses lastModifierState because SGR mouse protocol has no Super/Cmd bit.
      if (hasClickHandler && lastModifierState.super) {
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
        return
      }

      if (mouse.ctrl) {
        // Ctrl-click → move cursor to card and toggle its selection
        actionCtx.dispatchBoard({ type: "SELECT", nodeId: selectId })
        const selected = new Set(actionCtx.ui.multiSelected)
        if (selected.has(selectId)) selected.delete(selectId)
        else selected.add(selectId)
        actionCtx.setUI({ multiSelected: selected })
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
      } else {
        // Single click → select the card (not sub-block)
        actionCtx.dispatchBoard({ type: "SELECT", nodeId: selectId })
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
function describeKey(input: string, key: Key): string {
  const parts: string[] = []
  if (key.ctrl) parts.push("Ctrl")
  if (key.meta) parts.push("Meta")
  if (key.shift) parts.push("Shift")

  const name =
    lookupKeyName(key) ??
    (input.length === 1 && input >= " " ? input : input.length > 0 ? `<${input.charCodeAt(0).toString(16)}>` : "?")

  parts.push(name)
  return parts.join("+")
}

/**
 * Create the board app definition.
 *
 * TODO(km-canonical): Migrate to pipe() composition. Currently uses createApp()
 * with an event handler map, which couples store creation and event wiring.
 * The pipe() migration would separate these concerns:
 *   pipe(
 *     createApp(storeCreator),
 *     withReact(<BoardApp />),
 *     withTerminal(process, { mouse, kitty, ... }),
 *     withFocus(),
 *     withDomEvents(),
 *   )
 * This requires createApp() to support deferred event handler registration
 * (e.g., via a withEventHandlers() plugin) so term:key/term:mouse/term:resize
 * handlers can be composed as plugins rather than constructor args.
 *
 * @param storeParams - Parameters for creating the initial store state
 * @returns AppDefinition that can be .run() with a React element
 */
export function createBoardApp(storeParams: CreateBoardAppStoreParams) {
  let exitFn: (() => void) | null = null
  resetModeStack()

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
    "term:focus": (data, ctx) => {
      const { focused } = data as { focused: boolean }
      ctx.get().setUI({ terminalFocused: focused })
      // Expose on globalThis for the heartbeat interval (which runs outside the store)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis diagnostic hook
      ;(globalThis as any).__km_terminal_focused = focused
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

/**
 * Walk visible descendants in DFS order, calling `visitor` for each visible child.
 * Shared tree-walk logic used by both countVisibleDescendants and getVisibleDescendantIds.
 *
 * @param maxChildren - Optional cap on children per node (e.g., 10 for counting).
 */
function walkVisibleDescendants(
  repo: { getChildren(id: string): { id: string }[] },
  node: { id: string },
  depth: number,
  maxDepth: number,
  foldDepths: Map<string, number>,
  remainingDepth: number,
  visitor: (child: { id: string }) => void,
  maxChildren?: number,
): void {
  if (depth >= maxDepth || remainingDepth <= 0) return
  const allChildren = repo.getChildren(node.id)
  const children = maxChildren != null ? allChildren.slice(0, maxChildren) : allChildren
  for (const child of children) {
    visitor(child)
    const childDepth = foldDepths.get(child.id) ?? remainingDepth - 1
    walkVisibleDescendants(repo, child, depth + 1, maxDepth, foldDepths, childDepth, visitor, maxChildren)
  }
}

function countVisibleDescendants(
  repo: { getChildren(id: string): { id: string }[] },
  node: { id: string },
  depth: number,
  maxDepth: number,
  foldDepths: Map<string, number>,
  remainingDepth?: number,
): number {
  const effectiveDepth = foldDepths.get(node.id) ?? remainingDepth ?? Infinity
  if (depth > maxDepth || effectiveDepth <= 0) return 0
  let count = 0
  walkVisibleDescendants(
    repo,
    node,
    depth,
    maxDepth,
    foldDepths,
    effectiveDepth,
    () => {
      count++
    },
    10,
  )
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
  walkVisibleDescendants(repo, cardNode, 0, maxDepth, foldDepths, cardDepth, (child) => {
    result.push(child.id)
  })
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
