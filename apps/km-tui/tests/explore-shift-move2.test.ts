/**
 * Exploration: Shift Move (reorder)
 *
 * Tests Meta+J/K for reordering items within columns and
 * Meta+H/L for moving items across columns.
 * Keybindings: M-j=shift_down, M-k=shift_up, M-h=shift_left, M-l=shift_right
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Shift Move", () => {
  test("shift item down with M-j", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("Alt+j") // Shift A down (swap with B)
    const children = repo.getChildren("col1").map((c) => c.content)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // A should now be after B
    expect(children[0]).toBe("B")
    expect(children[1]).toBe("A")
  })

  test("shift item up with M-k", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("j") // Move to B
    board.press("Alt+k") // Shift B up (swap with A)
    const children = repo.getChildren("col1").map((c) => c.content)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(children[0]).toBe("B")
    expect(children[1]).toBe("A")
  })

  test("shift first item up is no-op", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("Alt+k") // Try to shift A up — already first
    const children = repo.getChildren("col1").map((c) => c.content)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(children[0]).toBe("A") // Unchanged
  })

  test("shift last item down is no-op", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("j") // Move to B
    board.press("Alt+j") // Try to shift B down — already last
    const children = repo.getChildren("col1").map((c) => c.content)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(children[1]).toBe("B") // Unchanged
  })

  test("shift down multiple times", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    board.press("Alt+j") // A swaps with B → [B,A,C,D]
    board.press("Alt+j") // A swaps with C → [B,C,A,D]
    board.press("Alt+j") // A swaps with D → [B,C,D,A]
    const children = repo.getChildren("col1").map((c) => c.content)
    expect(children[3]).toBe("A") // A moved to end
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("shift then undo (shift undo may not be implemented)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("Alt+j") // Shift A down
    board.press("C-z") // Undo — may or may not reverse the shift
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("shift left across columns (already leftmost)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    board.press("Alt+h") // Shift left (already leftmost — no-op)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("shift right across columns", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    board.press("Alt+l") // Shift A to col2
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("shift down then up restores order", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("Alt+j") // A down
    board.press("Alt+k") // A back up
    const children = repo.getChildren("col1").map((c) => c.content)
    expect(children[0]).toBe("A")
    expect(children[1]).toBe("B")
    expect(children[2]).toBe("C")
  })

  test("rapid shift sequence", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))
    board.press("Alt+j").press("Alt+j").press("Alt+j").press("Alt+j") // A to end
    board.press("Alt+k").press("Alt+k").press("Alt+k").press("Alt+k") // A back to start
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("A")
    expect(text).toContain("E")
  })
})
