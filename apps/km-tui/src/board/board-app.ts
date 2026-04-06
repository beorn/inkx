/**
 * Board App — createApp() definition (Layer 3)
 *
 * Defines the board application with signal store + term:key/term:mouse event handlers.
 * Key flow: stdin → TermProvider → term:key handler → command system → set()/setUI() → React re-renders
 * Mouse flow: stdin → TermProvider → term:mouse handler → scroll=viewport-scroll, click=hitTest→SELECT(node), ctrl-click=SELECT+TOGGLE, dblclick=ENTER_INLINE_EDIT
 */

import { createApp, type EventHandlerContext } from "@silvery/create/create-app"
import type { Key, ParsedMouse, FocusManager, AgNode } from "@silvery/ag-react"
import { activeEditTargetRef, activeEditContextRef, lastModifierState } from "@silvery/ag-react"
import { createLogger } from "loggily"

/** Local type alias — works around loggily's `export *` not resolving via tsc bundler mode */
type SpanLogger = ReturnType<ReturnType<typeof createLogger>["span"]>
import type { ID } from "@silvery/selection"
import { isErr } from "@km/core"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { createBoardAppStoreState, Workspace, type CreateBoardAppStoreParams } from "../state/board-app-store.ts"
import { isBoardPane, isDetailViewPane } from "./board-types.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext, processChordTimeout } from "./command-bridge.ts"
import { executeCommand } from "@km/commands"
import { getModeStack, resetModeStack } from "../dialog-guard.ts"
import { handleKmOp } from "./board-actions.ts"
import { clickToCursorOffset } from "./click-to-cursor.ts"
import { needsRenderFlush } from "./board-actions-edit.ts"
import { clearSelection } from "./board-selection-helpers.ts"
import type { OpCtx } from "../tui-context.ts"
import { DELEGATED_OP_CTX_KEYS } from "../tui-context.ts"
import type { ColumnView } from "../hooks/use-columns.ts"
import { getViewNavigation } from "../navigation/view-navigation.ts"
import { checkInvariants } from "../invariants.ts"
import {
  deriveDetailColumns,
  buildNodeIndexFromTree,
  deriveColumnsFromLens,
  deriveCursorIndices,
} from "../hooks/use-columns.ts"
import { createViewTree } from "@km/board"
import { hitTestSplitBorder, hitTestPaneId } from "../layout-helpers.ts"
import { type LayoutNode, mergePaneUI, hasDetailPaneFor } from "./board-types.ts"
import type { PaneUI } from "../state/ui-reducer.ts"

const perfLog = createLogger("km:perf")

/** Pick a subset of keys from an object, returning a new object with only those keys. */
function pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) result[key] = obj[key]
  return result
}

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
  /** Cache for cursor indices — avoids re-deriving colIndex/cardIndex when cursor+layout unchanged */
  cursorCache: {
    cursorId: string | null
    cursorCardNodeId: string | null
    /** Reference identity of the nodeIndex used for this derivation */
    nodeIndexRef: Map<string, { colIndex: number; cardIndex: number }>
    colIndex: number
    cardIndex: number
    isAtCardLevel: boolean
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
  /** Lazy-created empty ViewTreeProjection fallback for when no board/signals exist */
  emptyTree: import("@km/board").ViewTreeProjection | null
}

export function createBoardAppLocals(): BoardAppLocals {
  return {
    lastKeyTime: 0,
    cachedFocusManager: null,
    cachedFocus: null,
    cachedActivateScope: null,
    cursorCache: null,
    chordTimer: null,
    pendingChordShownAt: 0,
    chordDismissTimer: null,
    chordTimeoutFiredAt: 0,
    lastClick: { time: 0, x: 0, y: 0 },
    dragState: null,
    emptyTree: null,
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
function resolveMouseToColumn(opctx: OpCtx, mouseX: number): number {
  const { navigator } = opctx

  // Primary: use registered column bounds (covers all columns including empty ones)
  const colIdx = navigator.findColumnAtX(mouseX)
  if (colIdx >= 0) return colIdx

  // Fallback: check card positions (for columns whose bounds haven't been registered yet)
  const { columns } = opctx
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
  buildOpCtx: (get: () => BoardAppStore, exit: () => void) => OpCtx
  dispatchCommandById: (commandId: string, get: () => BoardAppStore, exitApp?: () => void, targetId?: string) => void
  triggerChordTimeout: (get: () => BoardAppStore, exitApp?: () => void) => void
}

/**
 * Create all board-app handler functions, closed over a single BoardAppLocals bag.
 * Each createBoardApp() call gets its own locals, eliminating module-level mutable state.
 */
export function createBoardAppHandlers(locals: BoardAppLocals): BoardAppHandlers {
  /**
   * Build an OpCtx from store state.
   * Called on each key event to get fresh state.
   * Derives ColumnView[] from the visible lens (PaneSignals.visibleLens computed).
   */
  function buildOpCtx(
    get: () => BoardAppStore,
    exit: () => void,
    set?: (partial: Partial<BoardAppStore>) => void,
  ): OpCtx {
    const s = get()
    const board = Workspace.getActiveBoardPane(s)
    const rootId = board?.rootId ?? null
    // Read cursor from sel.node.cursor() — canonical source
    const cursor_ = (board?.sel.node.cursor() as string | null) ?? null
    const foldDepths = board?.foldDepths ?? new Map<string, number>()

    // ViewTreeProjection — per-node projection with navigation (next/prev/parent/children/node).
    // Always provide a tree (empty fallback when no board/signals exist).
    const tree = board?.signals?.viewTree ?? locals.emptyTree ?? (locals.emptyTree = createViewTree())

    // Derive ColumnView[] from the lens (cards mode) or deriveDetailColumns (detail mode)
    const columns: ColumnView[] =
      board?.viewMode === "detail"
        ? deriveDetailColumns(s.repo, rootId, foldDepths)
        : board?.signals
          ? deriveColumnsFromLens(board.signals.visibleLens(), s.repo)
          : []
    // Use tree-based index when lens is available (no ColumnView dependency).
    const nodeIndex = board?.signals
      ? buildNodeIndexFromTree(board.signals.visibleLens())
      : new Map<string, { colIndex: number; cardIndex: number }>()

    // Pin the sel adapter to THIS visible lens for the duration of this key event.
    // Without this, a repo mutation (e.g., file watcher) between buildOpCtx and
    // sel.node.select() could invalidate the computed, producing a different
    // lens with a walkOrder that doesn't contain the navigation target.
    // This race condition causes cursor → null (the "no cursor" bug).
    if (board?.signals) {
      s.selTreeSource.update(board.signals.visibleLens())
    }

    // Use cached cursor indices when cursor+layout haven't changed
    let cursor: { colIndex: number; cardIndex: number; isAtCardLevel: boolean }
    const cc = locals.cursorCache
    if (cc && cc.cursorId === cursor_ && cc.nodeIndexRef === nodeIndex) {
      cursor = cc
    } else {
      cursor = deriveCursorIndices(columns, cursor_, nodeIndex, (id) => s.repo.getNode(id))
      locals.cursorCache = {
        cursorId: cursor_,
        cursorCardNodeId: null,
        nodeIndexRef: nodeIndex,
        colIndex: cursor.colIndex,
        cardIndex: cursor.cardIndex,
        isAtCardLevel: cursor.isAtCardLevel,
      }
    }

    const column = columns[cursor.colIndex]
    const card = column?.cardNodes[cursor.cardIndex]
    const selectedNode = card ?? column?.node ?? null
    // Derive cursorCardNodeId from layout (replaces CursorStore.cursorCardNodeId)
    const cursorCardNodeId = card?.id ?? null

    // Merge per-pane UI fields into effective UI state for action handlers
    const effectiveUI: PaneUI = board ? mergePaneUI(s.ui, board) : (s.ui as PaneUI)

    // textEditHints is mutated directly by action handlers (ctx.textEditHints = {...}).
    // Use a local variable + setter that writes through to the signal store so
    // React components and subsequent buildOpCtx() calls see the update.
    let _textEditHints = s.textEditHints

    const ctx: OpCtx = {
      repo: s.repo,
      sel: s.sel,
      selectedIds: (() => {
        const ids = s.sel.node.ids()
        return Object.assign(ids, { size: ids.length })
      })(),
      get textEditHints() {
        return _textEditHints
      },
      set textEditHints(v) {
        _textEditHints = v
        if (set) set({ textEditHints: v } as Partial<BoardAppStore>)
      },
      rootId,
      rootPath: board?.rootPath ?? null,
      cursor: cursor_,
      cursorCardNodeId,
      foldDepths,
      collapsedNodes: board?.collapsedNodes ?? new Set(),
      moveState: board?.moveState ?? { active: false },
      ui: effectiveUI,
      columns,
      colIndex: cursor.colIndex,
      cardIndex: cursor.cardIndex,
      isAtCardLevel: cursor.isAtCardLevel,
      nodeIndex,
      tree,
      navigator: s.navigator,
      viewNavigation: getViewNavigation(board?.viewMode ?? "cards"),
      toastQueue: s.toastQueue,
      undoStack: s.undoStack,
      undoHandle: s.undoHandle,
      selectedNode,
      column,
      card,
      // Delegated store methods (pure pass-throughs, dispatchBoard overridden below)
      ...pick(s, DELEGATED_OP_CTX_KEYS),
      // Dispatch board actions — reducer reads lens directly via pane.signals.visibleLens()
      dispatchBoard: (action) => {
        s.dispatchBoard(action)
      },
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- set by handleKey/handleMouse before buildOpCtx is called
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
    }
    return ctx
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

    routeThroughCommandSystem(keySpan, input, key, get, exitApp, ctx.set)
    if (needsRenderFlush()) return "flush"
  }

  /** Fire the chord timeout: resolve the pending prefix as its standalone command. */
  function fireChordTimeout(get: () => BoardAppStore, exitApp: () => void): void {
    locals.chordTimeoutFiredAt = performance.now()
    const freshCtx = buildOpCtx(get, exitApp)
    const timeoutResult = processChordTimeout(freshCtx)
    if (timeoutResult?.ops) {
      const opList = Array.isArray(timeoutResult.ops) ? timeoutResult.ops : [timeoutResult.ops]
      for (const action of opList) {
        const opResult = handleKmOp(freshCtx, action)
        if (isErr(opResult) && opResult.error.type === "boundary") {
          freshCtx.setUI({
            bellState: opResult.error.direction,
            status: {
              level: "warning",
              message: opResult.error.message ?? `Can't move ${opResult.error.direction}`,
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
   * Builds fresh OpCtx, calls executeCommand, then dispatches resulting actions.
   * Call from React callbacks (e.g., omnibox onSelect) that have store access.
   */
  function dispatchCommandById(
    commandId: string,
    get: () => BoardAppStore,
    exitApp: () => void = () => {},
    targetId?: string,
  ): void {
    ensureCommandSystemInitialized()
    const ctx = buildOpCtx(get, exitApp)

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
      cursor: ctx.cursor,
      selectedNodes: Array.from(ctx.selectedIds),
      viewMode: ctx.ui.viewMode,
      siblingIndex: ctx.cardIndex >= 0 ? ctx.cardIndex : 0,
      siblingCount: (() => {
        const colIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
        const colId = colIds[ctx.colIndex]
        return colId ? ctx.tree.children(colId).length : 0
      })(),
      columnIndex: ctx.colIndex >= 0 ? ctx.colIndex : 0,
      columnCount: ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId).length : 0,
      moveMode: ctx.moveState.active,
      foldDepths: ctx.foldDepths,
    }

    const ops = executeCommand(commandId, cmdCtx, targetId)
    if (!ops) return

    const opList = Array.isArray(ops) ? ops : [ops]
    for (const action of opList) {
      const opResult = handleKmOp(ctx, action)
      if (isErr(opResult) && opResult.error.type === "boundary") {
        ctx.setUI({
          bellState: opResult.error.direction,
          status: {
            level: "warning",
            message: opResult.error.message ?? `Can't: ${commandId}`,
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
    ctx: OpCtx,
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
    set?: (partial: Partial<BoardAppStore>) => void,
  ): void {
    const ctx = buildOpCtx(get, exitApp, set)

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

    if (result.ops) {
      const opList = Array.isArray(result.ops) ? result.ops : [result.ops]

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
      for (const op of opList) {
        if (op.type === "FAVORITES_SELECT_KEY" && !(op as { key?: string }).key) {
          ;(op as { key: string }).key = input
        }
      }

      // Phase 2: Ops — execute state mutations
      for (const op of opList) {
        using opSpan = parentSpan.span("op", { type: op.type })
        const opResult = handleKmOp(ctx, op)

        // Check for boundary errors - ring bell and show status message
        if (isErr(opResult) && opResult.error.type === "boundary") {
          opSpan.spanData.boundary = opResult.error.direction
          ctx.setUI({
            bellState: opResult.error.direction,
            status: {
              level: "warning",
              message: opResult.error.message ?? `Can't move ${opResult.error.direction}`,
            },
          })
          process.stdout.write("\x07")
        }
      }
      parentSpan.spanData.outcome = "handled"
      parentSpan.spanData.ops = opList.length

      // Phase 3: Invariant checks — verify state consistency after mutations
      {
        using _invariants = parentSpan.span("invariants")
        const freshCtx = buildOpCtx(get, exitApp)
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
      const opctx = buildOpCtx(get, () => {}, ctx.set)
      const colIdx = resolveMouseToColumn(opctx, mouse.x)

      if (colIdx < 0) {
        // Not over a column — detail pane scrolling is handled by ListView internally
        return
      }

      const colIds = opctx.tree.rootId ? opctx.tree.children(opctx.tree.rootId) : []
      const colId = colIds[colIdx]
      if (!colId) return
      const colCardCount = opctx.tree.children(colId).length
      if (colCardCount === 0) return

      const currentAnchor = opctx.ui.columnScrollAnchor
      // If anchor exists for this column, continue from it; otherwise start from middle
      const baseIndex = currentAnchor?.colIdx === colIdx ? currentAnchor.anchor : Math.floor(colCardCount / 2)
      const delta = mouse.delta === -1 ? -SCROLL_STEP : SCROLL_STEP
      const maxIndex = colCardCount - 1
      const newAnchor = Math.max(0, Math.min(maxIndex, baseIndex + delta))

      opctx.setUI({ columnScrollAnchor: { colIdx, anchor: newAnchor } })
      return
    }

    if (mouse.action === "down" && mouse.button === 0) {
      const opctx = buildOpCtx(get, () => {}, ctx.set)

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
      if (!mouse.ctrl && opctx.selectedIds.size > 0) {
        clearSelection(opctx)
      }

      // When in inline edit mode, handle clicks differently:
      // - Inside same card → save + re-enter edit on clicked node
      // - Outside card → exit edit mode, proceed with normal click
      const edit = opctx.sel.text()
      if (edit && selectId && !isColumnNode) {
        const editCardId = opctx.card?.id
        // Check if clicked node is inside the same card
        let inSameCard = selectId === editCardId
        if (!inSameCard && editCardId) {
          let walkId: string | null = selectId
          while (walkId && walkId !== editCardId) {
            const n = opctx.repo.getNode(walkId)
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
            opctx.sel.node.select([nodeId as ID])
            opctx.sel.text.edit(nodeId as import("@silvery/selection").ID, 0)
            opctx.textEditHints = { blockIndex: 0, initialCursorPos: "start" }
          }
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
          return
        }
        // Different card → exit edit mode, fall through to normal click
        activeEditTargetRef.current?.save()
        opctx.sel.text.deselect()
      }

      if (!selectId) {
        // Empty space click → deselect all, cursor to board root
        opctx.sel.node.select([opctx.rootId as ID])
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
        return
      }

      // Double-click check must come BEFORE isColumnNode early return so that
      // double-clicking a column header enters inline edit (title-as-card behavior).
      if (isDoubleClick) {
        // Double-click → select and enter inline edit on the clicked node
        opctx.sel.node.select([selectId as ID])
        handleKmOp(opctx, { type: "ENTER_INLINE_EDIT", nodeId: nodeId ?? selectId, blockIndex: 0 })
        locals.lastClick = { time: 0, x: 0, y: 0 } // Reset to prevent triple-click triggering
        return
      }

      if (isColumnNode) {
        // Column header single click → select the column (not board root)
        opctx.sel.node.select([selectId as ID])
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
        opctx.sel.node.select([selectId as ID], true)
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
      } else {
        // Single click → select the card (not sub-block)
        opctx.sel.node.select([selectId as ID])
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y }
      }
      return
    }
  }

  return { handleKey, handleMouse, buildOpCtx, dispatchCommandById, triggerChordTimeout }
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
 * Reset the default module-level handlers' state for isolate: false test compat.
 * Clears pending timers, then replaces with a fresh bag.
 */
export function resetBoardAppState(): void {
  if (defaultLocals.chordTimer !== null) clearTimeout(defaultLocals.chordTimer)
  if (defaultLocals.chordDismissTimer !== null) clearTimeout(defaultLocals.chordDismissTimer)
  Object.assign(defaultLocals, createBoardAppLocals())
}
