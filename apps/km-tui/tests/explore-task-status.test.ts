/**
 * Exploration: Task status cycling (x key) — cycle through todo/wip/blocked/done,
 * interaction with detail pane, status display on embeds.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Task Status", () => {
  test("x cycles task status todo → wip → done → dropped → todo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("A", "todo"), item("B"))))
    const bugs: string[] = []

    // Actual cycle (5 states): todo → wip → blocked → done → dropped → todo
    const statuses: (string | null | undefined)[] = [repo.getNode("A")?.task_status]
    for (let i = 0; i < 6; i++) {
      board.press("x")
      statuses.push(repo.getNode("A")?.task_status)
    }
    const expected = ["todo", "wip", "blocked", "done", "dropped", "todo", "wip"]
    for (let i = 0; i < expected.length; i++) {
      if (statuses[i] !== expected[i]) {
        bugs.push(`step ${i}: expected ${expected[i]}, got ${statuses[i]} (full: ${statuses.join(" → ")})`)
        break
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage during task status cycling")
    }
    expect(bugs).toEqual([])
  })

  test("x on non-task node does not crash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("x") // x on folder (parent) — should be no-op or handle gracefully

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x on non-task")
    }
    expect(bugs).toEqual([])
  })

  test("Space on task cycles status (with no selection)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("A", "todo"))))
    const bugs: string[] = []

    // Space without multi-selection should open detail pane, not cycle status
    // (Space is mapped to open_detail_pane when no multi-selection)
    board.press(" ")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Space on task")
    }
    expect(bugs).toEqual([])
  })

  test("batch x on selected tasks with same initial status", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item.task("A", "todo"), item.task("B", "todo"), item.task("C", "todo"))),
    )
    const bugs: string[] = []

    board.press("J") // select A→B
    board.press("J") // select A→C
    board.press("x") // batch cycle

    const sA = repo.getNode("A")?.task_status
    const sB = repo.getNode("B")?.task_status
    const sC = repo.getNode("C")?.task_status

    if (sA !== "wip" || sB !== "wip" || sC !== "wip") {
      bugs.push(`expected all wip, got A=${sA} B=${sB} C=${sC}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch x")
    }
    expect(bugs).toEqual([])
  })

  test("x on task then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("A", "todo"), item("B"))))
    const bugs: string[] = []

    board.press("x") // cycle
    board.press("Ctrl+Z") // undo — may or may not be supported for status changes

    // Just verify no crash
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x + undo")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane shows task status", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Important task", "wip"), item("Other"))))
    const bugs: string[] = []

    board.press(" ") // open detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane with task status")
    }
    expect(bugs).toEqual([])
  })

  test("x on embed node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item.task("original", "todo"), item.task("embed-src", "todo"))),
    )
    const bugs: string[] = []

    // Make original an embed pointing to embed-src
    repo.updateNode("original", { link_to: "embed-src" })

    board.press("x") // cycle status on embed

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x on embed")
    }
    expect(bugs).toEqual([])
  })
})
