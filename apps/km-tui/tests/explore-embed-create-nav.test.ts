/**
 * Exploration: Create + indent near embeds followed by navigation
 *
 * This targets the core km-tui.stale-cursor scenario:
 * Creating nodes among embeds, indenting them, then navigating.
 * The original bug was cursor dropping to board root after file sync.
 * In headless mode (no file sync), we test whether the cursor stays
 * with the created/indented node through subsequent navigation.
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

describe("Exploration: embed create + nav (stale cursor scenarios)", () => {
  /** Board mimicking @next.md Processing column */
  function nextProcessingBoard() {
    return testEnv(() => {
      const nodes = item(
        "board",
        item(
          "processing",
          item("embed-daytona-1"),
          item("embed-daytona-2"),
          item("embed-taxes"),
          item("thoughts-section"),
          item("empty-section"),
        ),
        item("next-col"),
        item("empty-1"),
        item("empty-2"),
        item("doing", item("doing-task-1")),
        item("waiting"),
        item("done"),
      )

      for (const n of nodes) {
        if (n.id.startsWith("embed-")) {
          n.type = "paragraph"
          n.link_to = `target-${n.id}`
          n.data = {}
        }
        if (["processing", "next-col", "doing", "waiting", "done"].includes(n.id)) {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id.startsWith("empty-")) {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id === "thoughts-section") {
          n.type = "section"
          n.data = { depth: 3 }
        }
        if (n.id === "empty-section") {
          n.type = "section"
          n.data = { depth: 3 }
        }
      }
      return nodes
    })
  }

  test("create after embed, navigate away and back", () => {
    const { board } = nextProcessingBoard()
    const bugs: string[] = []

    // Navigate to first embed
    const c0 = cursorCheck(board)
    if (!c0.exists) bugs.push("initial: no cursor")

    // Create after first embed
    board.press("n")
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after create: no cursor")

    // Navigate away (down, right, back)
    board.press("j")
    board.press("j")
    board.press("l") // to next column
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after l: no cursor")

    board.press("h") // back to processing
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after h back: no cursor")

    // Navigate up to where we created
    board.press("k")
    board.press("k")
    board.press("k")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after navigating back to create position: no cursor")

    expect(bugs).toEqual([])
  })

  test("create + indent after embed, then full board traversal", () => {
    const { board } = nextProcessingBoard()
    const bugs: string[] = []

    // Create after first embed
    board.press("n")
    board.press("Escape")

    // Indent the new node
    board.press("Tab")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after Tab: no cursor")

    // Full board traversal: visit every column
    for (let col = 0; col < 6; col++) {
      board.press("l")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[l to col ${col + 1}] no cursor`)

      // Navigate within column
      for (let row = 0; row < 3; row++) {
        board.press("j")
        c = cursorCheck(board)
        if (!c.exists) bugs.push(`[col ${col + 1} j ${row}] no cursor`)
      }
    }

    // Navigate all the way back
    for (let col = 0; col < 6; col++) {
      board.press("h")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[h back ${col}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("create 3 nodes among embeds, indent each, then navigate", () => {
    const { board, repo } = nextProcessingBoard()
    const bugs: string[] = []

    // Create after embed-daytona-1
    board.press("n")
    board.press("Escape")
    board.press("Tab") // indent under embed
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after 1st create+indent: no cursor")

    // Navigate to embed-daytona-2
    board.press("j") // embed-daytona-2

    // Create after it
    board.press("n")
    board.press("Escape")
    board.press("Tab")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after 2nd create+indent: no cursor")

    // Navigate to embed-taxes
    board.press("j") // embed-taxes

    // Create after it
    board.press("n")
    board.press("Escape")
    board.press("Tab")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after 3rd create+indent: no cursor")

    // Now navigate through the whole column
    for (let i = 0; i < 10; i++) {
      board.press("k")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[k ${i}] no cursor`)
    }

    for (let i = 0; i < 10; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[j ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("create, indent, outdent, create again — rapid cycling", () => {
    const { board } = nextProcessingBoard()
    const bugs: string[] = []

    for (let cycle = 0; cycle < 15; cycle++) {
      // Create
      board.press("n")
      board.press("Escape")

      // Indent
      board.press("Tab")
      let c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${cycle}] after Tab: no cursor`)

      // Outdent
      board.press("Shift+Tab")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${cycle}] after Shift+Tab: no cursor`)

      // Navigate down
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${cycle}] after j: no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("create + move between columns rapidly", () => {
    const { board } = nextProcessingBoard()
    const bugs: string[] = []

    for (let i = 0; i < 20; i++) {
      // Create in current column
      board.press("n")
      board.press("Escape")

      // Move right
      board.press("l")
      let c = cursorCheck(board)
      if (!c.exists) bugs.push(`[${i}] after create+l: no cursor`)

      // Create in new column
      board.press("n")
      board.press("Escape")

      // Move left
      board.press("h")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[${i}] after create+h: no cursor`)

      // Move down
      board.press("j")
    }

    expect(bugs).toEqual([])
  })

  test("Enter-Enter chain creates siblings among embeds", () => {
    const { board, repo } = nextProcessingBoard()
    const bugs: string[] = []

    // Navigate to embed-daytona-2
    board.press("j")

    // Start editing
    board.press("Enter")

    // Chain of Enter to create siblings
    for (let i = 0; i < 5; i++) {
      board.press("Enter") // save + create new
    }

    // Exit edit
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after Enter chain + Escape: no cursor")

    // Navigate through all created nodes
    for (let i = 0; i < 10; i++) {
      board.press("k")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[k ${i}] no cursor after Enter chain`)
    }

    // Check all created nodes are in processing
    const kids = repo.getChildren("processing")
    if (kids.length < 10) {
      bugs.push(`expected 10+ children in processing, got ${kids.length}`)
    }

    expect(bugs).toEqual([])
  })

  test("300 mixed operations on @next-like board", () => {
    const { board } = nextProcessingBoard()
    const bugs: string[] = []
    let inEdit = false

    let seed = 7
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = [
      "j", "j", "k", // weighted more toward navigation
      "l", "h",
      "n", "Tab", "Shift+Tab",
      "v", "z", "d",
      "e", "u",
      "<", ">",
    ]
    const editOps = ["Escape", "Enter"]

    for (let i = 0; i < 300; i++) {
      let op: string
      if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
      }

      try {
        board.press(op)
      } catch (e) {
        bugs.push(`[${i}] ${op}: THREW ${e}`)
        inEdit = false
        continue
      }

      if (!inEdit) {
        const c = cursorCheck(board)
        if (!c.exists) {
          bugs.push(`[${i}] ${op}: no cursor`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log(`=== BUGS (${bugs.length} of 300 @next-like ops) ===`)
      for (const b of bugs.slice(0, 20)) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})
