/**
 * Exploration: Mixed stress sequences — long sequences combining many operations
 * to find interaction bugs that single-operation tests miss.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Mixed Stress", () => {
  test("nav + fold + depth + dup + undo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("k") // → parent
    board.press("z").press("a") // fold
    board.press("<") // decrease depth
    board.press("j") // → B
    board.press("d") // dup B
    board.press("Ctrl+Z") // undo
    board.press(">") // increase depth
    board.press("z").press("a") // unfold

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after complex nav+fold+depth+dup+undo")
    }
    expect(bugs).toEqual([])
  })

  test("search + detail + edit + task status cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("Task A", "todo"),
        item("B"),
        item.task("Task C", "wip"),
      )),
    )
    const bugs: string[] = []

    board.press("/") // search
    board.press("Escape")
    board.press(" ") // detail pane
    board.press("Escape")
    board.press("Enter") // inline edit
    board.press("Escape")
    board.press("x") // cycle status
    board.press("j") // → B
    board.press("j") // → Task C
    board.press("x") // cycle status on C

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after search+detail+edit+status sequence")
    }
    expect(bugs).toEqual([])
  })

  test("zoom + shift + fold + gg/G", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("c1"),
          item("c2"),
          item("c3"),
        ),
        item("B"),
        item("C"),
        item("D"),
      )),
    )
    const bugs: string[] = []

    board.press("i") // zoom into parent
    board.press("Alt+j") // shift c1 down
    board.press("u") // zoom out
    board.press("z").press("a") // fold parent
    board.press("G") // go to last
    board.press("g").press("g") // go to first
    board.press("z").press("a") // unfold

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom+shift+fold+gg/G")
    }
    expect(bugs).toEqual([])
  })

  test("selection + dup + shift + undo sequence", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A"), item("B"), item("C"), item("D"), item("E"),
      )),
    )
    const bugs: string[] = []

    board.press("J") // select A→B
    board.press("Escape") // clear selection
    board.press("d") // dup A
    board.press("Alt+j") // shift duplicate down
    board.press("Alt+j") // shift more
    board.press("Ctrl+Z") // undo dup
    board.press("G") // go to last
    board.press("J") // select extending up (if supported)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection+dup+shift+undo")
    }
    expect(bugs).toEqual([])
  })

  test("50 random-ish operations", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("A"),
        item("B"),
        item.task("T1", "todo"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    // Simulate a realistic user session
    const ops = [
      "j", "j", "j", "k", // navigate
      "d", // duplicate
      "j", // past duplicate
      "Alt+j", // shift down
      "k", "k", // back up
      "z", "a", // fold parent
      "<", // decrease depth
      ">", // restore depth
      "z", "a", // unfold
      "j", "j", "j", // navigate down
      "x", // cycle task status
      "x", // cycle again
      " ", // detail pane
      "Escape", // close detail
      "?", // help
      "Escape", // close help
      "n", // new item dialog
      "Escape", // close
      "/", // search
      "Escape", // close
      "g", "g", // go to first
      "G", // go to last
      "k", "k", // navigate up
      "Enter", // inline edit
      "Escape", // cancel
      "Ctrl+Z", // undo
      "Ctrl+Y", // redo
      "j", // navigate
      "+", // content lines
      "-", // content lines
      "j", "j", // navigate to end
    ]

    for (const op of ops) {
      board.press(op)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 50 random operations")
    }
    expect(bugs).toEqual([])
  })

  test("page nav + fold + detail + status on tall terminal", () => {
    const { board } = testEnv(
      () => {
        const items = Array.from({ length: 12 }, (_, i) =>
          i % 3 === 0 ? item.task(`task${i}`, "todo") : item(`item${i}`),
        )
        return item("board", item("col1", ...items))
      },
      { columns: 80, rows: 40 },
    )
    const bugs: string[] = []

    board.press("Ctrl+D") // page down
    board.press("x") // cycle task status (if on a task)
    board.press(" ") // detail pane
    board.press("Escape")
    board.press("Ctrl+U") // page up
    board.press("z").press("a") // fold (if on folder)
    board.press("G") // last
    board.press("Ctrl+U") // page up from bottom

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after page nav + fold + detail on tall terminal")
    }
    expect(bugs).toEqual([])
  })
})
