/**
 * Selection Tests — Point, Range, and transform after operations.
 *
 * Tests:
 * 1. Point/Range constructors and equality
 * 2. transformPoint for each operation type
 * 3. transformRange collapse behavior when one side is deleted
 * 4. transformSelection through operation sequences
 */

import { describe, test, expect } from "vitest"
import {
  Point,
  Range,
  transformPoint,
  transformRange,
  transformSelection,
} from "../src/selection.ts"
import type {
  Operation,
  InsertNodeOperation,
  RemoveNodeOperation,
  SetNodeOperation,
  MoveNodeOperation,
  SplitNodeOperation,
  MergeNodeOperation,
  SetSelectionOperation,
} from "../src/operations.ts"

// =============================================================================
// Point
// =============================================================================

describe("Point", () => {
  test("create returns a point", () => {
    const p = Point.create("n1", 5)
    expect(p.nodeId).toBe("n1")
    expect(p.offset).toBe(5)
  })

  test("equals returns true for matching points", () => {
    expect(Point.equals({ nodeId: "n1", offset: 3 }, { nodeId: "n1", offset: 3 })).toBe(true)
  })

  test("equals returns false for different nodeId", () => {
    expect(Point.equals({ nodeId: "n1", offset: 3 }, { nodeId: "n2", offset: 3 })).toBe(false)
  })

  test("equals returns false for different offset", () => {
    expect(Point.equals({ nodeId: "n1", offset: 3 }, { nodeId: "n1", offset: 4 })).toBe(false)
  })

  test("compare orders by nodeId then offset", () => {
    expect(Point.compare({ nodeId: "a", offset: 0 }, { nodeId: "b", offset: 0 })).toBe(-1)
    expect(Point.compare({ nodeId: "b", offset: 0 }, { nodeId: "a", offset: 0 })).toBe(1)
    expect(Point.compare({ nodeId: "a", offset: 0 }, { nodeId: "a", offset: 0 })).toBe(0)
    expect(Point.compare({ nodeId: "a", offset: 1 }, { nodeId: "a", offset: 5 })).toBe(-1)
    expect(Point.compare({ nodeId: "a", offset: 5 }, { nodeId: "a", offset: 1 })).toBe(1)
  })
})

// =============================================================================
// Range
// =============================================================================

describe("Range", () => {
  test("cursor creates a collapsed range", () => {
    const r = Range.cursor("n1", 3)
    expect(r.anchor.nodeId).toBe("n1")
    expect(r.focus.nodeId).toBe("n1")
    expect(Range.isCollapsed(r)).toBe(true)
  })

  test("isExpanded for non-collapsed range", () => {
    const r = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n1", offset: 5 })
    expect(Range.isExpanded(r)).toBe(true)
    expect(Range.isCollapsed(r)).toBe(false)
  })

  test("equals checks both anchor and focus", () => {
    const a = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n1", offset: 5 })
    const b = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n1", offset: 5 })
    const c = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n2", offset: 5 })
    expect(Range.equals(a, b)).toBe(true)
    expect(Range.equals(a, c)).toBe(false)
  })
})

// =============================================================================
// transformPoint — insert_node
// =============================================================================

describe("transformPoint — insert_node", () => {
  test("unrelated insert does not affect point", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: InsertNodeOperation = {
      type: "insert_node",
      parentId: "p1",
      index: 0,
      node: { type: "p", content: "new" },
      newId: "n2",
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — remove_node
// =============================================================================

describe("transformPoint — remove_node", () => {
  test("removes point when its node is deleted", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n1",
      snapshot: { type: "p", content: "old" },
      parentId: "p1",
      index: 0,
    }
    expect(transformPoint(point, op)).toBeNull()
  })

  test("unrelated remove does not affect point", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n2",
      snapshot: { type: "p" },
      parentId: "p1",
      index: 1,
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — set_node
// =============================================================================

describe("transformPoint — set_node", () => {
  test("clamps offset when content is shortened", () => {
    const point: Point = { nodeId: "n1", offset: 10 }
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: "n1",
      properties: { content: "short" }, // length 5
      oldProperties: { content: "long string here" },
    }
    const result = transformPoint(point, op)
    expect(result).toEqual({ nodeId: "n1", offset: 5 })
  })

  test("does not change offset when content is longer", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: "n1",
      properties: { content: "longer content" },
      oldProperties: { content: "old" },
    }
    expect(transformPoint(point, op)).toEqual(point)
  })

  test("unrelated set_node does not affect point", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: "n2",
      properties: { content: "x" },
      oldProperties: { content: "y" },
    }
    expect(transformPoint(point, op)).toEqual(point)
  })

  test("non-content set does not affect offset", () => {
    const point: Point = { nodeId: "n1", offset: 10 }
    const op: SetNodeOperation = {
      type: "set_node",
      nodeId: "n1",
      properties: { type: "h" },
      oldProperties: { type: "p" },
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — move_node
// =============================================================================

describe("transformPoint — move_node", () => {
  test("move does not affect point (ID-based)", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: MoveNodeOperation = {
      type: "move_node",
      nodeId: "n1",
      oldParentId: "p1",
      oldIndex: 0,
      newParentId: "p2",
      newIndex: 5,
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — split_node
// =============================================================================

describe("transformPoint — split_node", () => {
  test("point before split stays in original node", () => {
    const point: Point = { nodeId: "n1", offset: 2 }
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    expect(transformPoint(point, op)).toEqual({ nodeId: "n1", offset: 2 })
  })

  test("point at split offset moves to new node at offset 0", () => {
    const point: Point = { nodeId: "n1", offset: 5 }
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    expect(transformPoint(point, op)).toEqual({ nodeId: "n2", offset: 0 })
  })

  test("point after split offset moves to new node with adjusted offset", () => {
    const point: Point = { nodeId: "n1", offset: 8 }
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    expect(transformPoint(point, op)).toEqual({ nodeId: "n2", offset: 3 })
  })

  test("point in unrelated node is unaffected", () => {
    const point: Point = { nodeId: "n3", offset: 8 }
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — merge_node
// =============================================================================

describe("transformPoint — merge_node", () => {
  test("point in source node shifts into target at offset + original", () => {
    const point: Point = { nodeId: "n2", offset: 3 }
    const op: MergeNodeOperation = {
      type: "merge_node",
      nodeId: "n2",
      targetId: "n1",
      offset: 11, // target text length before merge
    }
    expect(transformPoint(point, op)).toEqual({ nodeId: "n1", offset: 14 })
  })

  test("point in target node is unaffected", () => {
    const point: Point = { nodeId: "n1", offset: 5 }
    const op: MergeNodeOperation = {
      type: "merge_node",
      nodeId: "n2",
      targetId: "n1",
      offset: 11,
    }
    expect(transformPoint(point, op)).toEqual(point)
  })

  test("point in unrelated node is unaffected", () => {
    const point: Point = { nodeId: "n3", offset: 5 }
    const op: MergeNodeOperation = {
      type: "merge_node",
      nodeId: "n2",
      targetId: "n1",
      offset: 11,
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformPoint — set_selection
// =============================================================================

describe("transformPoint — set_selection", () => {
  test("set_selection does not affect points", () => {
    const point: Point = { nodeId: "n1", offset: 3 }
    const op: SetSelectionOperation = {
      type: "set_selection",
      oldSelection: null,
      newSelection: { nodeId: "n2", offset: 0 },
    }
    expect(transformPoint(point, op)).toEqual(point)
  })
})

// =============================================================================
// transformRange
// =============================================================================

describe("transformRange", () => {
  test("both points survive — range preserved", () => {
    const range = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n1", offset: 5 })
    const op: InsertNodeOperation = {
      type: "insert_node",
      parentId: "p1",
      index: 0,
      node: { type: "p" },
      newId: "n2",
    }
    const result = transformRange(range, op)
    expect(result).toEqual(range)
  })

  test("anchor deleted — range collapses to focus", () => {
    const range = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n2", offset: 5 })
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n1",
      snapshot: { type: "p" },
      parentId: "p1",
      index: 0,
    }
    const result = transformRange(range, op)!
    expect(result.anchor).toEqual({ nodeId: "n2", offset: 5 })
    expect(result.focus).toEqual({ nodeId: "n2", offset: 5 })
    expect(Range.isCollapsed(result)).toBe(true)
  })

  test("focus deleted — range collapses to anchor", () => {
    const range = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n2", offset: 5 })
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n2",
      snapshot: { type: "p" },
      parentId: "p1",
      index: 1,
    }
    const result = transformRange(range, op)!
    expect(result.anchor).toEqual({ nodeId: "n1", offset: 0 })
    expect(result.focus).toEqual({ nodeId: "n1", offset: 0 })
  })

  test("both points deleted — range is null", () => {
    const range = Range.create({ nodeId: "n1", offset: 0 }, { nodeId: "n1", offset: 5 })
    const op: RemoveNodeOperation = {
      type: "remove_node",
      nodeId: "n1",
      snapshot: { type: "p" },
      parentId: "p1",
      index: 0,
    }
    expect(transformRange(range, op)).toBeNull()
  })

  test("split adjusts both anchor and focus", () => {
    const range = Range.create({ nodeId: "n1", offset: 2 }, { nodeId: "n1", offset: 8 })
    const op: SplitNodeOperation = {
      type: "split_node",
      nodeId: "n1",
      offset: 5,
      newId: "n2",
      properties: { type: "p" },
    }
    const result = transformRange(range, op)!
    // Anchor (offset 2) stays in n1
    expect(result.anchor).toEqual({ nodeId: "n1", offset: 2 })
    // Focus (offset 8) moves to n2 at offset 3
    expect(result.focus).toEqual({ nodeId: "n2", offset: 3 })
  })
})

// =============================================================================
// transformSelection (batch)
// =============================================================================

describe("transformSelection", () => {
  test("null selection stays null", () => {
    const ops: Operation[] = [
      { type: "insert_node", parentId: "p1", index: 0, node: { type: "p" }, newId: "n1" },
    ]
    expect(transformSelection(null, ops)).toBeNull()
  })

  test("transforms through multiple operations", () => {
    const selection = Range.cursor("n1", 5)

    const ops: Operation[] = [
      // Split n1 at offset 3 — cursor at 5 moves to n2 at offset 2
      { type: "split_node", nodeId: "n1", offset: 3, newId: "n2", properties: { type: "p" } },
      // Set n2 content to something shorter — clamp offset
      { type: "set_node", nodeId: "n2", properties: { content: "x" }, oldProperties: { content: "ab" } },
    ]

    const result = transformSelection(selection, ops)!
    // After split: cursor at n2, offset 2
    // After set_node with content "x" (length 1): clamped to offset 1
    expect(result.anchor).toEqual({ nodeId: "n2", offset: 1 })
    expect(result.focus).toEqual({ nodeId: "n2", offset: 1 })
  })

  test("returns null when node is deleted mid-sequence", () => {
    const selection = Range.cursor("n1", 0)
    const ops: Operation[] = [
      { type: "remove_node", nodeId: "n1", snapshot: { type: "p" }, parentId: "p1", index: 0 },
      { type: "insert_node", parentId: "p1", index: 0, node: { type: "p" }, newId: "n2" },
    ]
    expect(transformSelection(selection, ops)).toBeNull()
  })
})
