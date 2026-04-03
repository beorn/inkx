/**
 * Layout Tree Helpers (Pure Functions)
 *
 * Operations on the LayoutNode tree: splitting, removing, navigating,
 * resizing, equalizing, and swapping leaf panes.
 */

import type { LayoutNode } from "./board/board-types.ts"

// =============================================================================
// Layout Tree Helpers (Pure Functions)
// =============================================================================

/** Split a leaf in the layout tree, creating a new split node */
export function splitLayoutNode(
  layout: LayoutNode,
  targetPaneId: string,
  direction: "h" | "v",
  newPaneId: string,
  ratio = 0.5,
): LayoutNode {
  if (layout.type === "leaf") {
    if (layout.paneId === targetPaneId) {
      return {
        type: "split",
        direction,
        ratio,
        left: { type: "leaf", paneId: targetPaneId },
        right: { type: "leaf", paneId: newPaneId },
      }
    }
    return layout
  }

  const newLeft = splitLayoutNode(layout.left, targetPaneId, direction, newPaneId, ratio)
  const newRight = splitLayoutNode(layout.right, targetPaneId, direction, newPaneId, ratio)

  if (newLeft === layout.left && newRight === layout.right) return layout

  return { ...layout, left: newLeft, right: newRight }
}

/** Remove a pane from the layout tree. The sibling takes the full space. Returns null if last pane. */
export function removeLayoutNode(layout: LayoutNode, paneId: string): LayoutNode | null {
  if (layout.type === "leaf") {
    return layout.paneId === paneId ? null : layout
  }

  // Check if either direct child is the target leaf
  if (layout.left.type === "leaf" && layout.left.paneId === paneId) {
    return layout.right
  }
  if (layout.right.type === "leaf" && layout.right.paneId === paneId) {
    return layout.left
  }

  // Recurse
  const newLeft = removeLayoutNode(layout.left, paneId)
  const newRight = removeLayoutNode(layout.right, paneId)

  if (newLeft === null) return newRight
  if (newRight === null) return newLeft

  if (newLeft === layout.left && newRight === layout.right) return layout

  return { ...layout, left: newLeft, right: newRight }
}

/** Get all pane IDs from a layout tree in depth-first left-to-right order */
export function getLayoutPaneIds(layout: LayoutNode): string[] {
  if (layout.type === "leaf") return [layout.paneId]
  return [...getLayoutPaneIds(layout.left), ...getLayoutPaneIds(layout.right)]
}

// =============================================================================
// Spatial Navigation (Phase 4)
// =============================================================================

interface LayoutPathStep {
  node: LayoutNode & { type: "split" }
  side: "left" | "right"
}

/** Find the path from root to a leaf pane, recording which side we took at each split */
export function findLayoutPath(layout: LayoutNode, paneId: string): LayoutPathStep[] | null {
  if (layout.type === "leaf") {
    return layout.paneId === paneId ? [] : null
  }

  const leftPath = findLayoutPath(layout.left, paneId)
  if (leftPath !== null) {
    return [{ node: layout, side: "left" }, ...leftPath]
  }

  const rightPath = findLayoutPath(layout.right, paneId)
  if (rightPath !== null) {
    return [{ node: layout, side: "right" }, ...rightPath]
  }

  return null
}

/** Get the first (leftmost/topmost) leaf pane ID */
export function firstLayoutLeaf(node: LayoutNode): string {
  if (node.type === "leaf") return node.paneId
  return firstLayoutLeaf(node.left)
}

/** Get the last (rightmost/bottommost) leaf pane ID */
export function lastLayoutLeaf(node: LayoutNode): string {
  if (node.type === "leaf") return node.paneId
  return lastLayoutLeaf(node.right)
}

/**
 * Find the pane adjacent to the given pane in a spatial direction.
 *
 * For left/right: looks for siblings in horizontal ("h") splits.
 * For up/down: looks for siblings in vertical ("v") splits.
 *
 * Returns null if no adjacent pane exists in that direction.
 */
export function findAdjacentPaneInLayout(
  layout: LayoutNode,
  paneId: string,
  direction: "left" | "right" | "up" | "down",
): string | null {
  const path = findLayoutPath(layout, paneId)
  if (!path) return null

  const splitDirection = direction === "left" || direction === "right" ? "h" : "v"
  const goToRight = direction === "right" || direction === "down"

  // Walk up the path looking for a relevant split
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]
    if (!step || step.node.direction !== splitDirection) continue

    // We came from 'left' and want to go right/down → enter the 'right' subtree
    if (step.side === "left" && goToRight) {
      return firstLayoutLeaf(step.node.right)
    }

    // We came from 'right' and want to go left/up → enter the 'left' subtree
    if (step.side === "right" && !goToRight) {
      return lastLayoutLeaf(step.node.left)
    }
  }

  return null
}

// =============================================================================
// Phase 5 Layout Helpers
// =============================================================================

/**
 * Resize the nearest split containing the given pane on the specified axis.
 * Walks from the pane up the layout tree and adjusts the first split matching the axis.
 * Clamps ratio to [0.1, 0.9].
 */
export function resizeSplitForPane(layout: LayoutNode, paneId: string, delta: number, axis: "h" | "v"): LayoutNode {
  const path = findLayoutPath(layout, paneId)
  if (!path) return layout

  // Find the nearest split matching the axis
  let targetIndex = -1
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i]?.node.direction === axis) {
      targetIndex = i
      break
    }
  }
  if (targetIndex < 0) return layout

  const targetStep = path[targetIndex]
  if (!targetStep) return layout
  // If pane is on the right side, invert the delta (growing the right pane = shrinking the ratio)
  const adjustedDelta = targetStep.side === "left" ? delta : -delta

  return adjustSplitRatio(layout, targetStep.node, adjustedDelta)
}

/** Adjust the ratio of a specific split node in the tree, clamping to [0.1, 0.9] */
export function adjustSplitRatio(
  layout: LayoutNode,
  target: LayoutNode & { type: "split" },
  delta: number,
): LayoutNode {
  if (layout.type === "leaf") return layout

  if (layout === target) {
    const newRatio = Math.max(0.1, Math.min(0.9, layout.ratio + delta))
    if (newRatio === layout.ratio) return layout
    return { ...layout, ratio: newRatio }
  }

  const newLeft = adjustSplitRatio(layout.left, target, delta)
  const newRight = adjustSplitRatio(layout.right, target, delta)

  if (newLeft === layout.left && newRight === layout.right) return layout
  return { ...layout, left: newLeft, right: newRight }
}

/** Set all split ratios to 0.5 (equalize) */
export function equalizeLayout(layout: LayoutNode): LayoutNode {
  if (layout.type === "leaf") return layout

  const newLeft = equalizeLayout(layout.left)
  const newRight = equalizeLayout(layout.right)

  if (layout.ratio === 0.5 && newLeft === layout.left && newRight === layout.right) return layout

  return { ...layout, ratio: 0.5, left: newLeft, right: newRight }
}

/** Swap two leaf pane IDs in the layout tree */
export function swapLeaves(layout: LayoutNode, paneIdA: string, paneIdB: string): LayoutNode {
  if (layout.type === "leaf") {
    if (layout.paneId === paneIdA) return { type: "leaf", paneId: paneIdB }
    if (layout.paneId === paneIdB) return { type: "leaf", paneId: paneIdA }
    return layout
  }

  const newLeft = swapLeaves(layout.left, paneIdA, paneIdB)
  const newRight = swapLeaves(layout.right, paneIdA, paneIdB)

  if (newLeft === layout.left && newRight === layout.right) return layout
  return { ...layout, left: newLeft, right: newRight }
}

// =============================================================================
// Mouse Hit Testing (Phase 7: mouse support)
// =============================================================================

/** Bounding rectangle for a layout region */
export interface LayoutBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SplitBorderHit {
  /** Reference to the split node */
  splitNode: LayoutNode & { type: "split" }
  /** Start of the container on the split axis */
  containerStart: number
  /** Size of the container on the split axis */
  containerSize: number
}

/**
 * Hit-test for split borders: given mouse coordinates and terminal dimensions,
 * find which split border (if any) the click lands on.
 *
 * Each pane has a 1-char border (borderStyle="single"). The "seam" between
 * adjacent panes is 2 chars wide. We match clicks within ±tolerance of the
 * computed split position.
 */
export function hitTestSplitBorder(
  layout: LayoutNode,
  x: number,
  y: number,
  bounds: LayoutBounds,
  tolerance = 1,
): SplitBorderHit | null {
  if (layout.type === "leaf") return null

  const isHorizontal = layout.direction === "h"
  const pos = isHorizontal ? x : y
  const containerStart = isHorizontal ? bounds.x : bounds.y
  const containerSize = isHorizontal ? bounds.width : bounds.height

  // The split boundary position (where the first child ends)
  const borderPos = containerStart + Math.round(containerSize * layout.ratio)

  // Check if the click is near this border
  if (Math.abs(pos - borderPos) <= tolerance) {
    return { splitNode: layout, containerStart, containerSize }
  }

  // Recurse into the child that contains the click position
  if (pos < borderPos) {
    // Click is in the left/top child
    const childBounds = isHorizontal
      ? { ...bounds, width: borderPos - bounds.x }
      : { ...bounds, height: borderPos - bounds.y }
    return hitTestSplitBorder(layout.left, x, y, childBounds, tolerance)
  } else {
    // Click is in the right/bottom child
    const childBounds = isHorizontal
      ? { x: borderPos, y: bounds.y, width: bounds.x + bounds.width - borderPos, height: bounds.height }
      : { x: bounds.x, y: borderPos, width: bounds.width, height: bounds.y + bounds.height - borderPos }
    return hitTestSplitBorder(layout.right, x, y, childBounds, tolerance)
  }
}

/**
 * Hit-test for pane leaves: given mouse coordinates and terminal dimensions,
 * find which leaf pane (if any) contains the click.
 */
export function hitTestPaneId(layout: LayoutNode, x: number, y: number, bounds: LayoutBounds): string | null {
  if (layout.type === "leaf") {
    // Check if the point is within bounds
    if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
      return layout.paneId
    }
    return null
  }

  const isHorizontal = layout.direction === "h"
  const borderPos = isHorizontal
    ? bounds.x + Math.round(bounds.width * layout.ratio)
    : bounds.y + Math.round(bounds.height * layout.ratio)

  const pos = isHorizontal ? x : y

  if (pos < borderPos) {
    const childBounds = isHorizontal
      ? { ...bounds, width: borderPos - bounds.x }
      : { ...bounds, height: borderPos - bounds.y }
    return hitTestPaneId(layout.left, x, y, childBounds)
  } else {
    const childBounds = isHorizontal
      ? { x: borderPos, y: bounds.y, width: bounds.x + bounds.width - borderPos, height: bounds.height }
      : { x: bounds.x, y: borderPos, width: bounds.width, height: bounds.y + bounds.height - borderPos }
    return hitTestPaneId(layout.right, x, y, childBounds)
  }
}

/**
 * Set the ratio of a specific split node to an absolute value (for drag resize).
 * Clamps to [0.1, 0.9].
 */
export function setSplitRatioAbsolute(
  layout: LayoutNode,
  targetSplit: LayoutNode & { type: "split" },
  newRatio: number,
): LayoutNode {
  const clamped = Math.max(0.1, Math.min(0.9, newRatio))
  return adjustSplitRatio(layout, targetSplit, clamped - targetSplit.ratio)
}
