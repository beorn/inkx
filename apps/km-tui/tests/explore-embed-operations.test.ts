/**
 * Exploration: Embed (link_to) node operations — duplicate, delete, fold,
 * status changes, move operations on embeds.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Embed Operations", () => {
  test("duplicate embed node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item.task("original", "todo"),
        item.task("target", "wip"),
      )),
    )
    const bugs: string[] = []

    // Make original an embed of target
    repo.updateNode("original", { link_to: "target" })
    board.press("d") // duplicate the embed

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after duplicating embed")
    }
    expect(bugs).toEqual([])
  })

  test("delete embed node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("embed-node"),
        item.task("target", "todo"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-node", { link_to: "target" })
    board.press("Backspace") // delete embed

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting embed")
    }
    expect(bugs).toEqual([])
  })

  test("fold embed parent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("embed-child"),
          item("regular-child"),
        ),
        item("B"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-child", { link_to: "B" })
    board.press("z").press("a") // fold parent

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after folding parent with embed child")
    }
    expect(bugs).toEqual([])
  })

  test("move embed with Alt+j", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("embed-node"),
        item.task("target", "todo"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-node", { link_to: "target" })
    board.press("Alt+j") // move embed down

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after moving embed down")
    }
    expect(bugs).toEqual([])
  })

  test("navigate through embeds", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("A"),
        item("embed1"),
        item("embed2"),
        item("D"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed1", { link_to: "A" })
    repo.updateNode("embed2", { link_to: "D" })

    board.press("j") // → embed1
    board.press("j") // → embed2
    board.press("j") // → D
    board.press("k") // → embed2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after navigating through embeds")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane on embed", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("embed-node"),
        item.task("target", "wip"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-node", { link_to: "target" })
    board.press(" ") // detail pane on embed

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane on embed")
    }
    expect(bugs).toEqual([])
  })

  test("inline edit on embed", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("embed-node"),
        item.task("target", "todo"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-node", { link_to: "target" })
    board.press("Enter") // inline edit on embed
    board.press("Escape") // cancel

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after inline edit on embed")
    }
    expect(bugs).toEqual([])
  })

  test("select embed then batch delete", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("embed-node"),
        item.task("target", "todo"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    repo.updateNode("embed-node", { link_to: "target" })
    board.press("J") // select embed → target
    board.press("Backspace") // batch delete

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete with embed")
    }
    expect(bugs).toEqual([])
  })
})
