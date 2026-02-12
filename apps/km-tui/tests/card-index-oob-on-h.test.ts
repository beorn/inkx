/**
 * Regression: card index out of bounds on column navigation (h key)
 *
 * After a sequence of mixed operations (create, indent, navigate, view switch,
 * zoom), pressing "h" throws:
 *   Error: [nav] card index 2 out of bounds (2 cards)
 *
 * Root cause: After operations that change column sizes, the cardIndex from
 * layoutRegistry.findCardAtYVisual() can exceed the target column's actual
 * card count. The returned index is not clamped to targetCards.length - 1
 * in navigateHorizontal() (view-navigation.ts lines 238-239).
 *
 * Bug: km-53uqt
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("card index out of bounds on h", () => {
  test("h does not throw after mixed operations that change column sizes", () => {
    const { board } = testEnv(() =>
      item("board",
        item("projects",
          item("proj-a", item("task-a1"), item("task-a2"), item("task-a3", item("sub-1"), item("sub-2"))),
          item("proj-b", item("task-b1"), item("task-b2")),
        ),
        item("areas",
          item("health", item("exercise"), item("diet")),
          item("finance", item("budget"), item("invest")),
          item("learning", item("books"), item("courses")),
        ),
        item("inbox", item("note-1"), item("note-2"), item("note-3")),
      ),
    )

    // Deterministic PRNG (seed=99) producing the failing sequence
    let seed = 99
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "v", "<", ">", "e", "u", "n", "Tab", "Shift+Tab"]
    const editOps = ["Escape", "Enter"]
    let inEdit = false

    for (let i = 0; i <= 147; i++) {
      let op: string
      if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
      }

      if (i === 147) {
        // This is "h" and should NOT throw — card index must be clamped
        expect(() => board.press(op)).not.toThrow()
      } else {
        try { board.press(op) } catch { inEdit = false }
      }
    }
  })
})
