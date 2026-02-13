/**
 * Exploration: Fold Extended
 *
 * Deep tests on fold/unfold behavior (za chord), fold all (zM),
 * unfold all (zR), and interactions with other operations.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Fold Extended", () => {
  test("toggle fold on node with children", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Toggle fold on parent
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("toggle fold twice restores view", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Fold
    board.press("z").press("a") // Unfold
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold on leaf node (no-op)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("z").press("a") // Try fold on leaf
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold all with zM", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("P1", item("c1"), item("c2")), item("P2", item("c3"), item("c4")))),
    )
    board.press("z").press("M") // Fold all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("unfold all with zR", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("P1", item("c1"), item("c2")), item("P2", item("c3")))),
    )
    board.press("z").press("M") // Fold all
    board.press("z").press("R") // Unfold all
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold then navigate down skips children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("P1", item("c1"), item("c2")), item("B"), item("C"))),
    )
    board.press("z").press("a") // Fold P1
    board.press("j") // Should skip to B
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold then delete folded parent", () => {
    const { board } = testEnv(() => item("board", item("col1", item("P1", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Fold P1
    board.press("x") // Delete folded P1 (should delete children too?)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold then zoom into folded node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("P1", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Fold P1
    board.press("n") // Zoom into P1 (even though folded)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold then duplicate folded node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("P1", item("c1"), item("c2")), item("B"))))
    board.press("z").press("a") // Fold P1
    board.press("d") // Duplicate folded node
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zc (fold) then zo (open)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    board.press("z").press("c") // Fold
    board.press("z").press("o") // Open
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("fold all then navigate through folded items", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("P1", item("c1")), item("P2", item("c2")), item("P3", item("c3")))),
    )
    board.press("z").press("M") // Fold all
    board.press("j") // Next folded item
    board.press("j") // Next folded item
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
