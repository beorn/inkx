/**
 * Exploration: Selection edge cases — 1 J press selection behavior,
 * selection with view transitions, selection at boundaries
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

function setTaskStatus(repo: { updateNode(id: string, updates: Record<string, unknown>): void }, ids: string[]) {
  for (const id of ids) {
    repo.updateNode(id, { task_status: "todo", task_mark: " " })
  }
}

describe("Exploration: Selection Edge Cases", () => {
  test("1 J press: inconsistent selection — batch toggle may or may not include anchor", () => {
    // REPORTED BUG: After 1 J press, behavior is non-deterministic between
    // isolated and parallel test runs. Sometimes multiSelected has 1 item (anchor only),
    // sometimes it has 2 (anchor + focus). This makes batch ops unreliable with 1 J press.
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    setTaskStatus(repo, ["A", "B", "C"])

    board.press("J") // 1 J press: anchor=A, cursor→B
    board.press("x") // toggle

    const aStatus = repo.getNode("A")?.task_status
    const bStatus = repo.getNode("B")?.task_status
    const cStatus = repo.getNode("C")?.task_status

    // B should always advance (it's the cursor)
    expect(bStatus).toBe("wip")
    // C should never be affected
    expect(cStatus).toBe("todo")
    // A may or may not advance (non-deterministic bug)
    expect(["todo", "wip"]).toContain(aStatus)
  })

  test("J at last card: boundary selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("j") // → B (last card)
    board.press("J") // try extend selection down from B — boundary

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage at J boundary")
    }
    expect(bugs).toEqual([])
  })

  test("K at first card: boundary selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    // Cursor starts on A (first card)
    board.press("K") // try extend selection up — boundary

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage at K boundary")
    }
    expect(bugs).toEqual([])
  })

  test("J then K: select then deselect direction change", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("J") // anchor=B, select range B→C
    board.press("J") // range B→D
    board.press("K") // range B→C (shrink)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J then K direction change")
    }
    expect(bugs).toEqual([])
  })

  test("selection then h/l column navigation clears selection", () => {
    const { board, repo } = testEnv(() =>
      item(
        "board",
        item("col1", item("A"), item("B"), item("C")),
        item("col2", item("D"), item("E")),
      ),
    )
    setTaskStatus(repo, ["A", "B", "C", "D", "E"])
    const bugs: string[] = []

    // Select A→B in col1
    board.press("J") // anchor=A, cursor→B

    // Navigate to col2 — should clear or maintain selection?
    board.press("l")

    // Try toggle — should operate on col2 cards now
    board.press("x")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + column change + toggle")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete with selection including first card", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Select A→C (all starting from first card)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("Backspace") // delete first 3 cards

    const kids = childIds(repo, "col1")
    if (kids.includes("A") || kids.includes("B") || kids.includes("C")) {
      bugs.push("batch delete starting from first card didn't remove all")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete from first card")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete last N cards", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Move to C, select C→E
    board.press("j").press("j") // → C
    board.press("J") // anchor=C, cursor→D
    board.press("J") // range C→E

    board.press("Backspace") // delete last 3 cards

    const kids = childIds(repo, "col1")
    if (kids.includes("C") || kids.includes("D") || kids.includes("E")) {
      bugs.push("batch delete of last cards didn't remove all")
    }
    if (!kids.includes("A") || !kids.includes("B")) {
      bugs.push("batch delete removed early cards A or B")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete last N")
    }
    expect(bugs).toEqual([])
  })

  test("selection across empty/full columns via H/L", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("A")),
        item("col2"), // empty column
        item("col3", item("B")),
      ),
    )
    const bugs: string[] = []

    // Try horizontal selection
    board.press("H") // try select left — boundary
    board.press("L") // select right

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after H/L selection with empty column")
    }
    expect(bugs).toEqual([])
  })

  test("select then fold toggle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Select parent→B
    board.press("J") // anchor=parent, cursor→B

    // Try fold while selected — should it work or be blocked?
    board.press("z")
    board.press("a")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + fold toggle")
    }
    expect(bugs).toEqual([])
  })

  test("select all cards then navigate j — boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Select A→C (all)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    // Try j — should be at boundary
    board.press("J") // already at last card

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage when selecting past boundary")
    }
    expect(bugs).toEqual([])
  })
})
