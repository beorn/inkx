/**
 * Exploration: Fold/Unfold + Borders
 *
 * Tests fold/unfold interactions which had recent changes
 * in ColumnsView.tsx (fold/unfold borders).
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Fold/Unfold + Borders", () => {
  test("fold node with za chord (toggle fold)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    // Cursor on parent, use za chord to toggle fold
    board.press("z").press("a")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Children should be hidden after folding
    expect(text).not.toContain("child1")
    expect(text).not.toContain("child2")
  })

  test("unfold node with za chord (toggle)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    board.press("z").press("a") // Fold
    board.press("z").press("a") // Unfold
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold all with zM chord", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("p1", item("c1"), item("c2")), item("p2", item("c3"), item("c4")), item("leaf"))),
    )
    board.press("z").press("M") // Fold all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Children should be hidden
    expect(text).not.toContain("c1")
    expect(text).not.toContain("c3")
  })

  test("unfold all with zR chord", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("p1", item("c1"), item("c2")), item("p2", item("c3"), item("c4")))),
    )
    board.press("z").press("M") // Fold all
    board.press("z").press("R") // Unfold all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
  })

  test("fold then navigate past folded item", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"), item("C"))),
    )
    board.press("z").press("a") // Toggle fold parent
    board.press("j") // Move to B (should skip children)
    board.press("j") // Move to C
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold deeply nested tree", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("L1", item("L2", item("L3", item("L4", item("deep leaf"))))), item("Other"))),
    )
    board.press("z").press("a") // Toggle fold L1
    const text = board.screenshot()
    expect(text).not.toContain("deep leaf")
    expect(text).not.toContain("[object Object]")
  })

  test("fold, delete, then navigate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("child1")), item("B"), item("C"))))
    board.press("z").press("a") // Toggle fold parent
    board.press("j") // Move to B
    board.press("x") // Delete B
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold then indent", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("parent", item("child1")), item("C"))))
    // Move to parent and fold
    board.press("j")
    board.press("z").press("a") // Toggle fold
    // Indent folded node
    board.press("tab")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("collapse column with c", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    // c toggles column collapse
    board.press("c")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("rapid fold/unfold cycling", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    for (let i = 0; i < 20; i++) {
      board.press("z").press("a") // Toggle fold
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold with selection active", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"), item("C"))),
    )
    board.press("v") // Select parent
    board.press("S-j") // Extend to B
    board.press("z").press("a") // Toggle fold — should fold parent and/or clear selection
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
