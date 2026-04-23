/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import { CARD_REMAINING_DEPTH } from "@km/board"
import type { OpResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { KNode, isOk } from "@km/core"
import { extractBody } from "@km/tree"
import { clearSelection } from "./board-selection-helpers.ts"
import { saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import { handleTreeNavigation, isTreeDirection, type TreeDirection } from "../handlers/navigation-handlers.ts"
import { indexOfChild } from "../navigation/sibling-index.ts"
import { detailPaneIdFor } from "./board-types.ts"
import type { OpCtx } from "../tui-context.ts"
import { type NavState } from "../navigation/view-navigation.ts"
import {
  applyBlockNav,
  applyOutlineNav,
  applyPageJump,
  createBoardNavState,
  type BoardNavState,
} from "./board-reducer.ts"
import { runBoardEffects } from "./board-effect-runner.ts"
import type { ViewTreeProjection } from "@km/board"
import { nodeSelect } from "../state/selection.ts"

/** Collect all visible descendant IDs from ViewTree (lens handles fold + status filter). */
function collectTreeDescendants(tree: ViewTreeProjection, rootId: string): string[] {
  const result: string[] = [rootId]
  for (const childId of tree.children(rootId)) {
    result.push(...collectTreeDescendants(tree, childId))
  }
  return result
}

/**
 * Handle cursor movement in any direction.
 *
 * Dispatches to per-mode handlers: outline, selection, horizontal,
 * vertical (hierarchical), and tree-based navigation.
 */
export function handleCursorMove(ctx: OpCtx, dir: string): OpResult {
  const { ui } = ctx
  const prevCursor = ctx.cursor

  // No cursor (deselected state): place cursor at the default location —
  // first card in the first column. Only for vertical/block navigation;
  // left/right must fall through to handleHorizontalNav which handles
  // pane switching (detail pane → board) even with null cursor.
  if (!ctx.cursor && dir !== "left" && dir !== "right") {
    const colIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
    for (const colId of colIds) {
      const cardIds = ctx.tree.children(colId)
      if (cardIds.length > 0) {
        ctx.setSelection(nodeSelect(cardIds[0]!))
        return ok()
      }
    }
    return boundary(dir)
  }

  // Outline mode sub-item navigation (when cursor is inside a card's descendants)
  const inOutlineMode = ctx.cursor !== null && ctx.card !== undefined && ctx.cursor !== ctx.card.id
  if (inOutlineMode && (dir === "prev" || dir === "next")) {
    return handleOutlineNav(ctx, dir, ctx.card)
  }

  // Reset scroll anchor so viewport snaps back to follow cursor
  if (ui.columnScrollAnchor !== null) {
    ctx.setUI({ columnScrollAnchor: null })
  }

  // Non-shift cursor moves clear multi-selection (Shift+movement extends it
  // via separate extend_select_* commands that don't go through handleCursorMove).
  // size > 1: only clear when multiple nodes are selected. Single selection (size 1)
  // is just the cursor — clearing it would leave cursor null if navigation returns
  // boundary. Before @silvery/selection this was `ui.multiSelected.size > 0`.
  if (ctx.selectedIds.size > 1) {
    clearSelection(ctx)
  }

  let result: OpResult

  // Horizontal (h/l) — preserves stickyY across columns, clears stickyX
  if (dir === "left" || dir === "right") {
    result = handleHorizontalNav(ctx, dir)
    ctx.navigator.clearStickyX()
  } else if (dir === "up" || dir === "down") {
    // Hierarchical vertical (up/down) — clears stickyY so h/l will lazy-capture
    result = handleVerticalNav(ctx, dir)
    ctx.navigator.clearStickyY()
  } else if (dir === "in" || dir === "out") {
    // Spatial block navigation (in/out) — J/K move to next/prev visible block in column
    result = handleBlockNav(ctx, dir)
    ctx.navigator.clearStickyY()
  } else {
    // Tree navigation (first, last, prev, next)
    result = handleTreeNav(ctx, dir)
    ctx.navigator.clearStickyY()
  }

  // Sync detail pane when cursor moved and a detail pane exists.
  // Navigation handlers call setSelection() directly (bypassing dispatchBoard("SELECT")),
  // so the detail pane sync in dispatchBoard never runs. Dispatch SELECT to trigger it.
  if (isOk(result) && ctx.hasDetailPane) {
    const newCursor = ctx.sel.node.cursor() as string | null
    if (newCursor && newCursor !== prevCursor) {
      ctx.dispatchBoard({ type: "SELECT", nodeId: newCursor })
    }
  }

  return result
}

/**
 * Outline mode prev/next sub-item navigation using ViewTree.
 *
 * Uses the ViewTree (which drives rendering) so navigation exactly matches what
 * the user sees on screen. Hidden/collapsed nodes are already pruned from ViewTree
 * at construction time — same approach as ViewTree.nodes() for spatial nav.
 */
function handleOutlineNav(ctx: OpCtx, dir: "prev" | "next", card: KNode | undefined): OpResult {
  if (!card || !ctx.cursor) return boundary(dir)

  // Walk visible descendants via ViewTree (lens already filters by task status)
  const descendantIds = collectTreeDescendants(ctx.tree, card.id)
  const navState = extractNavState(ctx)
  const result = applyOutlineNav(navState, dir, descendantIds)

  if (result.effects.length === 0) return boundary(dir)

  runBoardEffects(ctx, result)

  // Auto-unfold if cursor landed beyond the card's render depth
  const targetId = result.state.cursor
  if (targetId) {
    ensureCursorVisible(ctx, targetId)
  }

  return ok()
}

/** Horizontal (h/l) cross-column navigation with stickyY. */
function handleHorizontalNav(ctx: OpCtx, dir: "left" | "right"): OpResult {
  const { ui, navigator, viewNavigation } = ctx
  const isDetailPane = ctx.focusedPaneViewType() === "detail"

  // Detail pane boundary: h always exits to parent board, l at right edge enters detail.
  // Must run before within-pane navigation — the detail pane is a single virtual column,
  // so within-pane h would just select the column header instead of exiting.
  if (dir === "left" && isDetailPane) {
    const parentPaneId = ctx.getParentPaneId?.()
    if (parentPaneId) {
      ctx.focusPaneById(parentPaneId)
      ctx.syncFocusScope()
      return ok()
    }
  }

  // When at leftmost card pressing h, position at column header instead of moving columns
  if (dir === "left" && ctx.colIndex === 0 && ctx.isAtCardLevel && ctx.columnId) {
    ctx.setSelection(nodeSelect(ctx.columnId))
    navigator.clearStickyY()
    return ok()
  }

  // Lazy capture: if stickyY not yet set, capture from current card by nodeId.
  // At h/l time, the focused card is always rendered (no dispatch has happened yet).
  // j/k clears stickyY; subsequent h/l preserves it.
  if (navigator.stickyY === null && ctx.isAtCardLevel) {
    const midY = navigator.getItemMidY(ctx.colIndex, ctx.cardIndex)
    if (midY > 0) {
      navigator.setStickyY(midY)
    }
    // If card not yet measured, stickyY stays null — navigateHorizontal
    // falls back to first card in target column.
  }

  // Use ViewNavigation for the core navigation logic
  if (ctx.cursor) {
    const targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, navigator)

    if (targetId !== null) {
      // Pass cursorCardNodeId hint for symlink-aware card classification.
      // When navigating within a symlink's children, the data model parent
      // chain leads to the wrong card — the hint ensures the visual card is used.
      ctx.setSelection(nodeSelect(targetId))
      // In cards view, attach deferred resolve for off-screen Y-correction.
      // register() will fire it during silvery's Phase 2.7.
      if (ui.viewMode === "cards") {
        // Find the column that contains targetId for deferred resolution.
        // Body cards need special handling: their parent_id is the root,
        // but repo.getChildren(root) includes both body nodes and structural
        // columns. We must filter to meaningful body nodes only so the
        // itemIndex from findItemAtY maps to the correct node.
        const targetNode = ctx.repo.getNode(targetId)
        const columnId = targetNode?.parent_id
        const isBodyCard = columnId === ctx.rootId && targetNode && !KNode.isOutline(targetNode)
        navigator.setDeferredResolve((itemIndex) => {
          if (columnId) {
            let children: { id: string; type: string; content?: string }[]
            if (isBodyCard) {
              const allChildren = ctx.repo.getChildren(columnId)
              const { body } = extractBody(allChildren)
              children = body.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
            } else {
              children = ctx.repo.getChildren(columnId)
            }
            const child = children[itemIndex]
            if (child) {
              ctx.setSelection(nodeSelect(child.id))
            }
          }
        })
      }
      // Prefetch adjacent column children for smooth navigation
      const prefetchRootId = ctx.rootId
      const prefetchColId = ctx.repo.getNode(targetId)?.parent_id
      if (prefetchRootId && prefetchColId) {
        setTimeout(() => {
          const cols = ctx.repo.getChildren(prefetchRootId)
          const targetColIdx = cols.findIndex((c) => c.id === prefetchColId)
          const prev = targetColIdx > 0 ? cols[targetColIdx - 1] : undefined
          const next = targetColIdx < cols.length - 1 ? cols[targetColIdx + 1] : undefined
          if (prev) ctx.repo.getChildren(prev.id)
          if (next) ctx.repo.getChildren(next.id)
        })
      }
      return ok()
    }
  }

  // At the right boundary, navigate into the detail pane if it exists as a workspace pane.
  if (dir === "right" && ctx.hasDetailPane && !isDetailPane) {
    const detailPane = detailPaneIdFor(ctx.focusedPaneId())
    ctx.focusPaneById(detailPane)
    ctx.syncFocusScope()
    return ok()
  }

  // Boundary: clear stickyY so it doesn't pollute the next h/l navigation.
  // Without this, lazy capture or a prior successful h/l leaves a stale stickyY
  // that would skip fresh capture on the next h/l press.
  navigator.clearStickyY()
  return boundary(dir)
}

/** Hierarchical vertical navigation (j/k up/down). */
function handleVerticalNav(ctx: OpCtx, dir: "up" | "down"): OpResult {
  const { navigator, viewNavigation } = ctx

  if (!ctx.cursor) {
    return boundary(dir, "no cursor")
  }

  const targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, navigator)
  if (targetId === null) return boundary(dir)

  ctx.setSelection(nodeSelect(targetId))
  return ok()
}

/**
 * Spatial block navigation (J/K — next/previous visible block in column).
 *
 * Unlike j/k which navigate the tree hierarchy (siblings, parent, children),
 * J/K are purely spatial: they move to the next/previous visible block in
 * document order within the current column — like arrow keys in a text editor.
 *
 * The visible block list is: [column header, card1, card1-child1, card1-child2, ..., card2, ...]
 * J moves forward (+1), K moves backward (-1). Bell at boundaries.
 * Key invariant: J and K are strict inverses.
 */
function handleBlockNav(ctx: OpCtx, dir: "in" | "out"): OpResult {
  if (!ctx.cursor) {
    return boundary(dir, "no cursor")
  }

  // Build flat list of all visible blocks in the current column.
  // `into`: skip folded subtrees (foldDepths === 0) AND task-filtered subtrees.
  //   A done parent's children are invisible even if they're todo — don't descend.
  // `match`: exclude the filtered node itself from the navigable list.
  // Walk visible descendants via ViewTree (lens filters by task status + fold depth)
  const blocks = ctx.columnId ? collectTreeDescendants(ctx.tree, ctx.columnId) : []
  if (blocks.length === 0) return boundary(dir, "no visible blocks")

  const navState = extractNavState(ctx)
  const blockDir = dir === "in" ? "down" : "up"
  const result = applyBlockNav(navState, blockDir, blocks)

  if (result.effects.length === 0) {
    // Check if cursor wasn't found vs at boundary
    if (blocks.indexOf(ctx.cursor as string) < 0) return boundary(dir, "cursor not in column blocks")
    return boundary(dir)
  }

  runBoardEffects(ctx, result)

  // Auto-unfold: if cursor landed on a node beyond the card's render depth,
  // increase the card's fold depth so the cursor target becomes visible.
  const targetId = result.state.cursor
  if (targetId) {
    ensureCursorVisible(ctx, targetId)
  }

  return ok()
}

/**
 * Ensure a cursor target is visible by auto-unfolding its containing card.
 *
 * When block navigation moves the cursor to a deeply nested node (beyond
 * CARD_REMAINING_DEPTH), the node won't be rendered because its ancestors
 * are displayed as FoldedChildRow. Fix: bump the card's fold depth to
 * reveal the target.
 */
function ensureCursorVisible(ctx: OpCtx, targetId: string): void {
  if (!ctx.tree.node(targetId)) return

  // Walk up via ViewTreeProjection to find the card ancestor and measure depth
  let depth = 0
  let currentId: string | null = targetId
  let cardNodeId: string | null = null
  while (currentId) {
    const projected = ctx.tree.getProjected(currentId)
    if (projected?.viewType() === "card") {
      cardNodeId = currentId
      break
    }
    depth++
    currentId = ctx.tree.parent(currentId)
  }
  if (!cardNodeId || depth === 0) return

  // Check if the target is beyond the effective render depth for this card
  const cardFoldOverride = ctx.foldDepths.get(cardNodeId)
  const effectiveDepth = cardFoldOverride ?? CARD_REMAINING_DEPTH
  if (depth <= effectiveDepth) return

  // Set fold depth on the card to reveal the target
  const newDepths = new Map(ctx.foldDepths)
  newDepths.set(cardNodeId, depth)
  ctx.setFoldDepths(newDepths)
}

/** Default tree navigation (first, last, prev, next). */
function handleTreeNav(ctx: OpCtx, dir: string): OpResult {
  const treeDir: TreeDirection = isTreeDirection(dir) ? dir : "next"
  const targetId = handleTreeNavigation(treeDir, ctx, ctx.repo)
  if (targetId && targetId !== ctx.cursor) {
    ctx.setSelection(nodeSelect(targetId))
    return ok()
  }
  return boundary(dir)
}

/**
 * Navigate back in history.
 */
export function handleNavBack(ctx: OpCtx): OpResult {
  return navigateHistory(ctx, -1)
}

/**
 * Navigate forward in history.
 */
export function handleNavForward(ctx: OpCtx): OpResult {
  return navigateHistory(ctx, 1)
}

function navigateHistory(ctx: OpCtx, delta: -1 | 1): OpResult {
  const { ui, dispatchBoard } = ctx
  const newIndex = ui.navHistoryIndex + delta

  if (newIndex < 0) return boundary("back", "no history")
  if (newIndex >= ui.navHistory.length) return boundary("forward", "at end of history")

  const entry = ui.navHistory[newIndex]
  if (!entry) return ok()

  ctx.setUI({ navHistoryIndex: newIndex })

  dispatchBoard({ type: "ZOOM_IN", nodeId: entry.rootId || null })
  const entryCursor = entry.cursor || null
  if (entryCursor) ctx.setSelection(nodeSelect(entryCursor))

  // Clear selection on nav restore
  clearSelection(ctx)

  if (entry.foldDepths) {
    ctx.setFoldDepths(entry.foldDepths)
  }

  return ok()
}

/**
 * Navigate to sibling board.
 */
export function handleNavSiblingBoard(ctx: OpCtx, direction: "next" | "prev"): OpResult {
  const { dispatchBoard } = ctx

  if (!ctx.rootId) {
    return boundary(direction, "no root")
  }

  const currentRoot = ctx.repo.getNode(ctx.rootId)
  if (!currentRoot?.parent_id) {
    return boundary(direction, "no parent")
  }

  const siblings = ctx.repo.getChildren(currentRoot.parent_id)
  const currentIdx = indexOfChild(siblings, currentRoot.id)

  if (currentIdx < 0) return ok()

  const targetIdx =
    direction === "next" ? (currentIdx + 1) % siblings.length : (currentIdx - 1 + siblings.length) % siblings.length

  const targetSibling = siblings[targetIdx]
  if (!targetSibling || targetSibling.id === currentRoot.id) return ok()

  saveNavHistory(ctx)

  // Navigate to sibling
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: targetSibling.id,
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Page jump up or down.
 */
export function handlePageJump(ctx: OpCtx, direction: "up" | "down"): void {
  const { ui } = ctx
  if (!ctx.columnId) return

  const pageSize = Math.max(5, Math.floor((ui.dimensions.rows - 4) / 2))
  const cardIds = [...ctx.tree.children(ctx.columnId)]
  const navState = extractNavState(ctx)
  const result = applyPageJump(navState, direction, cardIds, ctx.cardIndex, pageSize)

  runBoardEffects(ctx, result)
}

/** Build NavState from action context. Caller must guard that cursor is non-null. */
export function navStateFrom(ctx: OpCtx): NavState {
  if (!ctx.cursor) {
    throw new Error("[nav] navStateFrom: cursor is null")
  }
  return {
    cursor: ctx.cursor,
    rootId: ctx.rootId,
    foldDepths: ctx.foldDepths,
    collapsedNodes: ctx.collapsedNodes,
    cursorCardNodeId: ctx.cursorCardNodeId,
    tree: ctx.tree,
  }
}

/** Extract BoardNavState from OpCtx for pure reducer functions. */
function extractNavState(ctx: OpCtx): BoardNavState {
  return createBoardNavState({
    cursor: ctx.cursor,
    cursorCardNodeId: ctx.cursorCardNodeId,
    foldDepths: ctx.foldDepths,
    collapsedNodes: ctx.collapsedNodes,
    rootId: ctx.rootId,
    columnScrollAnchor: ctx.ui.columnScrollAnchor,
  })
}
