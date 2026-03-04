/**
 * ViewNavigation Tests
 *
 * Tests the cards view navigation policy — the core of the navigation refactor.
 * Uses createFakeRepo + a mock GridNavigator.
 *
 * NOTE: This is a pure state test (no screen assertions). It belongs in km-board
 * but can't move yet because the source module (view-navigation.ts) lives in
 * km-tui/src. Move this test when view-navigation.ts migrates to @km/board.
 */

import { describe, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import { createCardsViewNavigation, createDetailViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createGridNavigator } from "@km/board"

function makeState(cursorNodeId: string, rootId: string | null = "board"): NavState {
  return {
    cursorNodeId,
    rootId,
    foldDepths: new Map(),
    collapsedNodes: new Set(),
  }
}

describe("CardsViewNavigation", () => {
  const nav = createCardsViewNavigation()

  describe("vertical navigation (j/k)", () => {
    const nodes = item("board", item("col0", item("c0"), item("c1"), item("c2")), item("col1", item("c3")))
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()

    it("j from board → first column", () => {
      const target = nav.navigate("down", makeState("board"), repo, registry)
      expect(target).toBe("col0")
    })

    it("j from column → first card", () => {
      const target = nav.navigate("down", makeState("col0"), repo, registry)
      expect(target).toBe("c0")
    })

    it("j from card → next sibling", () => {
      const target = nav.navigate("down", makeState("c0"), repo, registry)
      expect(target).toBe("c1")
    })

    it("j from last card → null", () => {
      const target = nav.navigate("down", makeState("c2"), repo, registry)
      expect(target).toBeNull()
    })

    it("k from card → previous sibling", () => {
      const target = nav.navigate("up", makeState("c1"), repo, registry)
      expect(target).toBe("c0")
    })

    it("k from first card → column header", () => {
      const target = nav.navigate("up", makeState("c0"), repo, registry)
      expect(target).toBe("col0")
    })

    it("k from column → board", () => {
      const target = nav.navigate("up", makeState("col0"), repo, registry)
      expect(target).toBe("board")
    })

    it("k from board → null", () => {
      const target = nav.navigate("up", makeState("board"), repo, registry)
      expect(target).toBeNull()
    })

    it("j from empty column → null", () => {
      const emptyNodes = item("board", item("col0"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("down", makeState("col0"), emptyRepo, registry)
      expect(target).toBeNull()
    })

    it("j from board respects stickyX", () => {
      // Set stickyX to column 1
      registry.setStickyX(1)
      const target = nav.navigate("down", makeState("board"), repo, registry)
      expect(target).toBe("col1")
      registry.clearStickyX()
    })
  })

  describe("horizontal navigation (h/l)", () => {
    const nodes = item(
      "board",
      item("col0", item("a0"), item("a1")),
      item("col1", item("b0"), item("b1"), item("b2")),
      item("col2", item("d0")),
    )
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()

    it("l from card → first card in next column (no positions)", () => {
      // stickyY must be set before horizontal nav (set by handleHorizontalNav in production)
      registry.setStickyY(5)
      const target = nav.navigate("right", makeState("a0"), repo, registry)
      expect(target).toBe("b0")
      registry.clearStickyY()
    })

    it("h from card → first card in prev column (no positions)", () => {
      registry.setStickyY(5)
      const target = nav.navigate("left", makeState("b0"), repo, registry)
      expect(target).toBe("a0")
      registry.clearStickyY()
    })

    it("h from first column card → null", () => {
      const target = nav.navigate("left", makeState("a0"), repo, registry)
      expect(target).toBeNull()
    })

    it("l from last column card → null", () => {
      const target = nav.navigate("right", makeState("d0"), repo, registry)
      expect(target).toBeNull()
    })

    it("h/l from board → null", () => {
      expect(nav.navigate("left", makeState("board"), repo, registry)).toBeNull()
      expect(nav.navigate("right", makeState("board"), repo, registry)).toBeNull()
    })

    it("l from column header → column header (no cards info)", () => {
      const target = nav.navigate("right", makeState("col0"), repo, registry)
      // From column header to next column header (no stickyY set)
      expect(target).toBe("col1")
    })

    it("l to empty column → column header", () => {
      const emptyNodes = item("board", item("col0", item("a0")), item("col1"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("right", makeState("a0"), emptyRepo, registry)
      expect(target).toBe("col1")
    })
  })
})

describe("DetailViewNavigation", () => {
  const nav = createDetailViewNavigation()
  const nodes = item("root", item("child0"), item("child1"), item("child2"))
  const repo = createFakeRepo({ nodes })
  const grid = createGridNavigator()

  it("cursor === root, down → first child (bug: km-tui.detail-nav-ancestor)", () => {
    const target = nav.navigate("down", makeState("root", "root"), repo, grid)
    expect(target).toBe("child0")
  })

  it("cursor === root, up → last child", () => {
    const target = nav.navigate("up", makeState("root", "root"), repo, grid)
    expect(target).toBe("child2")
  })

  it("j from first child → second child", () => {
    const target = nav.navigate("down", makeState("child0", "root"), repo, grid)
    expect(target).toBe("child1")
  })

  it("k from first child → null (boundary)", () => {
    const target = nav.navigate("up", makeState("child0", "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("j from last child → null (boundary)", () => {
    const target = nav.navigate("down", makeState("child2", "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("left/right → null", () => {
    expect(nav.navigate("left", makeState("child0", "root"), repo, grid)).toBeNull()
    expect(nav.navigate("right", makeState("child0", "root"), repo, grid)).toBeNull()
  })
})
