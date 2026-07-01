/**
 * Interactive Signals Tests
 *
 * Tests for per-node interactive state:
 * - ensureInteractiveState creates lazily
 * - Setters return change detection correctly
 * - clearInteractiveState resets all fields
 * - Hover tracking via mouseenter/mouseleave
 * - Armed tracking via mousedown/mouseup
 * - Focus tracking via focus manager
 */

import { describe, test, expect, vi } from "vitest"
import type { AgNode, BoxProps } from "../../packages/ag/src/types"
import { INITIAL_EPOCH } from "../../packages/ag/src/epoch"
import {
  ensureInteractiveState,
  setHovered,
  setArmed,
  setSelected,
  setFocused,
  setDropTarget,
  clearInteractiveState,
} from "../../packages/ag/src/interactive-signals"
import { createFocusManager } from "../../packages/ag/src/focus-manager"
import {
  createMouseEventProcessor,
  processMouseEvent,
} from "../../packages/ag-term/src/mouse-events"
import type { ParsedMouse } from "../../packages/ag-term/src/mouse"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AgNode stub for interactive signal tests. */
function stubNode(
  id: string,
  opts?: {
    children?: AgNode[]
    mouseCapture?: boolean
    mouseCursor?: BoxProps["mouseCursor"]
    rect?: { x: number; y: number; width: number; height: number }
  },
): AgNode {
  const children = opts?.children ?? []
  const rect = opts?.rect ?? null
  const node: AgNode = {
    type: "silvery-box",
    props: {
      testID: id,
      focusable: true,
      mouseCapture: opts?.mouseCapture,
      mouseCursor: opts?.mouseCursor,
    } as BoxProps,
    children,
    parent: null,
    layoutNode: {} as any,
    boxRect: null,
    scrollRect: rect,
    screenRect: rect,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: 0,
    dirtyEpoch: INITIAL_EPOCH,
  }
  for (const child of children) {
    child.parent = node
  }
  return node
}

function makeParsedMouse(
  action: ParsedMouse["action"],
  x: number,
  y: number,
  button = 0,
): ParsedMouse {
  return {
    action,
    x,
    y,
    button,
    coordinateMode: "cell",
    ctrl: false,
    meta: false,
    shift: false,
  }
}

function createMouseTree(options?: { childMouseCapture?: boolean }) {
  const child = stubNode("child", {
    mouseCapture: options?.childMouseCapture,
    rect: { x: 5, y: 5, width: 10, height: 5 },
  })
  const root = stubNode("root", {
    children: [child],
    rect: { x: 0, y: 0, width: 80, height: 24 },
  })
  return { child, root, state: createMouseEventProcessor() }
}

// ============================================================================
// ensureInteractiveState
// ============================================================================

describe("ensureInteractiveState", () => {
  test("creates state lazily on first call", () => {
    const node = stubNode("a")
    expect(node.interactiveState).toBeUndefined()

    const state = ensureInteractiveState(node)
    expect(state).toBeDefined()
    expect(state.hovered).toBe(false)
    expect(state.armed).toBe(false)
    expect(state.selected).toBe(false)
    expect(state.focused).toBe(false)
    expect(state.dropTarget).toBe(false)
  })

  test("returns existing state on subsequent calls", () => {
    const node = stubNode("a")
    const first = ensureInteractiveState(node)
    first.hovered = true
    const second = ensureInteractiveState(node)
    expect(second).toBe(first)
    expect(second.hovered).toBe(true)
  })
})

// ============================================================================
// Individual setters — change detection
// ============================================================================

describe("setters return change detection", () => {
  test("setHovered returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setHovered(node, true)).toBe(true)
    expect(node.interactiveState!.hovered).toBe(true)
    expect(setHovered(node, true)).toBe(false)
    expect(setHovered(node, false)).toBe(true)
    expect(node.interactiveState!.hovered).toBe(false)
  })

  test("setArmed returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setArmed(node, true)).toBe(true)
    expect(node.interactiveState!.armed).toBe(true)
    expect(setArmed(node, true)).toBe(false)
    expect(setArmed(node, false)).toBe(true)
  })

  test("setSelected returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setSelected(node, true)).toBe(true)
    expect(node.interactiveState!.selected).toBe(true)
    expect(setSelected(node, true)).toBe(false)
    expect(setSelected(node, false)).toBe(true)
  })

  test("setFocused returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setFocused(node, true)).toBe(true)
    expect(node.interactiveState!.focused).toBe(true)
    expect(setFocused(node, true)).toBe(false)
    expect(setFocused(node, false)).toBe(true)
  })

  test("setDropTarget returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setDropTarget(node, true)).toBe(true)
    expect(node.interactiveState!.dropTarget).toBe(true)
    expect(setDropTarget(node, true)).toBe(false)
    expect(setDropTarget(node, false)).toBe(true)
  })
})

// ============================================================================
// clearInteractiveState
// ============================================================================

describe("clearInteractiveState", () => {
  test("sets interactiveState to null", () => {
    const node = stubNode("a")
    setHovered(node, true)
    setArmed(node, true)
    expect(node.interactiveState).not.toBeNull()

    clearInteractiveState(node)
    expect(node.interactiveState).toBeNull()
  })

  test("no-op on node without interactive state", () => {
    const node = stubNode("a")
    // Should not throw
    clearInteractiveState(node)
    expect(node.interactiveState).toBeNull()
  })
})

// ============================================================================
// Hover tracking via mouse events
// ============================================================================

describe("hover tracking via processMouseEvent", () => {
  test("mouseenter sets hovered=true, mouseleave sets hovered=false", () => {
    const { child, root, state } = createMouseTree()

    // Move into child — triggers mouseenter
    processMouseEvent(state, makeParsedMouse("move", 7, 7), root)
    expect(child.interactiveState?.hovered).toBe(true)

    // Move out of child — triggers mouseleave
    processMouseEvent(state, makeParsedMouse("move", 0, 0), root)
    expect(child.interactiveState?.hovered).toBe(false)
  })

  test("moving outside the hit tree clears hover state", () => {
    const { child, root, state } = createMouseTree()

    processMouseEvent(state, makeParsedMouse("move", 7, 7), root)
    expect(child.interactiveState?.hovered).toBe(true)

    processMouseEvent(state, makeParsedMouse("move", 90, 30), root)
    expect(child.interactiveState?.hovered).toBe(false)
    expect(state.hoverPath).toEqual([])
  })
})

// ============================================================================
// Semantic mouse cursor resolution
// ============================================================================

describe("semantic mouse cursor via processMouseEvent", () => {
  test("deepest hovered cursor region wins and leaving resets", () => {
    const child = stubNode("child", {
      mouseCursor: "text",
      rect: { x: 5, y: 5, width: 5, height: 5 },
    })
    const parent = stubNode("parent", {
      children: [child],
      mouseCursor: "pointer",
      rect: { x: 4, y: 4, width: 20, height: 10 },
    })
    const root = stubNode("root", {
      children: [parent],
      rect: { x: 0, y: 0, width: 80, height: 24 },
    })
    const changes: Array<BoxProps["mouseCursor"] | null> = []
    const state = createMouseEventProcessor({
      onMouseCursorChange: (shape) => changes.push(shape),
    })

    processMouseEvent(state, makeParsedMouse("move", 6, 6), root)
    processMouseEvent(state, makeParsedMouse("move", 20, 6), root)
    processMouseEvent(state, makeParsedMouse("move", 79, 23), root)

    expect(changes).toEqual(["text", "pointer", null])
  })

  test("same resolved cursor shape is not emitted again", () => {
    const first = stubNode("first", {
      mouseCursor: "pointer",
      rect: { x: 1, y: 1, width: 5, height: 5 },
    })
    const second = stubNode("second", {
      mouseCursor: "pointer",
      rect: { x: 10, y: 1, width: 5, height: 5 },
    })
    const root = stubNode("root", {
      children: [first, second],
      rect: { x: 0, y: 0, width: 80, height: 24 },
    })
    const changes: Array<BoxProps["mouseCursor"] | null> = []
    const state = createMouseEventProcessor({
      onMouseCursorChange: (shape) => changes.push(shape),
    })

    processMouseEvent(state, makeParsedMouse("move", 2, 2), root)
    processMouseEvent(state, makeParsedMouse("move", 3, 2), root)
    processMouseEvent(state, makeParsedMouse("move", 11, 2), root)

    expect(changes).toEqual(["pointer"])
  })

  test("captured drag keeps the capture target cursor outside the hit tree", () => {
    const handle = stubNode("handle", {
      mouseCapture: true,
      mouseCursor: "grab",
      rect: { x: 5, y: 5, width: 2, height: 5 },
    })
    const root = stubNode("root", {
      children: [handle],
      rect: { x: 0, y: 0, width: 80, height: 24 },
    })
    const changes: Array<BoxProps["mouseCursor"] | null> = []
    const state = createMouseEventProcessor({
      onMouseCursorChange: (shape) => changes.push(shape),
    })

    processMouseEvent(state, makeParsedMouse("down", 5, 6), root)
    handle.props = { ...handle.props, mouseCursor: "grabbing" } as BoxProps
    processMouseEvent(state, makeParsedMouse("move", 90, 30), root)
    processMouseEvent(state, makeParsedMouse("up", 90, 30), root)

    expect(changes).toEqual(["grab", "grabbing", null])
  })
})

// ============================================================================
// Armed tracking via mousedown/mouseup
// ============================================================================

describe("armed tracking via processMouseEvent", () => {
  test("mousedown sets armed=true, mouseup clears it", () => {
    const { child, root, state } = createMouseTree()

    // Mouse down on child
    processMouseEvent(state, makeParsedMouse("down", 7, 7), root)
    expect(child.interactiveState?.armed).toBe(true)

    // Mouse up on child
    processMouseEvent(state, makeParsedMouse("up", 7, 7), root)
    expect(child.interactiveState?.armed).toBe(false)
  })

  test("dragging a captured press outside the hit tree releases armed state after a grace period", () => {
    vi.useFakeTimers()
    try {
      const { child, root, state } = createMouseTree({ childMouseCapture: true })

      processMouseEvent(state, makeParsedMouse("down", 7, 7), root)
      expect(child.interactiveState?.armed).toBe(true)

      processMouseEvent(state, makeParsedMouse("move", 90, 30), root)
      vi.advanceTimersByTime(1_999)
      expect(child.interactiveState?.armed).toBe(true)

      vi.advanceTimersByTime(1)
      expect(child.interactiveState?.armed).toBe(false)
      expect(state.mouseDownTarget).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test("re-entering the hit tree cancels the captured-press release grace timer", () => {
    vi.useFakeTimers()
    try {
      const { child, root, state } = createMouseTree({ childMouseCapture: true })

      processMouseEvent(state, makeParsedMouse("down", 7, 7), root)
      processMouseEvent(state, makeParsedMouse("move", 90, 30), root)
      vi.advanceTimersByTime(1_500)
      processMouseEvent(state, makeParsedMouse("move", 7, 7), root)
      vi.advanceTimersByTime(1_000)

      expect(child.interactiveState?.armed).toBe(true)
      expect(state.mouseDownTarget).toBe(child)
    } finally {
      vi.useRealTimers()
    }
  })

  test("captured-press grace release dispatches mouseup with an up native action", () => {
    vi.useFakeTimers()
    try {
      const { child, root, state } = createMouseTree({ childMouseCapture: true })
      const nativeActions: ParsedMouse["action"][] = []
      ;(child.props as BoxProps).onMouseUp = (event) => {
        nativeActions.push((event.nativeEvent as ParsedMouse).action)
      }

      processMouseEvent(state, makeParsedMouse("down", 7, 7), root)
      processMouseEvent(state, makeParsedMouse("move", 90, 30), root)
      vi.advanceTimersByTime(2_000)

      expect(nativeActions).toEqual(["up"])
    } finally {
      vi.useRealTimers()
    }
  })
})

// ============================================================================
// Focus tracking via focus manager
// ============================================================================

describe("focus tracking via FocusManager", () => {
  test("focus sets focused=true, blur sets focused=false", () => {
    const node = stubNode("a")
    const fm = createFocusManager()

    fm.focus(node, "keyboard")
    expect(node.interactiveState?.focused).toBe(true)

    fm.blur()
    expect(node.interactiveState?.focused).toBe(false)
  })

  test("focusing a new node clears focused on old node", () => {
    const nodeA = stubNode("a")
    const nodeB = stubNode("b")
    const fm = createFocusManager()

    fm.focus(nodeA, "keyboard")
    expect(nodeA.interactiveState?.focused).toBe(true)

    fm.focus(nodeB, "keyboard")
    expect(nodeA.interactiveState?.focused).toBe(false)
    expect(nodeB.interactiveState?.focused).toBe(true)
  })

  test("handleSubtreeRemoved clears focused on removed node", () => {
    const child = stubNode("child")
    const root = stubNode("root", { children: [child] })
    const fm = createFocusManager()

    fm.focus(child, "keyboard")
    expect(child.interactiveState?.focused).toBe(true)

    fm.handleSubtreeRemoved(child)
    expect(child.interactiveState?.focused).toBe(false)
  })
})
