/**
 * Board App — THE public API for the km-tui board application.
 *
 * `createBoardApp(storeParams)` is the canonical entry point for tests and the CLI.
 * It returns an app definition that can be `.run()` with a React element.
 * See the "Internals" section at the bottom for the handler factory, helpers, and types.
 */

import { createApp, type EventHandlerContext } from "@silvery/create"
import type { Key, ParsedMouse, FocusManager, AgNode } from "@silvery/ag-react"
import { activeEditTargetRef, activeEditContextRef, lastModifierState } from "@silvery/ag-react"
import createDebug from "debug"
import { createLogger } from "loggily"
import type { ID } from "@silvery/selection"
import { isErr, type KNode } from "@km/core"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { createBoardAppStoreState, Workspace, type CreateBoardAppStoreParams } from "../state/board-app-store.ts"
import { isBoardPane, isDetailViewPane } from "./board-types.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"
import { processKeyWithContext, processChordTimeout } from "./command-bridge.ts"
import { executeCommand } from "@km/commands"
import { isDialogOpen, resetDialogGuard, popDialogMode } from "../dialog-guard.ts"
import { dialogTargetRef } from "../dialog-target.ts"
import { handleKmOp } from "./board-actions.ts"
import { clickToCursorOffset } from "./click-to-cursor.ts"
import { needsRenderFlush } from "./board-actions-edit.ts"
import { clearSelection } from "./board-selection-helpers.ts"
import type { OpCtx } from "../tui-context.ts"
import { DELEGATED_OP_CTX_KEYS } from "../tui-context.ts"
import { dispatchSelection, NO_SELECTION, nodeSelect, textCaret } from "../state/selection.ts"
import { getViewNavigation } from "../navigation/view-navigation.ts"
import { checkInvariants } from "../invariants.ts"
import { buildNodeIndexFromTree, deriveCursorIndices } from "../hooks/use-columns.ts"
import { createViewTree } from "@km/board"
import { hitTestSplitBorder, hitTestPaneId } from "../layout-helpers.ts"
import { type LayoutNode, mergePaneUI, hasDetailPaneFor } from "./board-types.ts"
import type { PaneUI } from "../state/ui-reducer.ts"
import { setLastKey, appendLastKey, setTerminalFocused } from "../diagnostics.ts"
import { getRecentsStore } from "../state/recents-store.ts"
import { isTeaDeleteConfirmEnabled, getDeleteConfirmStore } from "../plugins/with-delete-confirm.ts"

/**
 * Create the board app definition. THIS IS THE PUBLIC API — prefer this over
 * reaching into handlers/state directly (tests, CLI, and fixtures should all
 * call `createBoardApp()`).
 *
 * @param storeParams - Parameters for creating the initial store state
 * @returns AppDefinition that can be `.run()` with a React element
 */
export function createBoardApp(storeParams: CreateBoardAppStoreParams) {
  let exitFn: (() => void) | null = null
  resetDialogGuard()

  const app = createApp<Record<string, unknown>, BoardAppStore>(() => createBoardAppStoreState(storeParams), {
    "term:key": (data, ctx) => {
      const result = handleKey(data as { input: string; key: Key }, ctx as EventHandlerContext<BoardAppStore>, () =>
        exitFn?.(),
      )
      return result
    },
    "term:resize": (data, ctx) => {
      const { cols, rows } = data as { cols: number; rows: number }
      // Trace resize events for diagnosing multi-phase layout shifts
      // (e.g. cmux tab-switch fires 2-3 SIGWINCH bursts). Enable with:
      //   DEBUG=km:tui:resize DEBUG_LOG=/tmp/km-resize.log bun km view <path>
      // The silvery term-provider coalesces bursts within one frame, but this
      // still logs each coalesced event so we can see the final settled dims.
      resizeDebug("term:resize cols=%d rows=%d t=%d", cols, rows, Math.round(performance.now()))
      ctx.get().setDimensions({ columns: cols, rows: rows })
      resizeDebug("setDimensions done columns=%d rows=%d t=%d", cols, rows, Math.round(performance.now()))
    },
    "term:mouse": (data, ctx) => {
      handleMouse(data as ParsedMouse, ctx as EventHandlerContext<BoardAppStore>)
    },
    "term:focus": (data, ctx) => {
      const { focused } = data as { focused: boolean }
      resizeDebug("term:focus focused=%s t=%d", focused, Math.round(performance.now()))
      ctx.get().setUI({ terminalFocused: focused })
      // Expose for the heartbeat interval (which runs outside the store)
      setTerminalFocused(focused)
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

/**
 * Reset the default module-level handlers' state for isolate: false test compat.
 * Clears pending timers, then replaces with a fresh bag.
 */
export function resetBoardAppState(): void {
  if (defaultLocals.chordTimer !== null) clearTimeout(defaultLocals.chordTimer)
  if (defaultLocals.chordDismissTimer !== null) clearTimeout(defaultLocals.chordDismissTimer)
  Object.assign(defaultLocals, createBoardAppLocals())
}

// =============================================================================
// Handler Factory — secondary export
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
  dispatchCommandById: (
    commandId: string,
    get: () => BoardAppStore,
    exitApp?: () => void,
    targetId?: string,
    /**
     * Optional subject override for the unified omnibox (Phase 7b). When
     * set, the command context's `currentNode` / `currentNodeId` /
     * `selectedNodes` are read from this snapshot instead of the live
     * focused pane. Binary verbs (move, add_link, etc.) dispatched from
     * the omnibox use `subject` as the acted-on node and `targetId` as
     * the destination. See docs/design/omnibox.md.
     */
    subject?: { cursorId: string | null; selectedIds: readonly string[] },
  ) => void
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
   * Derives cursor + column state from the visible lens (PaneSignals.visibleLens computed).
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

    // Use tree-based index when lens is available.
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

    // Derive cursor indices, columnId, card from tree (board mode) or flat cursor (detail mode).
    // Detail mode: metadata rows are focusable React components with __meta__ testIDs,
    // navigated by the view-navigation system. No virtual KNode derivation needed.
    let cursor: { colIndex: number; cardIndex: number; isAtCardLevel: boolean }
    let columnId: string | null
    let card: KNode | undefined
    let selectedNode: KNode | null

    const cc = locals.cursorCache
    if (board?.viewMode === "detail") {
      // Detail mode: flat cursor — every item (meta row or child node) is at card level.
      // No column-based derivation needed; cursor IS the cursorCardNodeId.
      const isMetaCursor = cursor_ ? (cursor_ as string).startsWith("__meta__") : false
      cursor = { colIndex: 0, cardIndex: 0, isAtCardLevel: !!cursor_ }
      columnId = null
      card = cursor_ && !isMetaCursor ? (s.repo.getNode(cursor_ as string) ?? undefined) : undefined
      selectedNode = card ?? (cursor_ ? ({ id: cursor_, content: cursor_ } as unknown as KNode) : null)
    } else {
      // Board mode: derive entirely from tree
      const treeColIds = rootId ? tree.children(rootId) : []
      if (cc && cc.cursorId === cursor_ && cc.nodeIndexRef === nodeIndex) {
        cursor = cc
      } else {
        cursor = deriveCursorIndices({ length: treeColIds.length }, cursor_, nodeIndex, (id) => s.repo.getNode(id))
      }
      columnId = treeColIds[cursor.colIndex] ?? null
      const treeCardIds = columnId ? tree.children(columnId) : []
      const cardNodeId = treeCardIds[cursor.cardIndex]
      card = cardNodeId ? (s.repo.getNode(cardNodeId) ?? undefined) : undefined
      selectedNode = card ?? (columnId ? s.repo.getNode(columnId) : null) ?? null
    }

    if (!cc || cc.cursorId !== cursor_ || cc.nodeIndexRef !== nodeIndex) {
      locals.cursorCache = {
        cursorId: cursor_,
        cursorCardNodeId: null,
        nodeIndexRef: nodeIndex,
        colIndex: cursor.colIndex,
        cardIndex: cursor.cardIndex,
        isAtCardLevel: cursor.isAtCardLevel,
      }
    }

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
      setSelection: (selection) => {
        dispatchSelection({ sel: s.sel }, selection)
      },
      rootId,
      rootPath: board?.rootPath ?? null,
      cursor: cursor_,
      cursorCardNodeId,
      foldDepths,
      collapsedNodes: board?.collapsedNodes ?? new Set(),
      stickyFolds: board?.stickyFolds ?? new Map(),
      moveState: board?.moveState ?? { active: false },
      ui: effectiveUI,
      columnId,
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
    setLastKey(lookupKeyName(key) ?? (input || "?"))

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
   *
   * Phase 6 (km-tui.omnibox-cursor): the omnibox executor builds
   * `CommandContext` from the invocation spec:
   *
   *   - `ctx.currentNodeId` / `ctx.selectedNodes` ← `subject` (frozen
   *     anchor-pane snapshot; the "subject" for binary verbs like move,
   *     add, add_link).
   *   - `ctx.targetId` ← `selectedArgumentId` resolved at confirm time
   *     (the "target" the user picked in the omnibox). Passed in by the
   *     `UnifiedOmniboxConnector.runSelection` path.
   *
   * Commands keep reading `ctx.currentNodeId` for the subject and
   * `ctx.targetId` for the destination — they never reach into
   * `OmniboxBaseState` directly. See docs/design/omnibox.md for the
   * rationale: binary verbs need both identities, so conflating them into
   * a single `currentCursor()` would lose the subject.
   */
  function dispatchCommandById(
    commandId: string,
    get: () => BoardAppStore,
    exitApp: () => void = () => {},
    targetId?: string,
    /**
     * Frozen anchor-pane subject for omnibox-dispatched commands. When
     * set: `ctx.currentNodeId` and `ctx.selectedNodes` read from this
     * snapshot. When absent (keybinding / chord path): they read from
     * the live focused pane.
     */
    subject?: { cursorId: string | null; selectedIds: readonly string[] },
  ): void {
    ensureCommandSystemInitialized()
    const ctx = buildOpCtx(get, exitApp)

    // Subject: omnibox-dispatched commands use the frozen spec snapshot;
    // keybinding-dispatched commands fall through to the live pane.
    const subjectNode = subject?.cursorId ? ctx.repo.getNode(subject.cursorId) : ctx.selectedNode
    const subjectId = subject ? subject.cursorId : (ctx.selectedNode?.id ?? null)
    const subjectSelectedIds = subject ? Array.from(subject.selectedIds) : Array.from(ctx.selectedIds)

    // Build command context for the executor
    const cmdCtx = {
      currentNode: subjectNode
        ? ({
            ...subjectNode,
            isTask: subjectNode.item?.task?.status != null,
            children: [],
            depth: 0,
            childCount: ctx.tree.children(subjectNode.id).length,
            childrenLoaded: true,
          } as import("@km/commands").TNode)
        : null,
      currentNodeId: subjectId,
      cursor: ctx.cursor,
      selectedNodes: subjectSelectedIds,
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

    // Chord cancelled (invalid second key or Escape) — ring bell; respect
    // which-key popup minimum display time so a too-fast cancel doesn't
    // flash the popup on/off (km-tui.chord-invalid-bell + which-key UX).
    if (result.chordCancelled) {
      parentSpan.spanData.outcome = "chord-cancelled"
      const elapsed = performance.now() - locals.pendingChordShownAt
      const minDisplayElapsed = elapsed >= WHICH_KEY_MIN_DISPLAY_MS
      if (locals.chordDismissTimer !== null) {
        clearTimeout(locals.chordDismissTimer)
        locals.chordDismissTimer = null
      }
      if (minDisplayElapsed) {
        ctx.setUI({ pendingChord: null, chordTimedOut: false, bellState: "chord-cancelled" })
      } else {
        // Keep pendingChord visible for the remainder of min display time,
        // then auto-dismiss. Bell fires immediately.
        ctx.setUI({ bellState: "chord-cancelled" })
        locals.chordDismissTimer = setTimeout(() => {
          locals.chordDismissTimer = null
          get().setUI({ pendingChord: null, chordTimedOut: false })
        }, WHICH_KEY_MIN_DISPLAY_MS - elapsed)
      }
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
        appendLastKey(` → ${result.commandId}`)
      }
    }

    // Phase 1.5: Chord state machine — pending/resolved/cancelled
    if (handleChordInput(result, ctx, get, exitApp, parentSpan) === "consumed") return

    // When a dialog is open, unhandled keys are expected (limited key set).
    // TODO(km-canonical): The dialog filter below could potentially be replaced
    // with withFocus() scoping, where dialog components create focus scopes
    // that intercept keys before they reach the board command system. This
    // would move dialog key filtering from imperative mode checks to
    // declarative focus tree structure.
    const dialogOpen = isDialogOpen()

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

      // When a dialog is open, only process dialog, filter, text, and find commands
      if (dialogOpen && result.commandId) {
        const isDialogOrTextCommand =
          result.commandId.startsWith("dialog.") ||
          result.commandId.startsWith("text.") ||
          result.commandId === "filter" ||
          result.commandId.startsWith("filter.") ||
          result.commandId.startsWith("favorites.") ||
          result.commandId.startsWith("find_") ||
          result.commandId.startsWith("search_replace.") ||
          result.commandId === "focus_next" ||
          result.commandId === "focus_prev"
        if (!isDialogOrTextCommand) {
          parentSpan.spanData.outcome = "dialog-filtered"
          return
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

      // km-tui.omnibox-recents: every successfully-dispatched command bumps
      // its MRU timestamp. This feeds `rankCommands(..., recencyBoost)` so
      // the palette surfaces recently-run commands first on empty query and
      // tie-breaks toward them on typed query.
      if (result.commandId) {
        getRecentsStore().touchCommand(result.commandId)
      }

      // Phase 3: Invariant checks — verify state consistency after mutations.
      // Fatal violations throw inside checkInvariants; recoverable ones are
      // returned and self-healed here (e.g. stale cursor on load after a
      // rename — km-tui.cursor-under-root-crash).
      {
        using _invariants = parentSpan.span("invariants")
        const freshCtx = buildOpCtx(get, exitApp)
        const violations = checkInvariants(freshCtx)
        if (violations.length > 0) {
          parentSpan.spanData.invariantViolations = violations.length

          // Sync-drift heal: sel-root / viewTree-root don't match the pane
          // rootId. syncPaneSignals (board-app-store.ts) is the primary sync
          // point after every dispatchBoard; this heal is a defense-in-depth
          // for paths that mutate pane.rootId outside dispatchBoard (or for
          // future code that forgets to call syncPaneSignals). Re-sync by
          // calling sel.root.set(rootId) — this propagates through signals
          // and rebuilds the ViewTree. See km-tui.sel-root-sync-crash and
          // km-tui.zoomin-atomic-sync.
          const needsSelRootSync = violations.some(
            (v) =>
              v.recoverable === true && (v.check === "sel-root-matches-rootId" || v.check === "viewTree-root-matches"),
          )
          if (needsSelRootSync && freshCtx.rootId) {
            freshCtx.sel.root.set(freshCtx.rootId as import("@silvery/selection").ID)
          }

          // Self-heal stale cursors by resetting to the first visible card
          // (or column, or rootId as last resort). Any recoverable violation
          // whose ids contain a "cursor" key is treated as a stale-cursor
          // symptom — cursor-under-root, cursor-visible, cursor-in-walkOrder,
          // cursor-in-columns, and any future cursor-consistency check that
          // gets marked recoverable. Generalized heuristic so new checks
          // don't need to be added here explicitly.
          const needsReset = violations.some((v) => v.recoverable === true && v.ids !== undefined && "cursor" in v.ids)
          if (needsReset && freshCtx.rootId) {
            // Find the first visible card via the current view tree (respects
            // filters/folds). Prefer a card. If NO column has any cards
            // (board is effectively empty), fall back to rootId — landing on
            // an empty column would immediately re-trip cardIndex-bounds.
            const VIRTUAL = ["__meta__", "__body__"]
            const isVirtual = (id: string): boolean => VIRTUAL.some((p) => id.startsWith(p))
            const rootId = freshCtx.rootId
            const colIds = freshCtx.tree.children(rootId).filter((id: string) => !isVirtual(id))
            let firstCard: string | undefined
            for (const colId of colIds) {
              const cardIds = freshCtx.tree.children(colId).filter((id: string) => !isVirtual(id))
              if (cardIds.length > 0) {
                firstCard = cardIds[0]
                break
              }
            }
            const target: string = firstCard ?? rootId
            freshCtx.setSelection(nodeSelect(target))
            freshCtx.setUI({
              status: {
                level: "warning",
                message: "Cursor reset: stale selection was outside the current board",
              },
            })
          }
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
      // data-view="item" = sub-block, data-view="card"/data-card-id = card wrapper,
      // data-view="column" = column, data-view="column-header" = the header band of a column,
      // data-view="top-bar" = the PaneBar chrome at the top of a pane,
      // data-view="view-mode-button" = the "CARDS VIEW CL:3" text in the top bar.
      let nodeId: string | null = null // First id found (may be sub-block)
      let idNode: AgNode | null = null
      let cardId: string | null = null // Card-level id (for border-click fallback)
      let firstIdIsColumn = false
      let clickedHeader = false // True if the hit chain passed through ColumnHeader
      let clickedTopBar = false // True if the hit chain passed through PaneBar top-bar chrome
      let clickedViewModeButton = false // True if the hit chain passed through the view-mode button
      let clickedInsideDialog = false // True if the hit chain passed through a dialog overlay
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
        const dv = props["data-view"]
        if (dv === "column-header") clickedHeader = true
        if (dv === "top-bar") clickedTopBar = true
        if (dv === "view-mode-button") clickedViewModeButton = true
        if (typeof props["data-dialog"] === "string") clickedInsideDialog = true
        if (colIndex === null && props["data-col-index"] != null) colIndex = Number(props["data-col-index"])
        if (typeof props.onClick === "function") hasClickHandler = true
        current = current.parent
      }
      // Column header click = no card ancestor found AND the click landed on
      // the ColumnHeader band (data-view="column-header"). A click on the
      // empty space below the last card hits the column box but NOT the
      // header — that should deselect (fall through to the !selectId branch),
      // not select the column.
      const isColumnNode = firstIdIsColumn && !cardId && clickedHeader
      // Selection priority:
      // 1. Sub-block nodeId (click on content inside card → j/k sub-block navigation)
      // 2. Card-level cardId (click on border → card selection, not column deselect)
      // 3. Column nodeId (click on column header → column-level, handled below)
      const selectId = nodeId && !firstIdIsColumn ? nodeId : (cardId ?? nodeId)

      const now = Date.now()
      const dx = Math.abs(mouse.x - locals.lastClick.x)
      const dy = Math.abs(mouse.y - locals.lastClick.y)
      // Double-click requires landing within the fuzz radius AND on the same
      // target node. Without the node match, two quick clicks on adjacent
      // sub-block rows (dy=1) get misidentified as a double-click and trigger
      // inline edit on the second row.
      const sameTarget = locals.lastClick.nodeId !== null && locals.lastClick.nodeId === selectId
      const isDoubleClick =
        now - locals.lastClick.time < DOUBLE_CLICK_MS &&
        dx <= DOUBLE_CLICK_DISTANCE &&
        dy <= DOUBLE_CLICK_DISTANCE &&
        sameTarget

      // Click outside an open dialog → close the topmost dialog.
      // Dialog overlays carry `data-dialog="..."`. If any dialog is open and
      // the click did NOT land inside a dialog element, dismiss it — same as
      // pressing Escape. This must be checked before any card/column selection
      // logic so the dismiss doesn't also produce a cursor move.
      if (!clickedInsideDialog) {
        const { ui } = opctx
        if (ui.showHelp) {
          opctx.setUI({ showHelp: false })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.omnibox) {
          popDialogMode()
          opctx.setUI({ omnibox: null })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.searchReplace) {
          opctx.setUI({ searchReplace: null })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.showSearchDialog) {
          popDialogMode()
          dialogTargetRef.current?.cancel()
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.showFilterDialog) {
          popDialogMode()
          opctx.setUI({ showFilterDialog: false })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.showNewItemDialog) {
          popDialogMode()
          opctx.setUI({ showNewItemDialog: false })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.deleteConfirm) {
          opctx.setUI({ deleteConfirm: null })
          // Phase 1 cutover: dual-write hide to plugin store.
          if (isTeaDeleteConfirmEnabled()) getDeleteConfirmStore().dispatch({ type: "deleteConfirm.hide" })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        if (ui.datePrompt) {
          popDialogMode()
          opctx.setUI({ datePrompt: null })
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
      }

      // Non-Ctrl clicks clear multi-selection (Ctrl-click extends it)
      if (!mouse.ctrl && opctx.selectedIds.size > 0) {
        clearSelection(opctx)
      }

      // Top-bar chrome clicks have priority over everything below. The view-mode
      // button specifically opens the filter/view dialog; the rest of the top
      // bar selects the board root so the user has a discoverable way to
      // "select the board" after a deselect. These must be checked BEFORE the
      // inline-edit click-handling and BEFORE the deselect branch so that
      // clicking the top bar never falls into cards/columns/empty-space logic.
      if (clickedViewModeButton) {
        // Exit any edit mode first so the dialog opens cleanly
        if (opctx.sel.text()) {
          activeEditTargetRef.current?.save()
          opctx.setSelection(NO_SELECTION)
        }
        handleKmOp(opctx, { type: "SHOW_FILTER_DIALOG" })
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
        return
      }
      if (clickedTopBar) {
        // Click on top-bar chrome (the breadcrumb / white area around it) →
        // select the board. This is the discoverable counterpart to
        // "click empty space → deselect" — after deselecting, the user needs
        // a visible target to re-enter "board level".
        if (opctx.sel.text()) {
          activeEditTargetRef.current?.save()
          opctx.setSelection(NO_SELECTION)
        }
        if (opctx.rootId) {
          opctx.setSelection(nodeSelect(opctx.rootId))
        }
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
        return
      }

      // When in inline edit mode, handle clicks differently:
      // - Inside same card → save + re-enter edit on clicked node
      // - Outside card → exit edit mode, proceed with normal click
      const edit = opctx.sel.text()
      if (edit && selectId && !isColumnNode) {
        const editCardId = opctx.cursorCardNodeId
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
            // Paired pattern collapsed: sel.text.edit already selects the node.
            activeEditTargetRef.current?.save()
            opctx.setSelection(textCaret(nodeId, 0))
            opctx.textEditHints = { blockIndex: 0, initialCursorPos: "start" }
          }
          locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
          return
        }
        // Different card → exit edit mode, fall through to normal click
        activeEditTargetRef.current?.save()
        opctx.setSelection(NO_SELECTION)
      }

      // Empty-space-in-column click: the click landed on a column box (no card
      // ancestor) but did NOT pass through the ColumnHeader band. This means
      // the user clicked the empty area below the last card. Treat the same
      // as clicking outside everything — deselect all, cursor to board root.
      const isEmptySpaceInColumn = firstIdIsColumn && !cardId && !clickedHeader

      if (!selectId || isEmptySpaceInColumn) {
        // Empty space click → truly deselect (cursor=null, sel.kind="idle").
        // Do NOT set cursor=rootId: the view treats rootId as "cursor
        // intentionally walked up to board level" and tints the entire
        // board (selection-style.ts rule 4). Empty-space clicks should
        // clear all selection and all highlighting. The empty-ids form
        // maps to sel.deselect() (full clear), not sel.text.deselect()
        // (which preserves the cursor) — see dispatchSelection comments.
        opctx.setSelection({ type: "node", ids: [] })
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
        return
      }

      // Double-click check must come BEFORE isColumnNode early return so that
      // double-clicking a column header enters inline edit (title-as-card behavior).
      if (isDoubleClick) {
        // Double-click → select and enter inline edit on the clicked node
        opctx.setSelection(nodeSelect(selectId))
        handleKmOp(opctx, { type: "ENTER_INLINE_EDIT", nodeId: nodeId ?? selectId, blockIndex: 0 })
        locals.lastClick = { time: 0, x: 0, y: 0, nodeId: null } // Reset to prevent triple-click triggering
        return
      }

      if (isColumnNode) {
        // Column header single click → select the column (not board root)
        opctx.setSelection(nodeSelect(selectId))
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
        return
      }

      // Interactive element (e.g. Link with onClick) + Cmd held — defer to
      // DOM event system. Cmd+click on a Link should open it, not select the card.
      // Uses lastModifierState because SGR mouse protocol has no Super/Cmd bit.
      if (hasClickHandler && lastModifierState.super) {
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
        return
      }

      if (mouse.ctrl) {
        // Tracked by km-tui.sel-reader-migration — the Selection union doesn't
        // directly express toggle without reading current ids first.
        // Ctrl-click → move cursor to card and toggle its selection
        opctx.sel.node.select([selectId as ID], true)
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
      } else {
        // Single click → select the card (not sub-block)
        opctx.setSelection(nodeSelect(selectId))
        locals.lastClick = { time: now, x: mouse.x, y: mouse.y, nodeId: selectId ?? null }
      }
      return
    }
  }

  return { handleKey, handleMouse, buildOpCtx, dispatchCommandById, triggerChordTimeout }
} // end createBoardAppHandlers

// =============================================================================
// Board App Locals — secondary export
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
  lastClick: { time: number; x: number; y: number; nodeId: string | null }
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
    lastClick: { time: 0, x: 0, y: 0, nodeId: null },
    dragState: null,
    emptyTree: null,
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Local type alias — works around loggily's `export *` not resolving via tsc bundler mode */
type SpanLogger = ReturnType<ReturnType<typeof createLogger>["span"]>

const perfLog = createLogger("km:perf")

/**
 * Debug namespace for resize + focus event tracing. Enable with:
 *   DEBUG=km:tui:resize DEBUG_LOG=/tmp/km-resize.log bun km view <path>
 *
 * Used to diagnose multi-phase layout shifts (e.g. cmux tab-switch-back
 * fires a burst of 2-3 SIGWINCH events as the PTY re-syncs). With the
 * term-provider-level coalescer in silvery, bursts should produce ONE
 * `term:resize` event carrying the final settled dimensions.
 */
const resizeDebug = createDebug("km:tui:resize")

/**
 * TODO(km-canonical): Migrate `createBoardApp` to pipe() composition. Currently uses
 * createApp() with an event handler map, which couples store creation and event wiring.
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
 */

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
  const columnCount = opctx.rootId ? opctx.tree.children(opctx.rootId).length : 0
  for (let ci = 0; ci < columnCount; ci++) {
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

// =============================================================================
// Default handlers — backward-compatible module-level exports
// =============================================================================

const defaultLocals = createBoardAppLocals()
const defaultHandlers = createBoardAppHandlers(defaultLocals)

export const handleKey = defaultHandlers.handleKey
export const handleMouse = defaultHandlers.handleMouse
export const dispatchCommandById = defaultHandlers.dispatchCommandById
export const __triggerChordTimeout = defaultHandlers.triggerChordTimeout
/**
 * Build an OpCtx from the current store state using the default handlers'
 * locals bag. Exposed so non-keypress callers (e.g. the UnifiedOmniboxConnector,
 * which needs a KeybindingContext at render time to filter commands through
 * `filterCommandsByAvailability`) can assemble the same context the keypress
 * path does. Non-keypress callers pass a no-op `exit` — they never need to
 * quit the app from a render-time projection.
 */
export const defaultBuildOpCtx = defaultHandlers.buildOpCtx
