/**
 * Windowing Mouse Tests
 *
 * Tests for mouse interaction with pane windowing:
 * - hitTestSplitBorder: coordinate-based border detection
 * - hitTestPaneId: coordinate-based pane identification
 * - setSplitRatioAbsolute: absolute ratio setting for drag resize
 * - focusPaneById: click-to-focus store action
 */

import { describe, test, expect } from "vitest"
import { createStore } from "zustand"
import { hitTestSplitBorder, hitTestPaneId, setSplitRatioAbsolute } from "../src/layout-helpers.ts"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../src/state/board-app-store.ts"
import { createBoardState } from "../src/board/board-types.ts"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { createToastQueue } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import type { LayoutNode } from "../src/board/board-types.ts"

// =============================================================================
// Test Helpers
// =============================================================================

function leaf(id: string): LayoutNode {
  return { type: "leaf", paneId: id }
}

function split(direction: "h" | "v", ratio: number, left: LayoutNode, right: LayoutNode): LayoutNode {
  return { type: "split", direction, ratio, left, right }
}

function createTestStore() {
  const nodes = item.root(
    "board",
    item("Inbox", item("task-1"), item("task-2")),
    item("Projects", item("proj-a"), item("proj-b")),
    item("Archive", item("old-task")),
  )
  const repo = createFakeRepo({ nodes })
  const toastQueue = createToastQueue()
  const params: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    initialBoardState: createBoardState("board", null, "task-1"),
    initialUIState: createInitialUIState({ columns: 120, rows: 30 }),
    initialViewMode: "cards",
    dimensions: { columns: 120, rows: 30 },
  }
  const store = createStore<BoardAppStore>(createBoardAppStoreState(params))
  return { store, repo }
}

// =============================================================================
// hitTestSplitBorder
// =============================================================================

describe("hitTestSplitBorder", () => {
  test("returns null for leaf layout", () => {
    const result = hitTestSplitBorder(leaf("main"), 40, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBeNull()
  })

  test("detects horizontal split border", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    // Split at x=40 in an 80-wide terminal
    const hit = hitTestSplitBorder(layout, 40, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(hit).not.toBeNull()
    expect(hit!.splitNode).toBe(layout)
    expect(hit!.containerStart).toBe(0)
    expect(hit!.containerSize).toBe(80)
  })

  test("detects vertical split border", () => {
    const layout = split("v", 0.5, leaf("a"), leaf("b"))
    // Split at y=12 in a 24-row terminal
    const hit = hitTestSplitBorder(layout, 40, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(hit).not.toBeNull()
    expect(hit!.splitNode).toBe(layout)
  })

  test("returns null for click far from border", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    // Click at x=10, far from the border at x=40
    const hit = hitTestSplitBorder(layout, 10, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(hit).toBeNull()
  })

  test("tolerance parameter controls hit area", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    // Click at x=38, border at x=40 — within tolerance=2 but not tolerance=1
    expect(hitTestSplitBorder(layout, 38, 12, { x: 0, y: 0, width: 80, height: 24 }, 2)).not.toBeNull()
    expect(hitTestSplitBorder(layout, 38, 12, { x: 0, y: 0, width: 80, height: 24 }, 1)).toBeNull()
  })

  test("detects nested split borders", () => {
    // Left half has a vertical sub-split
    const layout = split("h", 0.5, split("v", 0.5, leaf("a"), leaf("b")), leaf("c"))
    // The vertical split border is at y=12, within the left half (x < 40)
    const hit = hitTestSplitBorder(layout, 20, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(hit).not.toBeNull()
    expect(hit!.splitNode.direction).toBe("v")
  })

  test("returns container info for drag calculation", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    const hit = hitTestSplitBorder(layout, 40, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(hit).not.toBeNull()
    expect(hit!.containerStart).toBe(0)
    expect(hit!.containerSize).toBe(80)
  })
})

// =============================================================================
// hitTestPaneId
// =============================================================================

describe("hitTestPaneId", () => {
  test("returns pane id for leaf within bounds", () => {
    const result = hitTestPaneId(leaf("main"), 40, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("main")
  })

  test("returns null for leaf outside bounds", () => {
    const result = hitTestPaneId(leaf("main"), 100, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBeNull()
  })

  test("returns left pane id for click in left half of h-split", () => {
    const layout = split("h", 0.5, leaf("left"), leaf("right"))
    const result = hitTestPaneId(layout, 10, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("left")
  })

  test("returns right pane id for click in right half of h-split", () => {
    const layout = split("h", 0.5, leaf("left"), leaf("right"))
    const result = hitTestPaneId(layout, 60, 12, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("right")
  })

  test("returns top pane id for click in top half of v-split", () => {
    const layout = split("v", 0.5, leaf("top"), leaf("bottom"))
    const result = hitTestPaneId(layout, 40, 5, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("top")
  })

  test("returns bottom pane id for click in bottom half of v-split", () => {
    const layout = split("v", 0.5, leaf("top"), leaf("bottom"))
    const result = hitTestPaneId(layout, 40, 18, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("bottom")
  })

  test("resolves nested layouts", () => {
    // Left half split vertically: top-left and bottom-left
    const layout = split("h", 0.5, split("v", 0.5, leaf("tl"), leaf("bl")), leaf("right"))
    // Click in bottom-left quadrant
    const result = hitTestPaneId(layout, 10, 18, { x: 0, y: 0, width: 80, height: 24 })
    expect(result).toBe("bl")
  })
})

// =============================================================================
// setSplitRatioAbsolute
// =============================================================================

describe("setSplitRatioAbsolute", () => {
  test("sets ratio on target split", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    const result = setSplitRatioAbsolute(layout, layout as LayoutNode & { type: "split" }, 0.3)
    expect(result.type).toBe("split")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.3)
    }
  })

  test("clamps ratio to minimum 0.1", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    const splitNode = layout as LayoutNode & { type: "split" }
    const result = setSplitRatioAbsolute(layout, splitNode, 0.01)
    if (result.type === "split") expect(result.ratio).toBeCloseTo(0.1)
  })

  test("clamps ratio to maximum 0.9", () => {
    const layout = split("h", 0.5, leaf("a"), leaf("b"))
    const splitNode = layout as LayoutNode & { type: "split" }
    const result = setSplitRatioAbsolute(layout, splitNode, 0.99)
    if (result.type === "split") expect(result.ratio).toBeCloseTo(0.9)
  })

  test("sets ratio on nested split", () => {
    const inner = split("v", 0.5, leaf("a"), leaf("b"))
    const layout = split("h", 0.5, inner, leaf("c"))
    const result = setSplitRatioAbsolute(layout, inner as LayoutNode & { type: "split" }, 0.7)
    if (result.type === "split" && result.left.type === "split") {
      expect(result.left.ratio).toBeCloseTo(0.7)
    }
  })
})

// =============================================================================
// focusPaneById (store integration)
// =============================================================================

describe("focusPaneById", () => {
  test("switches focus to target pane", () => {
    const { store } = createTestStore()

    // Split to create a second pane (focus stays on "main")
    store.getState().splitFocusedPane("h")
    const afterSplit = store.getState()
    const paneIds = [...afterSplit.workspace.panes.keys()]
    expect(paneIds.length).toBe(2)
    expect(afterSplit.workspace.focusedPaneId).toBe("main")

    // Click-to-focus: switch to the new pane
    const newPaneId = paneIds.find((id) => id !== "main")!
    afterSplit.focusPaneById(newPaneId)
    const afterClick = store.getState()
    expect(afterClick.workspace.focusedPaneId).toBe(newPaneId)

    // Click-to-focus: switch back to "main"
    store.getState().focusPaneById("main")
    expect(store.getState().workspace.focusedPaneId).toBe("main")
  })

  test("is a no-op for already focused pane", () => {
    const { store } = createTestStore()

    const before = store.getState().workspace
    store.getState().focusPaneById("main")
    const after = store.getState().workspace

    // Should be the same reference (no state change)
    expect(after).toBe(before)
  })

  test("ignores unknown pane ID", () => {
    const { store } = createTestStore()

    const before = store.getState().workspace
    store.getState().focusPaneById("nonexistent")
    const after = store.getState().workspace

    expect(after).toBe(before)
  })

  test("sets previousFocusedPaneId correctly", () => {
    const { store } = createTestStore()

    // Split keeps focus on "main"
    store.getState().splitFocusedPane("h")
    const paneIds = [...store.getState().workspace.panes.keys()]
    const newPaneId = paneIds.find((id) => id !== "main")!

    // Switch from "main" to newPaneId
    store.getState().focusPaneById(newPaneId)
    expect(store.getState().workspace.previousFocusedPaneId).toBe("main")

    // Switch back to "main"
    store.getState().focusPaneById("main")
    expect(store.getState().workspace.previousFocusedPaneId).toBe(newPaneId)
  })
})

// =============================================================================
// setSplitRatio (store integration)
// =============================================================================

describe("setSplitRatio", () => {
  test("changes layout ratio via store action", () => {
    const { store } = createTestStore()

    store.getState().splitFocusedPane("h")
    const afterSplit = store.getState()
    expect(afterSplit.workspace.layout.type).toBe("split")

    const splitNode = afterSplit.workspace.layout as LayoutNode & { type: "split" }
    expect(splitNode.ratio).toBe(0.5)

    afterSplit.setSplitRatio(splitNode, 0.3)
    const afterResize = store.getState()
    const resizedLayout = afterResize.workspace.layout as LayoutNode & { type: "split" }
    expect(resizedLayout.ratio).toBeCloseTo(0.3)
  })

  test("clamps extreme ratios", () => {
    const { store } = createTestStore()

    store.getState().splitFocusedPane("h")
    const splitNode = store.getState().workspace.layout as LayoutNode & { type: "split" }

    store.getState().setSplitRatio(splitNode, 0.0)
    const clamped = store.getState().workspace.layout as LayoutNode & { type: "split" }
    expect(clamped.ratio).toBeCloseTo(0.1)
  })

  test("is a no-op when ratio unchanged", () => {
    const { store } = createTestStore()

    store.getState().splitFocusedPane("h")
    const splitNode = store.getState().workspace.layout as LayoutNode & { type: "split" }
    const before = store.getState().workspace

    // Set to the same ratio it already has
    store.getState().setSplitRatio(splitNode, 0.5)
    const after = store.getState().workspace

    expect(after).toBe(before)
  })
})
