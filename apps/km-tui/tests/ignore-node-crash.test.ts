/**
 * Bug: IGNORE_NODE crashes with EROFS on fake/readonly repos
 *
 * Bead: km-bc1xj
 *
 * When pressing "C" (ignore_node) in a testEnv with fake repo (path="/fake"),
 * `handleIgnoreNode` calls `addIgnored(repo.path, ignorePath)` which tries
 * `mkdirSync("/fake/.km")` and crashes with EROFS (read-only file system).
 *
 * Fix: handleIgnoreNode should catch filesystem errors and show a toast,
 * or addIgnored should handle the EROFS/ENOENT gracefully.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Bug: IGNORE_NODE crashes on fake repos (km-bc1xj)", () => {
  function makeBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("col1", item("Task A"), item("Task B")),
          item("col2", item("Task C")),
        ),
      { columns: 80, rows: 24 },
    )
  }

  test("pressing C (ignore_node) does not crash on fake repo", () => {
    const { board } = makeBoard()

    // Cursor should be on first card
    const before = board.screenshot()
    expect(before).toContain("Task A")

    // Press C to ignore node — should not throw
    expect(() => board.press("C")).not.toThrow()

    // Board should still be usable
    const after = board.screenshot()
    expect(after).not.toContain("[object Object]")
    expect(after).not.toContain("TypeError")
    expect(after).not.toContain("EROFS")
  })

  test("pressing C shows error toast instead of crashing", () => {
    const { board } = makeBoard()

    board.press("C")

    // Should show some kind of feedback (error toast or status), not crash
    // At minimum, the board should still render
    const text = board.screenshot()
    expect(text).toContain("col1")
  })
})
