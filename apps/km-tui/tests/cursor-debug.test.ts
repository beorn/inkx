import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { deriveCursorAncestors } from "../src/cursor-store.ts"

describe("cursor ancestors after outdent", () => {
  it("outdented li node becomes structural column (after oi sibling)", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    board.press("Shift+Tab") // outdent A to board level

    // A is now type "p" at board level, placed after col1 (h)
    const nodeA = repo.getNode("A")
    expect(nodeA?.parent_id).toBe("board")
    expect(nodeA?.type).toBe("p")

    // CursorStore: A is after col1 (h) in sibling order → structural column
    const cs = store.getState().cursorStore.getState()
    expect(cs.cursorNodeId).toBe("A")
    expect(cs.cursorCardNodeId).toBeNull()
    expect(cs.cursorColumnNodeId).toBe("A")
    expect(cs.selectionLevel).toBe("column")

    // deriveCursorAncestors agrees when given getChildren
    const rootId = store.getState().rootId
    const ancestors = deriveCursorAncestors(
      (id) => repo.getNode(id),
      rootId,
      "A",
      (pid) => repo.getChildren(pid),
    )
    expect(ancestors.cursorColumnNodeId).toBe("A")
    expect(ancestors.selectionLevel).toBe("column")

    // Rendered: A shows as selected column with data-cursor on header
    expect(board.q("[data-cursor]").count()).toBe(1)
    expect(board.q("[data-cursor]").textContent()).toContain("A")
  })
})
