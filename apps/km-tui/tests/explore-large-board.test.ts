/**
 * Exploration: Large board stress test
 *
 * Tests cursor stability with boards resembling @next.md:
 * - Columns with 50+ items (many embeds)
 * - Empty column headers
 * - Mixed content types (embeds, sections, tasks)
 * - Rapid navigation across large boards
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function cursorCheck(board: ReturnType<typeof testEnv>["board"]) {
  const el = board.q("[data-cursor]")
  return {
    exists: el ? el.count() > 0 : false,
    text: el?.textContent() ?? "(none)",
  }
}

describe("Exploration: large board", () => {
  /** Build a board resembling @next.md with many embeds */
  function largeBoardLikeNext() {
    return testEnv(() => {
      // Build many items for the "processing" column — like @next.md
      const processingItems: ReturnType<typeof item>[] = []
      for (let i = 0; i < 5; i++) {
        processingItems.push(item(`embed-proc-${i}`))
      }
      processingItems.push(item("fbar-task"))
      processingItems.push(item("thoughts"))
      for (let i = 5; i < 10; i++) {
        processingItems.push(item(`embed-proc-${i}`))
      }

      // Second large column with many embeds
      const nextItems: ReturnType<typeof item>[] = []
      for (let i = 0; i < 40; i++) {
        nextItems.push(item(`embed-next-${i}`))
      }

      // Empty columns (like @next.md has)
      const emptyCol1: ReturnType<typeof item>[] = []
      const emptyCol2: ReturnType<typeof item>[] = []
      const emptyCol3: ReturnType<typeof item>[] = []

      // Doing column
      const doingItems = [item("doing-1"), item("doing-2"), item("doing-3")]

      // Waiting column
      const waitingItems = [item("wait-1"), item("wait-2")]

      // Done column
      const doneItems: ReturnType<typeof item>[] = []
      for (let i = 0; i < 20; i++) {
        doneItems.push(item(`done-${i}`))
      }

      const nodes = item(
        "board",
        item("processing", ...processingItems),
        item("empty-1"),
        item("empty-2"),
        item("next", ...nextItems),
        item("empty-3"),
        item("empty-4"),
        item("asdfkj"), // random junk column name like in @next.md
        item("empty-5"),
        item("empty-6"),
        item("doing", ...doingItems),
        item("waiting", ...waitingItems),
        item("done", ...doneItems),
      )

      // Set up embeds
      for (const n of nodes) {
        if (n.id.startsWith("embed-")) {
          n.type = "paragraph"
          n.link_to = `target-${n.id}`
          n.data = {}
        }
        if (n.id === "processing" || n.id === "next" || n.id === "doing" || n.id === "waiting" || n.id === "done" || n.id === "asdfkj") {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id.startsWith("empty-")) {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id === "thoughts") {
          n.type = "section"
          n.data = { depth: 3 }
        }
        if (n.id === "fbar-task") {
          n.type = "task"
          n.data = { depth: 3 }
        }
      }
      return nodes
    })
  }

  test("navigate through all columns", () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []

    // Navigate right through all columns
    for (let col = 0; col < 12; col++) {
      board.press("l")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[col ${col}] l: no cursor`)
    }

    // Navigate left back through
    for (let col = 0; col < 12; col++) {
      board.press("h")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[col ${col}] h: no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("scroll through 40-item column", () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []

    // Navigate to "next" column (which has 40 items)
    board.press("l") // empty-1
    board.press("l") // empty-2
    board.press("l") // next

    // Scroll all the way down
    for (let i = 0; i < 45; i++) {
      board.press("j")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[j ${i}] no cursor in 40-item column`)
    }

    // Scroll all the way back up
    for (let i = 0; i < 45; i++) {
      board.press("k")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[k ${i}] no cursor in 40-item column`)
    }

    expect(bugs).toEqual([])
  })

  test("create nodes in large column", () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []

    // Navigate to next column
    board.press("l")
    board.press("l")
    board.press("l")

    // Create 10 nodes among the 40 embeds
    for (let i = 0; i < 10; i++) {
      // Navigate to random-ish position
      for (let j = 0; j < (i * 3) % 7 + 1; j++) {
        board.press("j")
      }

      board.press("n")
      board.press("Escape")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[create ${i}] no cursor in large column`)
    }

    expect(bugs).toEqual([])
  })

  test("navigate across empty columns", () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []

    // Navigate through empty columns
    for (let i = 0; i < 8; i++) {
      board.press("l")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[l ${i}] no cursor crossing empty column`)

      // Try navigation in each column
      board.press("j")
      const c2 = cursorCheck(board)
      if (!c2.exists) bugs.push(`[j in col ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("view mode cycling on large board", () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []

    // Navigate to middle of board
    board.press("l")
    board.press("l")
    board.press("l")
    board.press("j")
    board.press("j")
    board.press("j")

    // Cycle view modes
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 4; i++) {
        board.press("v")
        const c = cursorCheck(board)
        if (!c.exists) bugs.push(`[cycle ${cycle} mode ${i}] no cursor`)

        // Navigate in each view
        board.press("j")
        board.press("j")
        board.press("k")
      }
    }

    expect(bugs).toEqual([])
  })

  test("500 random operations on large board", { timeout: 30_000 }, () => {
    const { board } = largeBoardLikeNext()
    const bugs: string[] = []
    let inEdit = false

    let seed = 13
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "n", "v", "<", ">", "e", "u", "z", "d", "x", "Tab", "Shift+Tab", "/"]
    const editOps = ["Escape", "Enter"]
    let inSearch = false

    for (let i = 0; i < 500; i++) {
      let op: string
      if (inSearch) {
        op = rand() < 0.5 ? "Escape" : "j"
        if (op === "Escape") inSearch = false
      } else if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
        if (op === "/") inSearch = true
      }

      try {
        board.press(op)
      } catch (e) {
        bugs.push(`[${i}] ${op}: THREW ${e}`)
        inEdit = false
        inSearch = false
        continue
      }

      if (!inEdit && !inSearch) {
        const c = cursorCheck(board)
        if (!c.exists) {
          bugs.push(`[${i}] ${op}: no cursor`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log(`=== BUGS (${bugs.length} of 500 large board ops) ===`)
      for (const b of bugs.slice(0, 20)) console.log(b)
      if (bugs.length > 20) console.log(`... and ${bugs.length - 20} more`)
    }
    expect(bugs).toEqual([])
  })
})
