/**
 * Selection — Point, Range, and auto-adjustment after operations.
 *
 * SlateJS-inspired selection model using ID-based addressing (not paths).
 * A Point identifies a position within a node's text. A Range spans from
 * an anchor to a focus point. After operations mutate the tree, selection
 * points must be transformed to remain valid.
 *
 * Key difference from SlateJS: Points reference nodeId (stable ULID) instead
 * of path (shifts on insert/delete). This makes transformation simpler —
 * most ops only affect the referenced node, not all subsequent paths.
 */

import type { Operation } from "./operations.ts"

// =============================================================================
// Point
// =============================================================================

/** A position within a node's text content. */
export interface Point {
  nodeId: string
  offset: number
}

/** Static helpers for Point. */
export const Point = {
  /** Create a point. */
  create(nodeId: string, offset: number): Point {
    return { nodeId, offset }
  },

  /** Check structural equality. */
  equals(a: Point, b: Point): boolean {
    return a.nodeId === b.nodeId && a.offset === b.offset
  },

  /** Compare two points. Returns -1, 0, or 1 (by nodeId then offset). */
  compare(a: Point, b: Point): -1 | 0 | 1 {
    if (a.nodeId < b.nodeId) return -1
    if (a.nodeId > b.nodeId) return 1
    if (a.offset < b.offset) return -1
    if (a.offset > b.offset) return 1
    return 0
  },
} as const

// =============================================================================
// Range
// =============================================================================

/**
 * A selection range spanning from anchor to focus.
 * When collapsed (anchor === focus), represents a cursor.
 */
export interface Range {
  anchor: Point
  focus: Point
}

/** Static helpers for Range. */
export const Range = {
  /** Create a range. */
  create(anchor: Point, focus: Point): Range {
    return { anchor, focus }
  },

  /** Create a collapsed range (cursor) at a point. */
  cursor(nodeId: string, offset: number): Range {
    const point = { nodeId, offset }
    return { anchor: point, focus: point }
  },

  /** True when anchor and focus are the same point. */
  isCollapsed(range: Range): boolean {
    return Point.equals(range.anchor, range.focus)
  },

  /** True when anchor and focus differ. */
  isExpanded(range: Range): boolean {
    return !Range.isCollapsed(range)
  },

  /** Check structural equality. */
  equals(a: Range, b: Range): boolean {
    return Point.equals(a.anchor, b.anchor) && Point.equals(a.focus, b.focus)
  },
} as const

// =============================================================================
// Transform Point
// =============================================================================

/**
 * Transform a point after an operation, returning the adjusted point
 * or null if the point's node was deleted.
 *
 * Rules per operation type:
 * - insert_node: no effect (new node has a new ID)
 * - remove_node: null if point's node was removed
 * - set_node: offset clamped if content shortened
 * - move_node: no effect (ID-based, not path-based)
 * - split_node: if point is in the split node at/after offset, shift to new node
 * - merge_node: if point is in the merged (deleted) node, shift into target
 * - set_selection: no effect on points
 */
export function transformPoint(point: Point, op: Operation): Point | null {
  switch (op.type) {
    case "insert_node":
      // New node gets a new ID — existing points unaffected
      return point

    case "remove_node":
      // If the point's node was removed, the point is invalid
      if (point.nodeId === op.nodeId) return null
      return point

    case "set_node":
      // If content changed on this node, clamp offset.
      // We can't know the new text length from the op alone, so we
      // only adjust if the op explicitly sets content shorter.
      if (point.nodeId === op.nodeId && typeof op.properties.content === "string") {
        const newLen = op.properties.content.length
        if (point.offset > newLen) {
          return { nodeId: point.nodeId, offset: newLen }
        }
      }
      return point

    case "move_node":
      // ID-based addressing — moves don't affect point validity
      return point

    case "split_node":
      if (point.nodeId === op.nodeId) {
        if (point.offset >= op.offset) {
          // Point is at or after the split — moves to the new node
          return { nodeId: op.newId, offset: point.offset - op.offset }
        }
        // Point is before the split — stays in original
      }
      return point

    case "merge_node":
      if (point.nodeId === op.nodeId) {
        // Point is in the source (deleted) node — shift into target
        return { nodeId: op.targetId, offset: op.offset + point.offset }
      }
      return point

    case "set_selection":
      // Selection ops don't affect points
      return point
  }
}

// =============================================================================
// Transform Range
// =============================================================================

/**
 * Transform a range after an operation.
 * Returns the adjusted range, or null if both anchor and focus are invalid.
 *
 * If only one point becomes null (node deleted), the range collapses
 * to the surviving point.
 */
export function transformRange(range: Range, op: Operation): Range | null {
  const anchor = transformPoint(range.anchor, op)
  const focus = transformPoint(range.focus, op)

  if (anchor == null && focus == null) return null
  if (anchor == null) return { anchor: focus!, focus: focus! }
  if (focus == null) return { anchor, focus: anchor }

  return { anchor, focus }
}

// =============================================================================
// Transform Selection (batch)
// =============================================================================

/**
 * Transform a selection through a sequence of operations.
 * Returns the adjusted selection, or null if it was invalidated.
 */
export function transformSelection(selection: Range | null, ops: Operation[]): Range | null {
  if (selection == null) return null
  let result: Range | null = selection
  for (const op of ops) {
    if (result == null) return null
    result = transformRange(result, op)
  }
  return result
}
