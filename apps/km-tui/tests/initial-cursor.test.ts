/**
 * Tests for computeInitialCursor — the lens-derived initial cursor for fresh
 * board opens.
 *
 * The motivating bug: `km view beads` (bare scope) opened with cursor on a
 * sub-block deep inside a bead, instead of at the scope root. See bead
 * @km/tui/bare-scope-snap-to-root.
 */

import { describe, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createViewLens, createVisibleLens } from "@km/board"
import { item } from "./helpers/board-test.ts"
import { computeInitialCursor } from "../src/initial-cursor.ts"

function makeLens(nodes: ReturnType<typeof item>, rootId: string | null) {
  const repo = createFakeRepo({ nodes })
  return createVisibleLens(createViewLens(repo, { rootId, foldDepths: new Map() }))
}

describe("computeInitialCursor", () => {
  describe("default behavior (depth-2 firstCard)", () => {
    it("returns first card of first column on a kanban board", () => {
      // board > col0 > c0, c1, c2 ; col1 > c3
      const lens = makeLens(
        item("board", item("col0", item("c0"), item("c1"), item("c2")), item("col1", item("c3"))),
        "board",
      )
      expect(computeInitialCursor(lens, "board")).toBe("c0")
    })

    it("falls back to first column when the column has no cards", () => {
      const lens = makeLens(item("board", item("col0"), item("col1")), "board")
      expect(computeInitialCursor(lens, "board")).toBe("col0")
    })

    it("returns null when rootId has no children", () => {
      const lens = makeLens(item("board"), "board")
      expect(computeInitialCursor(lens, "board")).toBeNull()
    })

    it("returns null when rootId is null", () => {
      const lens = makeLens(item("board", item("col0")), "board")
      expect(computeInitialCursor(lens, null)).toBeNull()
    })
  })

  describe("bareScopeArrival (depth-1 firstChild)", () => {
    it("snaps to first child of root, even when grandchildren exist", () => {
      // Mirrors @km/beads: directory contains bead files (each with sub-blocks).
      // First "column" position is a bead file; first "card" position is a sub-block.
      const lens = makeLens(
        item(
          "@km/beads",
          item("km-beads.detailed-test-spec", item("N478XNBJ"), item("N9YYAAB")),
          item("km-beads.cutover", item("AAA"), item("BBB")),
        ),
        "@km/beads",
      )
      // Default: too deep — lands on a sub-block of the first bead
      expect(computeInitialCursor(lens, "@km/beads")).toBe("N478XNBJ")
      // bareScopeArrival: snaps to first bead file
      expect(computeInitialCursor(lens, "@km/beads", { bareScopeArrival: true })).toBe("km-beads.detailed-test-spec")
    })

    it("on kanban-style root, snaps to first column (still useful, less surprising than a card)", () => {
      const lens = makeLens(item("board", item("col0", item("c0"), item("c1")), item("col1")), "board")
      expect(computeInitialCursor(lens, "board", { bareScopeArrival: true })).toBe("col0")
    })

    it("returns null when root has no children", () => {
      const lens = makeLens(item("board"), "board")
      expect(computeInitialCursor(lens, "board", { bareScopeArrival: true })).toBeNull()
    })
  })
})
