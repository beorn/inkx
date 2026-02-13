/**
 * Exploration: Virtual card cursor skip — j/k/h/l/page should skip virtual cards.
 *
 * Virtual cards are created when a folder has body content (paragraphs/tasks)
 * before section children. The cursor should never land on a __body__ node.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Virtual Card Skip", () => {
  test("j skips virtual body cards within a column", () => {
    // Create a column with paragraph body + section children
    // The paragraphs become virtual cards, sections become real cards
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.paragraph("body text 1"),
          item.paragraph("body text 2"),
          item.section("Section A", item("task1")),
          item.section("Section B", item("task2")),
        ),
      ),
    )
    const bugs: string[] = []

    // Navigate down through col1 — cursor should skip virtual body cards
    for (let i = 0; i < 6; i++) {
      board.press("j")
      const text = board.screenshot()
      // Check cursor is not on __body__ node
      const cursor = board.q("[data-cursor]")
      if (cursor.count() > 0) {
        const cursorId = cursor.getAttribute("data-node-id")
        if (cursorId?.startsWith("__body__")) {
          bugs.push(`cursor landed on virtual body node: ${cursorId} at step ${i}`)
        }
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output")
    }
    expect(bugs).toEqual([])
  })

  test("k skips virtual body cards going up", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.paragraph("body1"),
          item.section("Section A", item("task1")),
          item.section("Section B", item("task2")),
        ),
      ),
    )
    const bugs: string[] = []

    // Navigate to the bottom
    board.press("j").press("j").press("j")

    // Navigate back up — should skip virtual cards
    for (let i = 0; i < 4; i++) {
      board.press("k")
      const cursor = board.q("[data-cursor]")
      if (cursor.count() > 0) {
        const cursorId = cursor.getAttribute("data-node-id")
        if (cursorId?.startsWith("__body__")) {
          bugs.push(`cursor on virtual body going up: ${cursorId} at step ${i}`)
        }
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output")
    }
    expect(bugs).toEqual([])
  })

  test("h/l skip virtual body columns", () => {
    // Root has body content + section children: body becomes a virtual column
    const { board } = testEnv(() =>
      item(
        "board",
        item.paragraph("root body"),
        item.section("Col A", item("taskA")),
        item.section("Col B", item("taskB")),
      ),
    )
    const bugs: string[] = []

    // Navigate right
    for (let i = 0; i < 4; i++) {
      board.press("l")
      const cursor = board.q("[data-cursor]")
      if (cursor.count() > 0) {
        const cursorId = cursor.getAttribute("data-node-id")
        if (cursorId?.startsWith("__body__")) {
          bugs.push(`cursor on virtual body column going right: ${cursorId} at step ${i}`)
        }
      }
    }

    // Navigate left
    for (let i = 0; i < 4; i++) {
      board.press("h")
      const cursor = board.q("[data-cursor]")
      if (cursor.count() > 0) {
        const cursorId = cursor.getAttribute("data-node-id")
        if (cursorId?.startsWith("__body__")) {
          bugs.push(`cursor on virtual body column going left: ${cursorId} at step ${i}`)
        }
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output")
    }
    expect(bugs).toEqual([])
  })

  test("page up/down skip virtual cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item.paragraph("body1"),
            item.paragraph("body2"),
            item.section("S1", item("t1")),
            item.section("S2", item("t2")),
            item.section("S3", item("t3")),
            item.section("S4", item("t4")),
            item.section("S5", item("t5")),
          ),
        ),
      { rows: 12 }, // small terminal to trigger page navigation
    )
    const bugs: string[] = []

    // Page down
    board.press("Ctrl+D")
    let cursor = board.q("[data-cursor]")
    if (cursor.count() > 0) {
      const cursorId = cursor.getAttribute("data-node-id")
      if (cursorId?.startsWith("__body__")) {
        bugs.push(`cursor on virtual body after page down: ${cursorId}`)
      }
    }

    // Page up
    board.press("Ctrl+U")
    cursor = board.q("[data-cursor]")
    if (cursor.count() > 0) {
      const cursorId = cursor.getAttribute("data-node-id")
      if (cursorId?.startsWith("__body__")) {
        bugs.push(`cursor on virtual body after page up: ${cursorId}`)
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output")
    }
    expect(bugs).toEqual([])
  })

  test("initial cursor does not land on virtual card", () => {
    // Board where first column has only body content (virtual)
    const { board } = testEnv(() =>
      item("board", item.paragraph("body only"), item.section("Real Section", item("task1"))),
    )
    const bugs: string[] = []

    const cursor = board.q("[data-cursor]")
    if (cursor.count() > 0) {
      const cursorId = cursor.getAttribute("data-node-id")
      if (cursorId?.startsWith("__body__")) {
        bugs.push(`initial cursor on virtual body: ${cursorId}`)
      }
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in initial render")
    }
    expect(bugs).toEqual([])
  })

  test("j on column with only virtual cards hits boundary", () => {
    // Column where ALL cards are virtual (body content, no structural children)
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.paragraph("p1"), item.paragraph("p2"), item.paragraph("p3")),
        item("col2", item.section("Real", item("task1"))),
      ),
    )
    const bugs: string[] = []

    // All cards in col1 are virtual — pressing j should eventually hit boundary
    board.press("j")
    board.press("j")
    board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage navigating virtual-only column")
    }
    expect(bugs).toEqual([])
  })

  test("zoom into node with body paragraphs places cursor on first navigable card", () => {
    // File-like node with body paragraphs before structural sections
    // Simulates zooming into a file like CLAUDE.md
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item(
            "CLAUDE.md",
            item.paragraph("Description of the project"),
            item.paragraph("More preamble text"),
            item.section("Commands", item("bun fix"), item("bun km")),
            item.section("Architecture", item("Layered design")),
          ),
        ),
      ),
    )

    // Zoom into CLAUDE.md
    board.press("i")

    // After zoom, cursor should be on "Commands" (first structural child), not a paragraph
    const cursor = board.q("[data-cursor]")
    expect(cursor.count(), "cursor should exist after zoom").toBeGreaterThan(0)

    // j should work (navigate to next card)
    board.press("j")
    const cursor2 = board.q("[data-cursor]")
    expect(cursor2.count(), "cursor should exist after j").toBeGreaterThan(0)

    // Verify no garbage
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
