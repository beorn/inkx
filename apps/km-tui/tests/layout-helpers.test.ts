import { describe, expect, it } from "vitest"

import type { LayoutNode } from "../src/board/board-types.ts"
import {
  adjustSplitRatio,
  equalizeLayout,
  findAdjacentPaneInLayout,
  findLayoutPath,
  firstLayoutLeaf,
  getLayoutPaneIds,
  lastLayoutLeaf,
  removeLayoutNode,
  resizeSplitForPane,
  splitLayoutNode,
  swapLeaves,
} from "../src/layout-helpers.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const leaf = (id: string): LayoutNode => ({ type: "leaf", paneId: id })

const hsplit = (left: LayoutNode, right: LayoutNode, ratio = 0.5): LayoutNode & { type: "split" } => ({
  type: "split",
  direction: "h",
  ratio,
  left,
  right,
})

const vsplit = (left: LayoutNode, right: LayoutNode, ratio = 0.5): LayoutNode & { type: "split" } => ({
  type: "split",
  direction: "v",
  ratio,
  left,
  right,
})

// ---------------------------------------------------------------------------
// splitLayoutNode
// ---------------------------------------------------------------------------

describe("splitLayoutNode", () => {
  it("splits a single leaf horizontally", () => {
    const result = splitLayoutNode(leaf("a"), "a", "h", "b")
    expect(result).toEqual(hsplit(leaf("a"), leaf("b")))
  })

  it("splits a single leaf vertically with custom ratio", () => {
    const result = splitLayoutNode(leaf("a"), "a", "v", "b", 0.3)
    expect(result).toEqual(vsplit(leaf("a"), leaf("b"), 0.3))
  })

  it("splits a nested leaf inside a split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const result = splitLayoutNode(layout, "b", "v", "c")
    expect(result).toEqual(hsplit(leaf("a"), vsplit(leaf("b"), leaf("c"))))
  })

  it("returns the same reference when target not found", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const result = splitLayoutNode(layout, "missing", "h", "c")
    expect(result).toBe(layout)
  })

  it("returns the same leaf reference when paneId does not match", () => {
    const l = leaf("x")
    expect(splitLayoutNode(l, "y", "h", "z")).toBe(l)
  })
})

// ---------------------------------------------------------------------------
// removeLayoutNode
// ---------------------------------------------------------------------------

describe("removeLayoutNode", () => {
  it("returns null when removing the only leaf", () => {
    expect(removeLayoutNode(leaf("a"), "a")).toBeNull()
  })

  it("returns the leaf unchanged when paneId does not match", () => {
    const l = leaf("a")
    expect(removeLayoutNode(l, "b")).toBe(l)
  })

  it("returns sibling when removing left child of a split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(removeLayoutNode(layout, "a")).toEqual(leaf("b"))
  })

  it("returns sibling when removing right child of a split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(removeLayoutNode(layout, "b")).toEqual(leaf("a"))
  })

  it("removes a deeply nested leaf and collapses parent", () => {
    // h(a, v(b, c)) → remove b → h(a, c)
    const layout = hsplit(leaf("a"), vsplit(leaf("b"), leaf("c")))
    const result = removeLayoutNode(layout, "b")
    expect(result).toEqual(hsplit(leaf("a"), leaf("c")))
  })

  it("returns same reference when target not found in tree", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(removeLayoutNode(layout, "missing")).toBe(layout)
  })

  it("handles removal from deeper nesting", () => {
    // h(v(a, b), v(c, d)) → remove d → h(v(a, b), c)
    const layout = hsplit(vsplit(leaf("a"), leaf("b")), vsplit(leaf("c"), leaf("d")))
    const result = removeLayoutNode(layout, "d")
    expect(result).toEqual(hsplit(vsplit(leaf("a"), leaf("b")), leaf("c")))
  })
})

// ---------------------------------------------------------------------------
// getLayoutPaneIds
// ---------------------------------------------------------------------------

describe("getLayoutPaneIds", () => {
  it("returns single id for a leaf", () => {
    expect(getLayoutPaneIds(leaf("a"))).toEqual(["a"])
  })

  it("returns ids in left-to-right depth-first order", () => {
    const layout = hsplit(leaf("a"), vsplit(leaf("b"), leaf("c")))
    expect(getLayoutPaneIds(layout)).toEqual(["a", "b", "c"])
  })

  it("handles deeply nested splits", () => {
    // h(v(a, b), v(c, d))
    const layout = hsplit(vsplit(leaf("a"), leaf("b")), vsplit(leaf("c"), leaf("d")))
    expect(getLayoutPaneIds(layout)).toEqual(["a", "b", "c", "d"])
  })
})

// ---------------------------------------------------------------------------
// findLayoutPath
// ---------------------------------------------------------------------------

describe("findLayoutPath", () => {
  it("returns empty array for root leaf match", () => {
    expect(findLayoutPath(leaf("a"), "a")).toEqual([])
  })

  it("returns null when leaf does not match", () => {
    expect(findLayoutPath(leaf("a"), "b")).toBeNull()
  })

  it("finds path to left child", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const path = findLayoutPath(layout, "a")
    expect(path).toHaveLength(1)
    expect(path![0]!.side).toBe("left")
    expect(path![0]!.node).toBe(layout)
  })

  it("finds path to right child", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const path = findLayoutPath(layout, "b")
    expect(path).toHaveLength(1)
    expect(path![0]!.side).toBe("right")
  })

  it("finds path through nested splits", () => {
    const inner = vsplit(leaf("b"), leaf("c"))
    const layout = hsplit(leaf("a"), inner)
    const path = findLayoutPath(layout, "c")
    expect(path).toHaveLength(2)
    expect(path![0]!.side).toBe("right")
    expect(path![0]!.node).toBe(layout)
    expect(path![1]!.side).toBe("right")
    expect(path![1]!.node).toBe(inner)
  })

  it("returns null when pane not found in tree", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(findLayoutPath(layout, "missing")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// firstLayoutLeaf / lastLayoutLeaf
// ---------------------------------------------------------------------------

describe("firstLayoutLeaf", () => {
  it("returns paneId for a single leaf", () => {
    expect(firstLayoutLeaf(leaf("x"))).toBe("x")
  })

  it("returns leftmost leaf in nested structure", () => {
    // h(v(a, b), c) → first is a
    const layout = hsplit(vsplit(leaf("a"), leaf("b")), leaf("c"))
    expect(firstLayoutLeaf(layout)).toBe("a")
  })
})

describe("lastLayoutLeaf", () => {
  it("returns paneId for a single leaf", () => {
    expect(lastLayoutLeaf(leaf("x"))).toBe("x")
  })

  it("returns rightmost leaf in nested structure", () => {
    // h(a, v(b, c)) → last is c
    const layout = hsplit(leaf("a"), vsplit(leaf("b"), leaf("c")))
    expect(lastLayoutLeaf(layout)).toBe("c")
  })
})

// ---------------------------------------------------------------------------
// findAdjacentPaneInLayout
// ---------------------------------------------------------------------------

describe("findAdjacentPaneInLayout", () => {
  it("finds right neighbor in horizontal split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(findAdjacentPaneInLayout(layout, "a", "right")).toBe("b")
  })

  it("finds left neighbor in horizontal split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(findAdjacentPaneInLayout(layout, "b", "left")).toBe("a")
  })

  it("finds down neighbor in vertical split", () => {
    const layout = vsplit(leaf("a"), leaf("b"))
    expect(findAdjacentPaneInLayout(layout, "a", "down")).toBe("b")
  })

  it("finds up neighbor in vertical split", () => {
    const layout = vsplit(leaf("a"), leaf("b"))
    expect(findAdjacentPaneInLayout(layout, "b", "up")).toBe("a")
  })

  it("returns null when no adjacent in direction", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    // up/down don't exist in a horizontal-only split
    expect(findAdjacentPaneInLayout(layout, "a", "up")).toBeNull()
    expect(findAdjacentPaneInLayout(layout, "a", "down")).toBeNull()
    // leftmost has nothing to its left
    expect(findAdjacentPaneInLayout(layout, "a", "left")).toBeNull()
    // rightmost has nothing to its right
    expect(findAdjacentPaneInLayout(layout, "b", "right")).toBeNull()
  })

  it("returns null for unknown pane", () => {
    expect(findAdjacentPaneInLayout(leaf("a"), "missing", "right")).toBeNull()
  })

  it("navigates into nested subtree picking first/last leaf", () => {
    // h(a, v(b, c)) → right from a enters the v-split, picks first leaf = b
    const layout = hsplit(leaf("a"), vsplit(leaf("b"), leaf("c")))
    expect(findAdjacentPaneInLayout(layout, "a", "right")).toBe("b")
  })

  it("navigates back from nested subtree picking last leaf", () => {
    // h(v(a, b), c) → left from c enters the v-split, picks last leaf = b
    const layout = hsplit(vsplit(leaf("a"), leaf("b")), leaf("c"))
    expect(findAdjacentPaneInLayout(layout, "c", "left")).toBe("b")
  })

  it("handles deeply nested navigation", () => {
    // h(v(a, b), v(c, d)) → right from b → first leaf of right subtree = c
    const layout = hsplit(vsplit(leaf("a"), leaf("b")), vsplit(leaf("c"), leaf("d")))
    expect(findAdjacentPaneInLayout(layout, "b", "right")).toBe("c")
    // left from c → last leaf of left subtree = b
    expect(findAdjacentPaneInLayout(layout, "c", "left")).toBe("b")
  })
})

// ---------------------------------------------------------------------------
// resizeSplitForPane
// ---------------------------------------------------------------------------

describe("resizeSplitForPane", () => {
  it("adjusts ratio on the correct axis", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.5)
    const result = resizeSplitForPane(layout, "a", 0.1, "h")
    expect(result.type).toBe("split")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.6)
    }
  })

  it("inverts delta for right-side pane", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.5)
    // Growing right pane (b) by 0.1 means ratio decreases by 0.1
    const result = resizeSplitForPane(layout, "b", 0.1, "h")
    expect(result.type).toBe("split")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.4)
    }
  })

  it("clamps ratio to minimum 0.1", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.2)
    const result = resizeSplitForPane(layout, "a", -0.5, "h")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.1)
    }
  })

  it("clamps ratio to maximum 0.9", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.8)
    const result = resizeSplitForPane(layout, "a", 0.5, "h")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.9)
    }
  })

  it("returns same reference when axis does not match any split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const result = resizeSplitForPane(layout, "a", 0.1, "v")
    expect(result).toBe(layout)
  })

  it("returns same reference when pane not found", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(resizeSplitForPane(layout, "missing", 0.1, "h")).toBe(layout)
  })

  it("targets the nearest split matching the axis", () => {
    // v( h(a, b), c ) — resizing "a" on axis "v" should adjust the outer v-split
    const inner = hsplit(leaf("a"), leaf("b"), 0.5)
    const layout = vsplit(inner, leaf("c"), 0.5)
    const result = resizeSplitForPane(layout, "a", 0.1, "v")
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.6)
      expect(result.direction).toBe("v")
    }
  })
})

// ---------------------------------------------------------------------------
// adjustSplitRatio
// ---------------------------------------------------------------------------

describe("adjustSplitRatio", () => {
  it("adjusts the target split ratio", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.5)
    const result = adjustSplitRatio(layout, layout as LayoutNode & { type: "split" }, 0.2)
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.7)
    }
  })

  it("clamps to 0.1 minimum", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.15)
    const result = adjustSplitRatio(layout, layout as LayoutNode & { type: "split" }, -0.5)
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.1)
    }
  })

  it("clamps to 0.9 maximum", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.85)
    const result = adjustSplitRatio(layout, layout as LayoutNode & { type: "split" }, 0.5)
    if (result.type === "split") {
      expect(result.ratio).toBeCloseTo(0.9)
    }
  })

  it("returns same reference when target not found", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const other = hsplit(leaf("x"), leaf("y"))
    expect(adjustSplitRatio(layout, other as LayoutNode & { type: "split" }, 0.1)).toBe(layout)
  })

  it("returns same reference for a leaf", () => {
    const l = leaf("a")
    const target = hsplit(leaf("x"), leaf("y"))
    expect(adjustSplitRatio(l, target as LayoutNode & { type: "split" }, 0.1)).toBe(l)
  })

  it("returns same reference when delta results in no change (already clamped)", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.1)
    const result = adjustSplitRatio(layout, layout as LayoutNode & { type: "split" }, -0.5)
    // ratio was 0.1, delta -0.5 → clamped to 0.1 → no change
    expect(result).toBe(layout)
  })
})

// ---------------------------------------------------------------------------
// equalizeLayout
// ---------------------------------------------------------------------------

describe("equalizeLayout", () => {
  it("returns same reference for a leaf", () => {
    const l = leaf("a")
    expect(equalizeLayout(l)).toBe(l)
  })

  it("returns same reference when already equalized", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.5)
    expect(equalizeLayout(layout)).toBe(layout)
  })

  it("sets ratio to 0.5 on a single split", () => {
    const layout = hsplit(leaf("a"), leaf("b"), 0.7)
    const result = equalizeLayout(layout)
    if (result.type === "split") {
      expect(result.ratio).toBe(0.5)
    }
  })

  it("equalizes all nested splits", () => {
    const layout = hsplit(vsplit(leaf("a"), leaf("b"), 0.3), leaf("c"), 0.8)
    const result = equalizeLayout(layout)
    expect(result).toEqual(hsplit(vsplit(leaf("a"), leaf("b"), 0.5), leaf("c"), 0.5))
  })

  it("preserves structure (directions and leaves)", () => {
    const layout = vsplit(hsplit(leaf("x"), leaf("y"), 0.2), hsplit(leaf("z"), leaf("w"), 0.9), 0.7)
    const result = equalizeLayout(layout)
    const ids = getLayoutPaneIds(result)
    expect(ids).toEqual(["x", "y", "z", "w"])
    // All ratios should be 0.5
    function checkRatios(node: LayoutNode): void {
      if (node.type === "split") {
        expect(node.ratio).toBe(0.5)
        checkRatios(node.left)
        checkRatios(node.right)
      }
    }
    checkRatios(result)
  })
})

// ---------------------------------------------------------------------------
// swapLeaves
// ---------------------------------------------------------------------------

describe("swapLeaves", () => {
  it("swaps two leaves in a split", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    const result = swapLeaves(layout, "a", "b")
    expect(getLayoutPaneIds(result)).toEqual(["b", "a"])
  })

  it("swaps leaves in nested structure", () => {
    const layout = hsplit(leaf("a"), vsplit(leaf("b"), leaf("c")))
    const result = swapLeaves(layout, "a", "c")
    expect(getLayoutPaneIds(result)).toEqual(["c", "b", "a"])
  })

  it("returns same reference when neither pane found", () => {
    const layout = hsplit(leaf("a"), leaf("b"))
    expect(swapLeaves(layout, "x", "y")).toBe(layout)
  })

  it("returns same reference when only one pane found (still applies swap)", () => {
    // If only one ID matches, that leaf gets renamed to the other
    const layout = hsplit(leaf("a"), leaf("b"))
    const result = swapLeaves(layout, "a", "missing")
    // "a" becomes "missing", "b" stays
    expect(getLayoutPaneIds(result)).toEqual(["missing", "b"])
  })

  it("preserves structure and ratios", () => {
    const layout = hsplit(vsplit(leaf("a"), leaf("b"), 0.3), leaf("c"), 0.7)
    const result = swapLeaves(layout, "a", "c")
    if (result.type === "split") {
      expect(result.ratio).toBe(0.7)
      if (result.left.type === "split") {
        expect(result.left.ratio).toBe(0.3)
      }
    }
    expect(getLayoutPaneIds(result)).toEqual(["c", "b", "a"])
  })
})
