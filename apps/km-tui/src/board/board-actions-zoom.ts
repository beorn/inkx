/**
 * Board Action Handlers - Zoom Operations
 *
 * Handles zoom in/out and related navigation between board levels.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok, precondition } from "@km/commands"
import { isOutline, type KNode } from "@km/core"
import { clearSelection, saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "../tui-context.ts"

/**
 * After zoom, children become columns. Place cursor on the first card
 * in the first column, or the first meaningful body card.
 *
 * Body nodes (non-oi children before the first oi) need special handling:
 * - Meaningful body cards (with visible content) → cursor on first
 * - Filtered body nodes (HR, empty paragraphs) → skip to first structural column
 * Falls back to column header if the column is empty.
 */
function firstCardId(
  children: { id: string; type: string; content?: string }[],
  repo: ActionCtx["repo"],
): string | null {
  if (children.length === 0) return null

  // Split children into body (before first oi) and structural (oi).
  const firstOiIdx = children.findIndex((c) => isOutline(c.type))
  const bodyNodes = firstOiIdx === -1 ? children : firstOiIdx === 0 ? [] : children.slice(0, firstOiIdx)
  const structuralNodes = firstOiIdx === -1 ? [] : children.slice(firstOiIdx)

  // Try meaningful body card first (must have visible non-HTML content)
  const meaningfulBody = bodyNodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
  if (meaningfulBody.length > 0) {
    return meaningfulBody[0]?.id ?? null
  }

  // Fall back to first structural column's first card
  const firstCol = structuralNodes[0]
  if (!firstCol) return children[0]?.id ?? null // all body, none meaningful — best effort
  const colChildren = repo.getChildren(firstCol.id)
  return colChildren[0]?.id ?? firstCol.id
}

/**
 * Zoom out to parent level.
 * Handles detail pane, outline mode, and actual zoom operations.
 */
export function handleZoomOutwards(ctx: ActionCtx): ActionResult {
  const { ui, dispatchBoard } = ctx

  // Close overlays first
  if (ui.showDetailPane) {
    ctx.setUI({ showDetailPane: false })
    return ok()
  }
  if (ui.inOutlineMode) {
    ctx.setUI({ inOutlineMode: false, subIndex: 0 })
    clearSelection(ctx)
    return ok()
  }

  // Try actual zoom out (to parent of current root)
  if (ctx.rootId) {
    const currentRoot = ctx.repo.getNode(ctx.rootId)

    // Check if we're at repo root (parent_id is null)
    if (!currentRoot || currentRoot.parent_id === null) {
      // Can't zoom out from repo root — navigate to cursor's PARENT (not previous sibling)
      return navigateToParent(ctx)
    }

    // We have a parent - zoom out to it
    const parentNode = ctx.repo.getNode(currentRoot.parent_id)
    if (parentNode) {
      saveNavHistory(ctx)

      // Determine best cursor target after zoom out.
      // Visible nodes in zoomed-out view: children (columns) and grandchildren (cards) of parentNode.
      // Keep cursor on current node if it would be visible; otherwise use the column
      // the cursor was in (becomes a card); otherwise fall back to old root (becomes a column).
      const cursorNode = ctx.repo.getNode(ctx.cursorNodeId)
      const col = ctx.column
      let cursorTarget = ctx.rootId // fallback: old root (always a column)

      if (cursorNode) {
        const cursorParent = cursorNode.parent_id
        const cursorGrandparent = cursorParent ? ctx.repo.getNode(cursorParent)?.parent_id : null
        // Cursor is a child of new root (will be a column) — visible
        if (cursorParent === parentNode.id) {
          cursorTarget = ctx.cursorNodeId
        }
        // Cursor is a grandchild of new root (will be a card) — visible
        else if (cursorGrandparent === parentNode.id) {
          cursorTarget = ctx.cursorNodeId
        }
        // Cursor not directly visible — try the column it was in (becomes a card under old root)
        else if (col) {
          cursorTarget = col.node.id
        }
      }

      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: parentNode.id,
        cursorNodeId: cursorTarget,
      })
      clearSelection(ctx)
      return ok()
    }
  }

  // Can't zoom out — navigate to cursor's PARENT (not previous sibling)
  return navigateToParent(ctx)
}

/**
 * Navigate cursor to its tree parent within the current board.
 * Card → column header → board root → boundary.
 */
function navigateToParent(ctx: ActionCtx): ActionResult {
  const cursorNode = ctx.repo.getNode(ctx.cursorNodeId)
  if (!cursorNode?.parent_id) return boundary("up")

  // If cursor IS the root, we're at the top — boundary
  if (ctx.cursorNodeId === ctx.rootId) return boundary("up")

  // If cursor's parent is the root, navigate to board level
  if (cursorNode.parent_id === ctx.rootId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.rootId })
    return ok()
  }

  // Navigate to parent node (e.g., card → column header)
  const parentNode = ctx.repo.getNode(cursorNode.parent_id)
  if (!parentNode) return boundary("up")

  ctx.dispatchBoard({ type: "SELECT", nodeId: parentNode.id })
  return ok()
}

/**
 * Zoom into the selected card.
 */
export function handleZoomIn(ctx: ActionCtx): ActionResult {
  const { dispatchBoard } = ctx
  const col = ctx.column
  const card = ctx.card

  // Support zoom at both card and column level
  const nodeId = card?.node.id ?? col?.node.id
  if (!nodeId) return precondition("card")

  // If node has no children, return boundary.
  const children = ctx.repo.getChildren(nodeId)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
  saveNavHistory(ctx)

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId,
    cursorNodeId: firstCardId(children, ctx.repo),
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Zoom into a specific node by ID (works for both cards and columns)
 */
export function handleZoomInNode(ctx: ActionCtx, nodeId: string): ActionResult {
  const { dispatchBoard } = ctx

  // If node has no children, return boundary.
  const children = ctx.repo.getChildren(nodeId)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
  saveNavHistory(ctx)

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId,
    cursorNodeId: firstCardId(children, ctx.repo),
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Follow an embedded link: zoom to the link target in context.
 *
 * Walks up from the target to find the best board root for maximum context:
 * - Great-grandparent (3 up): grandparent is a column, parent is a card, target is a sub-item
 * - Grandparent (2 up): parent is a column, target is a card
 * - Parent (1 up): target is a column header (minimal context)
 *
 * Stops walking at repo root (parent_id === null).
 */
export function handleFollowLink(ctx: ActionCtx): ActionResult {
  const { dispatchBoard } = ctx
  const card = ctx.card
  // Read link_to fresh from the repo — the cached layout may have stale null
  // values if background link resolution completed after layout was derived.
  const freshNode = card ? ctx.repo.getNode(card.node.id) : null
  const linkTo = freshNode?.link_to ?? card?.node.link_to
  if (!linkTo) return boundary("follow_link", "not an embed")

  const target = ctx.repo.getNode(linkTo)
  if (!target) return boundary("follow_link", "target not found")

  // Walk up to 3 levels from target to find the best board root
  let rootId = target.parent_id
  if (!rootId) return boundary("follow_link", "target has no parent")

  for (let i = 0; i < 2; i++) {
    const node = ctx.repo.getNode(rootId)
    if (!node?.parent_id) break // at repo root, stop
    rootId = node.parent_id
  }

  saveNavHistory(ctx)

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: rootId,
    cursorNodeId: target.id,
  })

  clearSelection(ctx)

  // If target is a sub-item (3+ levels below root), enter outline mode
  // so the cursor points at the specific sub-item within its parent card.
  if (target.parent_id) {
    const targetParent = ctx.repo.getNode(target.parent_id)
    if (targetParent?.parent_id && targetParent.parent_id !== rootId) {
      // target is inside a card — find its position in parent's children
      const cardChildren = ctx.repo.getChildren(target.parent_id)
      const subIndex = cardChildren.findIndex((c) => c.id === target.id) + 1
      if (subIndex > 0) {
        ctx.setUI({ inOutlineMode: true, subIndex })
      }
    }
  }

  return ok()
}

/**
 * Zoom inwards - handles outline mode sub-selection or standard zoom.
 */
export function handleZoomInwards(ctx: ActionCtx): ActionResult {
  const { ui, dispatchBoard } = ctx
  const col = ctx.column
  const card = ctx.card

  // If at column level (no card selected), zoom into the column directly
  if (!card) {
    if (!col) return precondition("card")
    return handleZoomInNode(ctx, col.node.id)
  }

  // If we're in outline mode with a sub-selection, zoom to that child
  if (ui.inOutlineMode && ui.subIndex > 0) {
    const flatChildren: { node: KNode; depth: number }[] = []

    // Build flat list of visible descendants
    function collectVisible(nodeId: string, depth: number, maxDepth: number): void {
      if (depth > maxDepth) return
      const nodeChildren = ctx.repo.getChildren(nodeId)
      for (const child of nodeChildren) {
        flatChildren.push({ node: child, depth })
        if (!ctx.foldedNodes.has(child.id)) {
          collectVisible(child.id, depth + 1, maxDepth)
        }
      }
    }

    collectVisible(card.node.id, 1, ui.maxOutlineDepth)

    const targetChild = flatChildren[ui.subIndex - 1]
    if (targetChild?.node) {
      // Save state and zoom to child
      saveNavHistory(ctx)

      ctx.setUI({ inOutlineMode: false, subIndex: 0 })

      const targetChildChildren = ctx.repo.getChildren(targetChild.node.id)
      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: targetChild.node.id,
        cursorNodeId: firstCardId(targetChildChildren, ctx.repo),
      })

      clearSelection(ctx)
      return ok()
    }
  }

  // Zoom one level inward toward the cursor node.
  // If cursor is a leaf (no children), there's nothing to zoom into.
  const cursorId = card.node.id
  if (ctx.repo.getChildren(cursorId).length === 0) {
    return boundary("in", "no children")
  }

  // Walk up from cursor to find the child of root on the path.
  const rootId = ctx.rootId

  // Find the child of current root that is an ancestor of (or is) the cursor
  let target = cursorId
  let node = ctx.repo.getNode(target)
  while (node && node.parent_id && node.parent_id !== rootId) {
    target = node.parent_id
    node = ctx.repo.getNode(target)
  }

  if (!node) {
    // Cursor isn't a descendant of root — shouldn't happen, fall back
    return handleZoomIn(ctx)
  }

  // target is now the child of root on the path to cursor.
  const children = ctx.repo.getChildren(target)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  saveNavHistory(ctx)

  // Keep the cursor on the current card (cursorId) instead of jumping
  // to firstCardId. The user pressed 'i' while looking at a specific
  // card — zooming closer should preserve that focus.
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: target,
    cursorNodeId: cursorId,
  })

  clearSelection(ctx)
  return ok()
}
