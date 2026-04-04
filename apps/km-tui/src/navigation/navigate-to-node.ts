/**
 * Navigate To Node — Unified zoom/select logic for reaching any node.
 *
 * Pure function (no React hooks, no store dependency). Given a target node ID
 * and a current root, determines whether to SELECT (target already visible) or
 * ZOOM_IN (target is deeper and requires zooming to an ancestor).
 *
 * Board model: root -> columns (depth 1) -> cards (depth 2).
 * A target is "visible" if it's a child or grandchild of the current root.
 */

import { KNode } from "@km/core"
import { createLogger } from "loggily"

const log = createLogger("km:tui:navigate")

// =============================================================================
// Types
// =============================================================================

/** Minimal repo interface — only what navigateToNode needs. */
export interface NavigateRepo {
  getNode(id: string): KNode | null
  getChildren(id: string | null): KNode[]
}

export type NavigateOp = "SELECT" | "ZOOM_IN" | "DETAIL_VIEW"

export interface NavigateResult {
  action: NavigateOp
  /** Node ID to zoom into (only set when action is ZOOM_IN) */
  zoomTarget?: string
  /** Node ID to place cursor on */
  cursorTarget: string
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Determine how to navigate to a target node from the current root.
 *
 * @param targetId - The node to navigate to.
 * @param rootId   - The current board root (null if at the top level).
 * @param repo     - Repo providing getNode/getChildren.
 * @returns NavigateResult describing the action to take.
 */
export function navigateToNode(targetId: string, rootId: string | null, repo: NavigateRepo): NavigateResult | null {
  const target = repo.getNode(targetId)
  if (!target) {
    log.error?.(`navigateToNode: node not found: ${targetId}`)
    return null
  }

  // If target IS the current root, nothing to do
  if (target.id === rootId) {
    log.debug?.(`navigateToNode: target is current root`)
    return { action: "SELECT", cursorTarget: target.id }
  }

  // Check if target is already visible at the current zoom level.
  // Board model: root > columns (depth 1) > cards (depth 2).
  const targetParentId = target.parent_id
  const targetParent = targetParentId ? repo.getNode(targetParentId) : null
  const targetGrandparentId = targetParent?.parent_id ?? null

  // Case 1: Target is a direct child of root (column level)
  if (targetParentId === rootId) {
    log.debug?.(`navigateToNode: SELECT column=${target.id.slice(-8)} (child of root)`)
    return { action: "SELECT", cursorTarget: target.id }
  }

  // Case 2: Target is a grandchild of root (card level)
  if (targetGrandparentId === rootId) {
    log.debug?.(`navigateToNode: SELECT card=${target.id.slice(-8)} (grandchild of root)`)
    return { action: "SELECT", cursorTarget: target.id }
  }

  // Case 3: Target is deeper — need to zoom.
  // Walk the ancestor chain to determine the best zoom level.
  const { zoomTarget, cursorTarget } = resolveZoomTarget(target, repo)

  // If the zoom target would produce a flat list (no oi children = single body
  // column with only leaf cards), open the detail panel for the cursor target
  // instead of landing on a visually unhelpful flat board.
  // We still zoom so the node becomes visible, but signal the caller to also
  // open the detail pane.
  const zoomChildren = repo.getChildren(zoomTarget)
  const hasStructure = zoomChildren.some((c) => KNode.isOutline(c))
  if (!hasStructure) {
    log.debug?.(
      `navigateToNode: DETAIL_VIEW for ${cursorTarget.slice(-8)} (zoom target ${zoomTarget.slice(-8)} is flat)`,
    )
    return {
      action: "DETAIL_VIEW",
      zoomTarget,
      cursorTarget,
    }
  }

  log.debug?.(`navigateToNode: ZOOM_IN to ${zoomTarget.slice(-8)}, cursor on ${cursorTarget.slice(-8)}`)

  return {
    action: "ZOOM_IN",
    zoomTarget,
    cursorTarget,
  }
}

// =============================================================================
// Zoom Target Resolution (extracted from use-board-dialogs.ts)
// =============================================================================

/**
 * Find appropriate zoom and cursor targets for a node.
 * Walks up the ancestor chain to find the grandparent that makes the target
 * visible as a card (depth 2 from the new root).
 *
 * Board model: root -> children = columns -> their children = cards.
 * So for target to be a card, its grandparent must be the board root.
 *
 * This is the pure zoom computation — it does NOT check visibility at the
 * current root. Use navigateToNode() for the full navigate-or-zoom logic.
 */
export function resolveZoomTarget(target: KNode, repo: NavigateRepo): { zoomTarget: string; cursorTarget: string } {
  // Build ancestor chain: [target, parent, grandparent, ...]
  const ancestors: KNode[] = [target]
  let ancestor: KNode | null = target
  for (let i = 0; i < 100 && ancestor?.parent_id; i++) {
    const parent = repo.getNode(ancestor.parent_id)
    if (parent) ancestors.push(parent)
    ancestor = parent
  }
  log.debug?.(`navigate: ancestor chain has ${ancestors.length} nodes: ${ancestors.map((n) => n.type).join(" > ")}`)

  const [, parent, grandparent, greatGrandparent] = ancestors

  // Best case: zoom to grandparent so target is a card (depth 2)
  // root=grandparent -> parent is column -> target is card
  if (grandparent) {
    let cursorTarget = target

    // If the zoom target has no oi children, it will produce a body-only board.
    const zoomChildren = repo.getChildren(grandparent.id)
    const hasOiChildren = zoomChildren.some((c) => KNode.isOutline(c))
    if (!hasOiChildren && parent && parent.parent_id === grandparent.id) {
      // Grandparent is a body-only board (no oi children).
      // If there's a great-grandparent, zoom there instead so grandparent
      // becomes a column and parent becomes a visible card — avoids landing
      // on a single-column flat list with many cards.
      if (greatGrandparent) {
        log.debug?.(
          `navigate: body-only grandparent, zooming to great-grandparent=${greatGrandparent.id.slice(-8)}, cursor on ${parent.id.slice(-8)}`,
        )
        return { zoomTarget: greatGrandparent.id, cursorTarget: parent.id }
      }
      // No great-grandparent available — walk cursor up to the body card level
      log.debug?.(`navigate: body-only board, walking cursor from ${target.id.slice(-8)} up to ${parent.id.slice(-8)}`)
      cursorTarget = parent
    }

    log.debug?.(`navigate: ZOOM to grandparent=${grandparent.id.slice(-8)}, cursor on ${cursorTarget.id.slice(-8)}`)
    return { zoomTarget: grandparent.id, cursorTarget: cursorTarget.id }
  }

  // Only parent exists: zoom to parent, target becomes a column (depth 1)
  if (parent) {
    log.debug?.(`navigate: ZOOM to parent=${parent.id.slice(-8)}, cursor on target=${target.id.slice(-8)}`)
    return { zoomTarget: parent.id, cursorTarget: target.id }
  }

  // Target is a root node — zoom to it directly
  log.debug?.(`navigate: ZOOM to target itself`)
  return { zoomTarget: target.id, cursorTarget: target.id }
}
