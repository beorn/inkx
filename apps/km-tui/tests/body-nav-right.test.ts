import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createCardsViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"

describe("body column l navigation", () => {
  test("l from body card goes directly to next column card, not board title", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("intro text"),
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor should start on body card
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    // Press l to move right
    board.press("l")

    // Should be on col1's first card, NOT the board title
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-a")
  })

  test("l from body card with multiple columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("body content here"),
        item("col1", item("task-a")),
        item("col2", item("task-b")),
      ),
    )

    expect(board.q("[data-cursor]").textContent()).toContain("body content")

    // First l: should go to col1
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Second l: should go to col2
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-b")
  })

  test("l from body with multiple paragraphs skips all body to next structural column", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("para one"),
        item.paragraph("para two"),
        item.paragraph("para three"),
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor starts on first body card
    expect(board.q("[data-cursor]").textContent()).toContain("para one")

    // Press l - should go to col1's first card, not to para two or board title
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")
  })

  test("h from col1 card goes back to body column", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("intro"),
        item("col1", item("task-a")),
      ),
    )

    // Start on body
    expect(board.q("[data-cursor]").textContent()).toContain("intro")

    // Move right to col1
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Move left back to body
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toContain("intro")
  })
})

describe("body column header (__body__) navigation", () => {
  // Bug: km-tui.body-nav-right
  // When cursor is on the virtual __body__ column header node (which doesn't
  // exist in the repo), navigation falls back to rootId instead of navigating
  // correctly. The __body__ node is a synthetic node created by the view layer.

  const nav = createCardsViewNavigation()
  const registry = createLayoutRegistry()

  function makeState(cursorNodeId: string, rootId: string = "board"): NavState {
    return {
      cursorNodeId,
      rootId,
      foldedNodes: new Set(),
      collapsedNodes: new Set(),
    }
  }

  test("l from __body__ column header goes to first structural column, not rootId", () => {
    const nodes = item(
      "board",
      item.paragraph("body-p1"),
      item.paragraph("body-p2"),
      item("col1", item("task-a")),
      item("col2", item("task-b")),
    )
    const repo = createFakeRepo({ nodes })

    // Simulate cursor on the virtual __body__ column header
    const target = nav.navigate("right", makeState("__body__board"), repo, registry)

    // Should go to first structural column card, NOT null (boundary) or board title
    expect(target).not.toBe("board") // Must NOT fall back to rootId
    expect(target).not.toBeNull()
    expect(target).toBe("task-a") // First card in first structural column
  })

  test("h from __body__ column header is boundary (leftmost)", () => {
    const nodes = item(
      "board",
      item.paragraph("body-p1"),
      item("col1", item("task-a")),
    )
    const repo = createFakeRepo({ nodes })

    const target = nav.navigate("left", makeState("__body__board"), repo, registry)
    expect(target).toBeNull() // Boundary — can't go left from body column
  })

  test("j from __body__ column header goes to first body card", () => {
    const nodes = item(
      "board",
      item.paragraph("body-p1"),
      item.paragraph("body-p2"),
      item("col1", item("task-a")),
    )
    const repo = createFakeRepo({ nodes })

    const target = nav.navigate("down", makeState("__body__board"), repo, registry)

    // Should navigate to first body card (like j from a column header to first card)
    expect(target).not.toBe("board")
    expect(target).toBe("body-p1")
  })

  test("k from __body__ column header goes to board level", () => {
    const nodes = item(
      "board",
      item.paragraph("body-p1"),
      item("col1", item("task-a")),
    )
    const repo = createFakeRepo({ nodes })

    const target = nav.navigate("up", makeState("__body__board"), repo, registry)

    // Should navigate to board level
    expect(target).toBe("board")
  })
})
