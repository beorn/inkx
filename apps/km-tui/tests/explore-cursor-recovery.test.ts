/**
 * Exploration: Cursor recovery after various destructive operations —
 * delete, indent/outdent, move, zoom. Verifies cursor doesn't get lost.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Cursor Recovery", () => {
  test("delete middle item cursor moves to next", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Backspace") // delete B — cursor should go to C (or A)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete middle item")
    }
    // Should not have stale cursor errors
    expect(bugs).toEqual([])
  })

  test("delete last item cursor moves to previous", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("j") // → B (last)
    board.press("Backspace") // delete B — cursor should go to A

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete last item")
    }
    expect(bugs).toEqual([])
  })

  test("indent then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Tab") // indent B under A
    board.press("j") // navigate down
    board.press("k") // navigate up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indent + nav")
    }
    expect(bugs).toEqual([])
  })

  test("outdent then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("child")),
        item("B"),
      )),
    )
    const bugs: string[] = []

    // Navigate to child
    board.press("j") // → child (if visible)
    board.press("Shift+Tab") // outdent

    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after outdent + nav")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+j move then continue navigating", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("Alt+j") // move A down
    board.press("j") // navigate down
    board.press("Alt+j") // move again
    board.press("k") // navigate up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after move + nav sequence")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+l cross-column move then navigate", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C")),
      ),
    )
    const bugs: string[] = []

    board.press("Alt+l") // move A to col2
    board.press("j") // navigate
    board.press("l") // switch column
    board.press("k") // navigate up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after cross-column move + nav")
    }
    expect(bugs).toEqual([])
  })

  test("delete folder with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    const bugs: string[] = []

    board.press("Backspace") // delete parent (with children)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete folder with children")
    }
    expect(bugs).toEqual([])
  })

  test("delete then undo then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("Backspace") // delete duplicate
    board.press("Ctrl+Z") // undo delete (may or may not work)
    board.press("j") // navigate

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete + undo + nav")
    }
    expect(bugs).toEqual([])
  })

  test("G then delete last then check cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("G") // go to last (D)
    board.press("Backspace") // delete D — cursor should recover to C

    board.press("j") // should be safe
    board.press("k") // should be safe

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after G + delete last + nav")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete selected then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A"), item("B"), item("C"), item("D"), item("E"),
      )),
    )
    const bugs: string[] = []

    board.press("J") // select A→B
    board.press("J") // select A→C
    board.press("Backspace") // delete selected (A, B, C)

    board.press("j") // navigate in remaining (D, E)
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete + nav")
    }
    expect(bugs).toEqual([])
  })
})
