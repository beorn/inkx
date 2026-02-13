/**
 * Exploration: Different node types — tasks, paragraphs, sections, folders,
 * quotes. Ensure rendering and operations work across all types.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Node Types", () => {
  test("board with mixed node types", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("Task 1", "todo"),
        item("Regular item"),
        item.paragraph("A paragraph node"),
        item.task("Task 2", "wip"),
        item("Folder", item("child1"), item("child2")),
      )),
    )
    const bugs: string[] = []

    // Navigate through all types
    for (let i = 0; i < 6; i++) board.press("j")
    for (let i = 0; i < 6; i++) board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage navigating mixed node types")
    }
    expect(bugs).toEqual([])
  })

  test("x on task among non-tasks", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("Regular"),
        item.task("My Task", "todo"),
        item("Another regular"),
      )),
    )
    const bugs: string[] = []

    board.press("j") // → My Task
    board.press("x") // cycle task status
    board.press("j") // → Another regular
    board.press("x") // x on non-task — should be no-op

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x on mixed types")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate task preserves type", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item.task("Original", "wip"),
        item("B"),
      )),
    )
    const bugs: string[] = []

    board.press("d") // duplicate task

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after duplicating task")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane on paragraph node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.paragraph("This is a paragraph with some text content"),
        item("B"),
      )),
    )
    const bugs: string[] = []

    board.press(" ") // detail pane on paragraph

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane on paragraph")
    }
    expect(bugs).toEqual([])
  })

  test("fold folder among tasks", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("T1", "todo"),
        item("Folder", item("c1"), item("c2")),
        item.task("T2", "done"),
      )),
    )
    const bugs: string[] = []

    board.press("j") // → Folder
    board.press("z").press("a") // fold
    board.press("j") // → T2
    board.press("x") // cycle T2 status

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold among tasks")
    }
    expect(bugs).toEqual([])
  })

  test("inline edit on task node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("Edit me", "todo"),
        item("B"),
      )),
    )
    const bugs: string[] = []

    board.press("Enter") // inline edit on task
    board.press("Escape") // cancel

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after inline edit on task")
    }
    expect(bugs).toEqual([])
  })

  test("section node operations", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.section("Section Header"),
        item("Regular"),
        item.section("Another Section"),
      )),
    )
    const bugs: string[] = []

    board.press("j") // navigate to Regular
    board.press("j") // navigate to Another Section
    board.press("d") // duplicate section
    board.press("Ctrl+Z") // undo

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after section operations")
    }
    expect(bugs).toEqual([])
  })

  test("quote node with detail pane", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.quote("A quoted text block"),
        item("Regular"),
      )),
    )
    const bugs: string[] = []

    board.press(" ") // detail pane on quote
    board.press("Escape")
    board.press("j")
    board.press(" ") // detail on regular

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after quote + detail pane")
    }
    expect(bugs).toEqual([])
  })
})
