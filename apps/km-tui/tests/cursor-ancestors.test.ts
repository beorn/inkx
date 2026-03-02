// NOTE: This is a pure state test (no screen assertions). It belongs in km-board
// but can't move yet because the source module (cursor-store.ts) lives in
// km-tui/src. Move this test when cursor-store.ts migrates to @km/board.
import { describe, it, expect } from "vitest"
import { deriveCursorAncestors } from "../src/cursor-store.ts"

describe("deriveCursorAncestors", () => {
  const nodes: Record<string, { parent_id: string | null; type: string; item?: boolean }> = {
    board: { parent_id: null, type: "h", item: true },
    col1: { parent_id: "board", type: "h", item: true },
    A: { parent_id: "board", type: "h", item: true }, // After outdent
    B: { parent_id: "col1", type: "h", item: true },
    deep: { parent_id: "B", type: "h", item: true },
    para: { parent_id: "board", type: "p" }, // Body card
  }
  const getNode = (id: string) => nodes[id] ?? null

  it("column-level: oi child of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "A")
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: "A",
      selectionLevel: "column",
    })
  })

  it("card-level: grandchild of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "B")
    expect(result).toEqual({
      cursorCardNodeId: "B",
      cursorColumnNodeId: "col1",
      selectionLevel: "card",
    })
  })

  it("deep: cursor inside card", () => {
    const result = deriveCursorAncestors(getNode, "board", "deep")
    expect(result).toEqual({
      cursorCardNodeId: "B",
      cursorColumnNodeId: "col1",
      selectionLevel: "card",
    })
  })

  it("body card: non-oi child of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "para")
    expect(result).toEqual({
      cursorCardNodeId: "para",
      cursorColumnNodeId: "__body__board",
      selectionLevel: "card",
    })
  })

  it("virtual body column header", () => {
    const result = deriveCursorAncestors(getNode, "board", "__body__board")
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: "__body__board",
      selectionLevel: "column",
    })
  })

  it("board level: null cursor", () => {
    const result = deriveCursorAncestors(getNode, "board", null)
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: null,
      selectionLevel: "board",
    })
  })
})
