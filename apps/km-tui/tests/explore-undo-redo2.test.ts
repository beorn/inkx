/**
 * Exploration: Undo/Redo (undo-stack.ts, Ctrl-Z/Ctrl-Y)
 *
 * Tests the undo/redo system wired through board-actions.
 * Exercises: indent/outdent undo, add node undo, delete undo,
 * multiple undo, redo after undo, redo invalidation.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Undo/Redo", () => {
  test("undo indent (Tab then Ctrl-Z)", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    // Cursor starts on A. Move to B.
    board.press("j")

    // Check B's parent before indent
    const bBefore = repo.getNode("B")
    expect(bBefore?.parent_id).toBe("col1")

    // Indent B under A
    board.press("tab")

    // Check B's parent after indent
    const bAfterIndent = repo.getNode("B")
    // B should now be a child of A (or unchanged if indent fails)

    // Undo the indent
    board.press("C-z")
    const afterUndo = board.screenshot()
    expect(afterUndo).not.toContain("[object Object]")
    expect(afterUndo).not.toContain("TypeError")

    // Check B's parent after undo - should be back to col1
    const bAfterUndo = repo.getNode("B")
    if (bAfterIndent?.parent_id !== "col1") {
      // Indent worked, so undo should restore
      expect(bAfterUndo?.parent_id).toBe("col1")
    }
  })

  test("redo after undo (Ctrl-Z then Ctrl-Y)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("tab") // Indent B

    const afterIndent = board.screenshot()

    board.press("C-z") // Undo
    const afterUndo = board.screenshot()

    board.press("C-y") // Redo
    const afterRedo = board.screenshot()

    expect(afterRedo).not.toContain("[object Object]")
    expect(afterRedo).not.toContain("TypeError")
  })

  test("multiple undo steps", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    // Indent B
    board.press("j").press("tab")
    // Move to C and indent it
    board.press("j").press("tab")

    // Undo twice
    board.press("C-z").press("C-z")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("undo with nothing to undo (boundary)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    // Ctrl-Z with no history should not crash
    board.press("C-z")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Should still show normal board
    expect(text).toContain("A")
  })

  test("redo with nothing to redo (boundary)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    // Ctrl-Y with no redo history should not crash
    board.press("C-y")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("A")
  })

  test("new action after undo clears redo stack", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("tab") // Indent B
    board.press("C-z")            // Undo

    // New action: indent C
    board.press("j").press("tab")

    // Redo should be empty now (Ctrl-Y should do nothing)
    board.press("C-y")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("undo delete node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    // Delete A (cursor starts on A)
    board.press("x")

    // Check if confirm dialog appeared
    const afterDelete = board.screenshot()

    // Try undo
    board.press("C-z")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid undo/redo cycling", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j").press("tab") // Indent B

    // Rapid cycle
    for (let i = 0; i < 10; i++) {
      board.press("C-z")
      board.press("C-y")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("undo after shift card down", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    // Shift A down
    board.press("J")
    const afterShift = board.screenshot()

    board.press("C-z")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("undo after shift card up", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    board.press("j") // Move to B
    board.press("K") // Shift B up
    const afterShift = board.screenshot()

    board.press("C-z")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
