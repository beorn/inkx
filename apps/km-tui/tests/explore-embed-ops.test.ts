/**
 * Exploration: Embed-heavy board operations
 *
 * Exercises create, indent, navigate, and edit operations on a board
 * structure that mirrors @next.md — columns containing embeds (paragraphs
 * with link_to), sections, and tasks mixed together.
 *
 * Known bug context: creating nodes among embeds produced wrong heading
 * depth (siblingOrParentDepth fix applied). This explores whether any
 * cursor stability issues remain.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Helper: check cursor exists and return info */
function cursorCheck(board: ReturnType<typeof testEnv>["board"]) {
  const el = board.q("[data-cursor]")
  return {
    exists: el ? el.count() > 0 : false,
    text: el?.textContent() ?? "(none)",
  }
}

describe("Exploration: embed-heavy board ops", () => {
  /** Build a @next-like board with embeds and sections mixed */
  function nextLikeBoard() {
    return testEnv(() => {
      const nodes = item(
        "board",
        item(
          "processing",
          item("embed-1"),
          item("embed-2"),
          item("fbar-task"),
          item("thoughts"),
          item("embed-3"),
        ),
        item("next-col", item("task-a"), item("task-b"), item("task-c")),
        item("doing", item("task-d"), item("task-e")),
      )
      // Make processing an H2 section with embeds
      for (const n of nodes) {
        if (n.id === "processing") {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id.startsWith("embed-")) {
          n.type = "paragraph"
          n.link_to = `target-${n.id}`
          n.data = {}
        }
        if (n.id === "thoughts") {
          n.type = "section"
          n.data = { depth: 3 }
        }
        if (n.id === "fbar-task") {
          n.type = "task"
          n.data = { depth: 3 }
        }
        if (n.id === "next-col" || n.id === "doing") {
          n.type = "section"
          n.data = { depth: 2 }
        }
      }
      return nodes
    })
  }

  test("100 navigations across embed-heavy columns", () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []

    // Deterministic navigation sequence
    const actions = [
      "j", "j", "j", "j", "j", // down through processing
      "k", "k", // back up
      "l", // to next column
      "j", "j", "j", // down in next
      "l", // to doing
      "j", // down in doing
      "h", // back to next
      "h", // back to processing
      "k", "k", "k", // up in processing
    ]

    // Repeat the pattern to hit 100 interactions
    for (let i = 0; i < 100; i++) {
      const action = actions[i % actions.length]!
      try {
        board.press(action)
      } catch (e) {
        bugs.push(`[${i}] ${action}: THREW ${e}`)
        continue
      }
      const c = cursorCheck(board)
      if (!c.exists) {
        bugs.push(`[${i}] ${action}: no cursor (text was: ${c.text})`)
      }
    }

    expect(bugs).toEqual([])
  })

  test("create node after each embed in processing column", () => {
    const { board, repo } = nextLikeBoard()
    const bugs: string[] = []

    // Navigate to first embed
    // (cursor starts on first card in first column)
    const c0 = cursorCheck(board)
    if (!c0.exists) bugs.push("initial: no cursor")

    // Create after embed-1
    board.press("n")
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after n+Esc on embed-1: no cursor")

    // Navigate down to embed-2 (skip the new node)
    board.press("j")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after j to embed-2: no cursor")

    // Create after embed-2
    board.press("n")
    board.press("Escape")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after n+Esc on embed-2: no cursor")

    // Navigate to embed-3 (skip new node, fbar, thoughts)
    board.press("j") // skip new
    board.press("j") // fbar
    board.press("j") // thoughts
    board.press("j") // embed-3
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after navigating to embed-3: no cursor")

    // Create after embed-3
    board.press("n")
    board.press("Escape")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after n+Esc on embed-3: no cursor")

    // Verify processing column has grown
    const kids = repo.getChildren("processing")
    expect(kids.length).toBe(8) // 5 original + 3 new

    expect(bugs).toEqual([])
  })

  test("create then indent among embeds", () => {
    const { board, repo } = nextLikeBoard()
    const bugs: string[] = []

    // Navigate to embed-2
    board.press("j")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after j to embed-2: no cursor")

    // Create after embed-2
    board.press("n")
    board.press("Escape")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after n+Esc: no cursor")

    // Check new node has correct depth
    const processingKids = repo.getChildren("processing")
    const newNode = processingKids.find(
      (n) => !["embed-1", "embed-2", "embed-3", "fbar-task", "thoughts"].includes(n.id),
    )
    if (newNode) {
      const depth = newNode.data?.depth as number | undefined
      if (depth !== 3) {
        bugs.push(`new node depth=${depth}, expected 3 (parent processing is depth=2)`)
      }
    } else {
      bugs.push("new node not found among processing children")
    }

    // Now indent — should reparent under embed-2
    board.press("Tab")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after Tab indent: no cursor")

    expect(bugs).toEqual([])
  })

  test("rapid create-escape cycles across all columns", { timeout: 15000 }, () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []

    for (let cycle = 0; cycle < 30; cycle++) {
      // Navigate to a different position each cycle
      if (cycle % 5 === 0) board.press("l")
      board.press("j")

      // Create + escape
      board.press("n")
      board.press("Escape")

      const c = cursorCheck(board)
      if (!c.exists) {
        bugs.push(`[cycle=${cycle}] no cursor after create+escape`)
      }
    }

    expect(bugs).toEqual([])
  })

  test("Enter-Enter creation among embeds preserves cursor", () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []

    // Navigate to fbar-task (index 2 in processing)
    board.press("j")
    board.press("j")

    // Enter edit, then Enter-Enter to create new siblings
    board.press("Enter") // start edit
    board.press("Enter") // save + create new
    board.press("Enter") // save + create another
    board.press("Escape") // exit edit

    const c = cursorCheck(board)
    if (!c.exists) bugs.push("after Enter-Enter-Escape: no cursor")

    // Navigate around to verify stability
    for (let i = 0; i < 10; i++) {
      board.press(i % 2 === 0 ? "j" : "k")
      const cc = cursorCheck(board)
      if (!cc.exists) {
        bugs.push(`[nav ${i}] no cursor after ${i % 2 === 0 ? "j" : "k"}`)
      }
    }

    expect(bugs).toEqual([])
  })

  test("outdent from embed children", () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []

    // Navigate to thoughts (has depth=3, under processing which is depth=2)
    board.press("j") // embed-2
    board.press("j") // fbar
    board.press("j") // thoughts

    // Outdent thoughts — should move it out of processing
    board.press("Shift+Tab")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after outdent thoughts: no cursor")

    // Navigate to verify structure
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[j ${i} after outdent] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("mixed operations: create, indent, outdent, navigate x50", () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []
    let inEdit = false

    // Deterministic mixed sequence
    const ops = [
      "j", "j", "n", "Escape", "Tab",       // create + indent
      "k", "k", "n", "Escape", "Shift+Tab",  // create + outdent
      "l", "j", "j", "n", "Escape",          // col switch + create
      "h", "k", "n", "Escape", "Tab",        // back + create + indent
      "j", "j", "j", "l", "j",              // navigate
      "n", "Escape", "k", "k", "k",          // create + navigate up
      "l", "j", "n", "Escape", "Tab",        // next col + create + indent
      "h", "h", "j", "j", "j",              // back to first col
      "n", "Escape", "j", "n", "Escape",     // two creates
      "k", "k", "Tab", "j", "j",            // indent + navigate
    ]

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!
      if (op === "n" || op === "Enter") inEdit = true
      if (op === "Escape") inEdit = false

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

    expect(bugs).toEqual([])
  })

  test("200 random-but-deterministic operations", () => {
    const { board } = nextLikeBoard()
    const bugs: string[] = []
    let inEdit = false

    // Simple deterministic PRNG
    let seed = 42
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "n", "Tab", "Shift+Tab"]
    const editOps = ["Escape", "Enter"]

    for (let i = 0; i < 200; i++) {
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
      console.log("=== BUGS (200 random ops) ===")
      for (const b of bugs) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})
