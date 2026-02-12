/**
 * Exploration: Extended detail pane tests — more interactions, edge cases
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

describe("Exploration: Detail Pane Extended", () => {
  test("detail pane on task with embeds", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("task-with-embed"), item("B")))
      for (const n of nodes) {
        if (n.id === "task-with-embed") {
          n.type = "task"
          n.task_status = "todo"
          n.task_mark = " "
          n.content = "Review @john about #budget for +work"
        }
      }
      return nodes
    })
    const bugs: string[] = []

    // Open detail pane on task with references
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane with referenced task")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane on node with backlinks", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("target"), item("B")))
      return nodes
    })
    const bugs: string[] = []

    board.press("i") // open detail on target

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane with backlinks")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane toggle rapid open/close cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Rapid open/close cycles
    for (let i = 0; i < 5; i++) {
      board.press("i")
      board.press("Escape")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid detail pane toggle")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane with status toggle x while open", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("A"), item("B")))
      for (const n of nodes) {
        if (n.id === "A" || n.id === "B") {
          n.type = "task"
          n.task_status = "todo"
          n.task_mark = " "
        }
      }
      return nodes
    })
    const bugs: string[] = []

    // Open detail pane
    board.press("i")
    // x should still work (toggle task done) — might close detail or toggle through it
    board.press("x")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x with detail pane open")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane on empty column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2")),
    )
    const bugs: string[] = []

    // Navigate to col2 (empty)
    board.press("k") // col1 header
    board.press("l") // col2 header

    // Try to open detail pane on column header
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage when opening detail on empty column")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane across all view modes", () => {
    for (const viewMode of ["cards", "columns", "list"] as const) {
      const { board } = testEnv(
        () => item("board", item("col1", item("A"), item("B"))),
        { viewMode },
      )
      const bugs: string[] = []

      board.press("i")
      board.press("j")
      board.press("Escape")

      const text = board.screenshot()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push(`garbage in detail pane in ${viewMode} view`)
      }
      expect(bugs).toEqual([])
    }
  })

  test("detail pane then Tab indent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Open detail pane on A
    board.press("i")
    // Close
    board.press("Escape")
    // Navigate to B and indent
    board.press("j") // → B
    board.press("Tab")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane then indent")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane with very long content", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("long-task"), item("B")))
      for (const n of nodes) {
        if (n.id === "long-task") {
          n.content = "A".repeat(200) + " @john #tag +project [[wikilink]] and more text"
        }
      }
      return nodes
    })
    const bugs: string[] = []

    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane with long content")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane after batch delete", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Select and delete B,C
    board.press("j") // → B
    board.press("J") // anchor=B, cursor→C
    board.press("J") // range B→D
    board.press("Backspace") // delete B,C,D

    // Open detail pane on remaining item
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane after batch delete")
    }
    expect(bugs).toEqual([])
  })
})
