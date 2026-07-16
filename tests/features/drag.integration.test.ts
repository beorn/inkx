/**
 * DragFeature integration tests.
 *
 * Tests the DragFeature wiring:
 * - State management (start/move/drop lifecycle)
 * - Drag threshold (small moves don't trigger drag)
 * - Escape cancels drag
 * - Priority routing (draggable=true beats selection at lower priority)
 * - Drop target resolution via hit testing
 * - subscribe/dispose lifecycle
 *
 * These tests use the feature directly (not through withDomEvents)
 * to verify the service layer independently.
 */

import { describe, test, expect, vi } from "vitest"
import { createDragFeature } from "../../packages/ag-term/src/features/drag"
import type { AgNode } from "../../packages/ag/src/types"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AgNode stub for testing. */
function createMockNode(
  props: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): AgNode {
  return {
    type: "box",
    props,
    children: [],
    parent: null,
    scrollRect: { x: 0, y: 0, width: 40, height: 10 },
    ...extra,
  } as unknown as AgNode
}

/** Create a draggable node. */
function createDraggableNode(extra: Record<string, unknown> = {}): AgNode {
  return createMockNode({ draggable: true }, extra)
}

/** Create a drop target node (has onDrop handler). */
function createDropTargetNode(onDrop = vi.fn(), extra: Record<string, unknown> = {}): AgNode {
  return createMockNode({ onDrop }, extra)
}

/** Hit test function that always returns a specific node. */
function alwaysHit(node: AgNode | null): (x: number, y: number) => AgNode | null {
  return () => node
}

// ============================================================================
// DragFeature — state management
// ============================================================================

describe("DragFeature — state management", () => {
  test("initial state is null (no drag active)", () => {
    const feature = createDragFeature({ invalidate: () => {} })

    expect(feature.state).toBeNull()
    expect(feature.tracking).toBe(false)

    feature.dispose()
  })

  test("mousedown on draggable node starts tracking", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    const claimed = feature.handleMouseDown(5, 5, node)

    expect(claimed).toBe(true)
    expect(feature.tracking).toBe(true)
    // State is still null during pointing phase
    expect(feature.state).toBeNull()

    feature.dispose()
  })

  test("mousedown on non-draggable node does not start tracking", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createMockNode({ draggable: false })

    const claimed = feature.handleMouseDown(5, 5, node)

    expect(claimed).toBe(false)
    expect(feature.tracking).toBe(false)

    feature.dispose()
  })

  test("mousemove past threshold activates drag", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    // Move past threshold (>3 cells)
    feature.handleMouseMove(10, 5, alwaysHit(null))

    expect(feature.state).not.toBeNull()
    expect(feature.state!.active).toBe(true)
    expect(feature.state!.source).toBe(node)
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("mouseup after drag dispatches drop and resets", () => {
    const onDrop = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createDraggableNode()
    const targetNode = createDropTargetNode(onDrop)

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    feature.handleMouseUp(10, 5, alwaysHit(targetNode))

    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        source: sourceNode,
        dropTarget: targetNode,
      }),
    )
    expect(feature.state).toBeNull()
    expect(feature.tracking).toBe(false)

    feature.dispose()
  })

  test("mouseup with no drop target does not dispatch drop", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createDraggableNode()

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    feature.handleMouseUp(10, 5, alwaysHit(null))

    expect(feature.state).toBeNull()

    feature.dispose()
  })
})

// ============================================================================
// DragFeature — source lifecycle
// ============================================================================

describe("DragFeature — source lifecycle", () => {
  test("source start/end bracket a successful drop", () => {
    const order: string[] = []
    const onDragStart = vi.fn(() => order.push("start"))
    const onDragEnd = vi.fn(() => order.push("end"))
    const onDragEnter = vi.fn(() => order.push("enter"))
    const onDrop = vi.fn(() => order.push("drop"))
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createMockNode({ draggable: true, onDragStart, onDragEnd })
    const targetNode = createMockNode({ onDragEnter, onDrop })

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(7, 5, alwaysHit(targetNode))

    expect(onDragStart).not.toHaveBeenCalled()

    feature.handleMouseMove(10, 5, alwaysHit(targetNode))

    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragStart).toHaveBeenCalledWith({
      source: sourceNode,
      position: { x: 10, y: 5 },
      dropTarget: targetNode,
    })

    feature.handleMouseMove(11, 5, alwaysHit(targetNode))
    feature.handleMouseUp(12, 5, alwaysHit(targetNode))

    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledWith({
      source: sourceNode,
      position: { x: 12, y: 5 },
      dropTarget: targetNode,
    })
    expect(order).toEqual(["start", "enter", "drop", "end"])

    feature.dispose()
  })

  test("release outside a drop target still ends the source lifecycle", () => {
    const onDragEnd = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createMockNode({ draggable: true, onDragEnd })

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    feature.handleMouseUp(12, 5, alwaysHit(null))

    expect(onDragEnd).toHaveBeenCalledOnce()
    expect(onDragEnd).toHaveBeenCalledWith({
      source: sourceNode,
      position: { x: 12, y: 5 },
      dropTarget: null,
    })

    feature.dispose()
  })

  test("cancel reports an active drag without ending and ignores the pointing phase", () => {
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()
    const onDragCancel = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createMockNode({
      draggable: true,
      onDragStart,
      onDragEnd,
      onDragCancel,
    })
    const targetNode = createDropTargetNode()

    feature.handleMouseDown(5, 5, sourceNode)
    feature.cancel()

    expect(onDragStart).not.toHaveBeenCalled()
    expect(onDragCancel).not.toHaveBeenCalled()

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(targetNode))
    feature.cancel()
    feature.cancel()

    expect(onDragStart).toHaveBeenCalledOnce()
    expect(onDragCancel).toHaveBeenCalledOnce()
    expect(onDragCancel).toHaveBeenCalledWith({
      source: sourceNode,
      position: { x: 10, y: 5 },
      dropTarget: targetNode,
    })
    expect(onDragEnd).not.toHaveBeenCalled()

    feature.dispose()
  })
})

// ============================================================================
// DragFeature — drag threshold
// ============================================================================

describe("DragFeature — drag threshold", () => {
  test("small moves do not trigger drag (threshold = 3)", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)

    // Move only 1 cell — within threshold
    feature.handleMouseMove(6, 5, alwaysHit(null))
    expect(feature.state).toBeNull()
    expect(feature.tracking).toBe(true) // still in pointing phase

    // Move 2 cells — still within threshold
    feature.handleMouseMove(7, 5, alwaysHit(null))
    expect(feature.state).toBeNull()

    // Move 3 cells — still within threshold (threshold is >3, not >=3)
    feature.handleMouseMove(8, 5, alwaysHit(null))
    expect(feature.state).toBeNull()

    // Move 4 cells — past threshold
    feature.handleMouseMove(9, 5, alwaysHit(null))
    expect(feature.state).not.toBeNull()
    expect(feature.state!.active).toBe(true)

    feature.dispose()
  })

  test("mouseup before threshold is just a click (no drag)", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(6, 5, alwaysHit(null)) // within threshold
    feature.handleMouseUp(6, 5, alwaysHit(null))

    // Should have cleanly reset — no drag was active
    expect(feature.state).toBeNull()
    expect(feature.tracking).toBe(false)

    feature.dispose()
  })
})

// ============================================================================
// DragFeature — Escape cancels drag
// ============================================================================

describe("DragFeature — cancel", () => {
  test("cancel during pointing phase resets tracking", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    expect(feature.tracking).toBe(true)

    feature.cancel()

    expect(feature.tracking).toBe(false)
    expect(feature.state).toBeNull()
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("cancel during active drag resets state", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    expect(feature.state).not.toBeNull()

    invalidate.mockClear()
    feature.cancel()

    expect(feature.state).toBeNull()
    expect(feature.tracking).toBe(false)
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("cancel when not tracking is a no-op", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })

    feature.cancel()

    expect(invalidate).not.toHaveBeenCalled()

    feature.dispose()
  })
})

// ============================================================================
// DragFeature — drop target tracking
// ============================================================================

describe("DragFeature — drop target tracking", () => {
  test("drop target updates during drag", () => {
    const onDragEnter = vi.fn()
    const onDragLeave = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createDraggableNode()
    const target1 = createMockNode({ onDragEnter, onDragLeave })
    const target2 = createMockNode({ onDragEnter: vi.fn() })

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(target1))
    expect(feature.state!.dropTarget).toBe(target1)
    expect(onDragEnter).toHaveBeenCalledTimes(1)

    // Move to a different target
    feature.handleMouseMove(15, 5, alwaysHit(target2))
    expect(feature.state!.dropTarget).toBe(target2)
    expect(onDragLeave).toHaveBeenCalledTimes(1) // left target1

    feature.dispose()
  })

  test("cannot drop on self (source node)", () => {
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createMockNode({ draggable: true, onDrop: vi.fn() })

    feature.handleMouseDown(5, 5, sourceNode)
    feature.handleMouseMove(10, 5, alwaysHit(sourceNode))

    // Source is excluded as drop target
    expect(feature.state!.dropTarget).toBeNull()

    feature.dispose()
  })

  test("dragOver fires on same target during move", () => {
    const onDragOver = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const sourceNode = createDraggableNode()
    const target = createMockNode({ onDragOver })

    feature.handleMouseDown(5, 5, sourceNode)
    // First move past threshold — enters target
    feature.handleMouseMove(10, 5, alwaysHit(target))
    // Second move — same target, fires dragOver
    feature.handleMouseMove(11, 5, alwaysHit(target))

    expect(onDragOver).toHaveBeenCalledTimes(1)

    feature.dispose()
  })
})

// ============================================================================
// DragFeature — subscribe/dispose
// ============================================================================

describe("DragFeature — subscribe/dispose", () => {
  test("subscribe notifies on state changes", () => {
    const listener = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    feature.subscribe(listener)
    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))

    expect(listener).toHaveBeenCalled()

    feature.dispose()
  })

  test("unsubscribe stops notifications", () => {
    const listener = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    const unsub = feature.subscribe(listener)
    unsub()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))

    expect(listener).not.toHaveBeenCalled()

    feature.dispose()
  })

  test("dispose clears all listeners", () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    const feature = createDragFeature({ invalidate: () => {} })
    const node = createDraggableNode()

    feature.subscribe(listener1)
    feature.subscribe(listener2)
    feature.dispose()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))

    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).not.toHaveBeenCalled()
  })
})

// ============================================================================
// DragFeature — invalidation
// ============================================================================

describe("DragFeature — invalidation", () => {
  test("drag activation triggers invalidate", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    // Pointing phase does not invalidate
    expect(invalidate).not.toHaveBeenCalled()

    // Cross threshold — should invalidate
    feature.handleMouseMove(10, 5, alwaysHit(null))
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("drag move triggers invalidate", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    invalidate.mockClear()

    feature.handleMouseMove(11, 5, alwaysHit(null))
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("drop triggers invalidate", () => {
    const invalidate = vi.fn()
    const feature = createDragFeature({ invalidate })
    const node = createDraggableNode()

    feature.handleMouseDown(5, 5, node)
    feature.handleMouseMove(10, 5, alwaysHit(null))
    invalidate.mockClear()

    feature.handleMouseUp(10, 5, alwaysHit(null))
    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })
})
