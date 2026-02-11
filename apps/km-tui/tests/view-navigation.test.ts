/**
 * ViewNavigation Tests
 *
 * Tests the cards view navigation policy — the core of the navigation refactor.
 * Uses createFakeRepo + a mock LayoutRegistry.
 */

import { describe, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import {
  createCardsViewNavigation,
  type NavState,
} from "../src/view-navigation.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"

function makeState(
  cursorNodeId: string,
  rootId: string | null = "board",
): NavState {
  return {
    cursorNodeId,
    rootId,
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
  }
}

describe("CardsViewNavigation", () => {
  const nav = createCardsViewNavigation()

  describe("vertical navigation (j/k)", () => {
    const nodes = item(
      "board",
      item("col0", item("c0"), item("c1"), item("c2")),
      item("col1", item("c3")),
    )
    const repo = createFakeRepo({ nodes })
    const registry = createLayoutRegistry()

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
      const target = nav.navigate(
        "down",
        makeState("col0"),
        emptyRepo,
        registry,
      )
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
    const registry = createLayoutRegistry()

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
      expect(
        nav.navigate("left", makeState("board"), repo, registry),
      ).toBeNull()
      expect(
        nav.navigate("right", makeState("board"), repo, registry),
      ).toBeNull()
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
