import { describe, it, expect } from "vitest"
import { deriveCursorAncestors } from "../src/cursor-store.ts"

describe("deriveCursorAncestors", () => {
  const nodes: Record<string, { parent_id: string | null; type: string }> = {
    board: { parent_id: null, type: "oi" },
    col1: { parent_id: "board", type: "oi" },
    A: { parent_id: "board", type: "oi" }, // After outdent
    B: { parent_id: "col1", type: "oi" },
    deep: { parent_id: "B", type: "oi" },
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
