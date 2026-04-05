/**
 * Command System Bridge
 *
 * Bridges the @km/commands system to the TUI.
 * Processes keyboard input through the command system and returns actions.
 */

import {
  initCommandSystem,
  processKey,
  buildKeybindingContext,
  buildContext,
  getChordState,
  handleChordTimeout,
  type KeyEvent,
  type KeyCommandResult,
  type TNode,
} from "@km/commands"
import { Tree } from "@km/tree"
import { ViewTree } from "@km/board"
import { detectTerminalCaps, activeEditTargetRef } from "@silvery/ag-react"
import type { OpCtx } from "../tui-context.ts"
import { isDetailPaneId } from "./board-types.ts"
import { CursorDepth } from "../state/cursor-depth.ts"
import { PaneUI } from "../state/ui-reducer.ts"
import { createLogger } from "loggily"
import { getModeStack } from "../dialog-guard.ts"

const log = createLogger("km:command-bridge")

/** Cached Kitty keyboard protocol detection (static — doesn't change at runtime).
 * In test environments, Kitty is disabled so bare y/d/p bindings work (tests don't
 * use real Kitty protocol sequences). */
const kittySupported = process.env.VITEST ? false : detectTerminalCaps().kittyKeyboard

let commandSystemInitialized = false
export function ensureCommandSystemInitialized(): void {
  if (commandSystemInitialized) return
  commandSystemInitialized = true
  initCommandSystem()
}

/** Build command and keybinding contexts from the current OpCtx */
function buildCommandContexts(ctx: OpCtx) {
  const { ui, selectedNode } = ctx

  // Compute TNode derived fields from KNode for the command system.
  // For embed nodes, resolve through embed_source to check if the target is a task,
  // so that task commands (x, Space) work on embeds pointing to tasks.
  const embedSource = selectedNode?.embed_source
  const nodeForCtx: TNode | null = selectedNode
    ? ({
        ...selectedNode,
        isTask:
          selectedNode.item?.task?.status != null ||
          (embedSource != null && ctx.repo.getNode(embedSource)?.item?.task?.status != null),
        children: [],
        depth: 0,
        childCount: 0,
        childrenLoaded: true,
      } as TNode)
    : null

  const dialogInput = PaneUI.isDialogInput(ui)

  const kbCtx = buildKeybindingContext({
    inMoveMode: ctx.moveState.active,
    inSearchMode: ui.showSearchDialog,
    inInputMode: dialogInput || ui.showFilterDialog,
    hasMultiSelection: ctx.selectedIds.size > 0,
    isInDetailPane: ctx.focusManager.activeScopeId !== null && isDetailPaneId(ctx.focusManager.activeScopeId),
    isInOutlineMode: CursorDepth.isOutline(
      CursorDepth.derive({
        cursorNodeId: ctx.cursor,
        cursorCardNodeId: ctx.cursorCardNodeId,
        cursorColumnNodeId: ctx.column?.node.id ?? null,
      }),
    ),
    currentNode: nodeForCtx,
    textInputFocused: PaneUI.isTextInputFocused(ui, ctx.sel.text() !== null),
    isInlineEditing: ctx.sel.text() !== null,
    searchDialogOpen: ui.showSearchDialog,
    itemPickerOpen: !!ui.activePicker,
    newItemDialogOpen: ui.showNewItemDialog,
    datePromptOpen: !!ui.datePrompt,
    filterDialogOpen: ui.showFilterDialog,
    helpOverlayOpen: ui.showHelp,
    deleteConfirmOpen: !!ui.deleteConfirm,
    consoleOpen: ui.showConsole,
    hasActiveToast: !!ctx.toastQueue.getLatest(),
    inputMode: getModeStack().current(),
    visualMode: false, // visual mode removed — sel handles multi-selection
    localFindActive: !!ui.localSearch,
    omniboxOpen: ui.showOmnibox,
    searchReplaceOpen: !!ui.searchReplace,
    favoritesDialogOpen: ui.showFavoritesDialog,
    favoritesKeySelected: ui.favoritesSelectedKey != null,
    hasKitty: kittySupported,
    inputType: ctx.sel.text() ? "textarea" : dialogInput ? "field" : undefined,
    editBlockIndex: ctx.textEditHints?.blockIndex,
    cursorAtStart() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() === 0 && t.getContent().length > 0 : false
    },
    cursorAtEnd() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() >= t.getContent().length : true
    },
    hasVisibleChildren() {
      const textSel = ctx.sel.text()
      if (!textSel) return false
      return ViewTree.hasVisibleItemChildren(ctx.repo, textSel.nodeId, ctx.viewIndex, ctx.foldDepths)
    },
    editDepth() {
      const textSel = ctx.sel.text()
      if (!textSel) {
        log.error?.("editDepth() called without text editing active")
        return "card" as const
      }
      const editNodeId = textSel.nodeId as string

      // Direct lookup in nodeIndex
      let entry = ctx.nodeIndex?.get(editNodeId)

      // If not found, walk up ancestors to find the containing card/column
      if (!entry && ctx.nodeIndex) {
        for (const ancestor of Tree.ancestors(ctx.repo, editNodeId)) {
          entry = ctx.nodeIndex.get(ancestor.id)
          if (entry) break
        }
      }

      if (!entry) {
        log.error?.(`editDepth(): editing node ${editNodeId} not found in nodeIndex`)
        return "card" as const
      }
      return entry.cardIndex < 0 ? ("column" as const) : ("card" as const)
    },
  })

  const { colIndex, cardIndex, columns } = ctx
  const column = columns[colIndex]

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    cursorNodeId: ctx.cursor,
    selectedNodes: Array.from(ctx.selectedIds),
    siblingCount: column?.cardNodes.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: ctx.moveState.active,
    foldDepths: ctx.foldDepths,
  })

  return { cmdCtx, kbCtx }
}

export function processKeyWithContext(input: string, key: KeyEvent, ctx: OpCtx): KeyCommandResult {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return processKey(input, key, cmdCtx, kbCtx)
}

/** Handle chord timeout — resolves the pending prefix as its standalone command */
export function processChordTimeout(ctx: OpCtx): KeyCommandResult | null {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return handleChordTimeout(cmdCtx, kbCtx)
}

/** Get the pending chord prefix (for status bar display) */
export function getPendingChord(): string | null {
  return getChordState().pending
}
