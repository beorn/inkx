/**
 * Test: Navigation with body content (paragraphs before structural items).
 *
 * Reproducer for bug: when a board has body content (paragraphs before the first
 * oi/section), visual navigation (j/k/h/l) breaks because the navigation layer
 * treats body nodes (which are direct children of root) as column headers
 * instead of cards within the virtual "Description" column.
 */
import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createCardsViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"

describe("body content navigation", () => {
  it("j moves down through body cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("task1")),
        ),
    )

    // Cursor should start on first body paragraph
    board.expect("#para1[data-cursor]").toExist()

    // j should move to second body paragraph
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()
  })

  it("k moves up through body cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("task1")),
        ),
    )

    // Move to second paragraph first
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()

    // k should go back to first
    board.press("k")
    board.expect("#para1[data-cursor]").toExist()
  })

  it("k from first body card goes to board level", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item("col1", item("task1")),
        ),
    )

    // Start on para1
    board.expect("#para1[data-cursor]").toExist()

    // k should go to board level
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  it("j from last body card hits boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item("col1", item("task1")),
        ),
    )

    // Start on para1 (last/only body card)
    board.expect("#para1[data-cursor]").toExist()

    // j should hit boundary (body cards are in their own visual column)
    board.press("j")
    // Cursor should still be on para1 (boundary hit)
    board.expect("#para1[data-cursor]").toExist()
  })

  it("l from body card navigates to structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body text"),
          item("col1", item("task1"), item("task2")),
          item("col2", item("task3")),
        ),
    )

    // Start on body card
    board.expect("[id='body text'][data-cursor]").toExist()

    // l should navigate to first structural column
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()
  })

  it("navigation layer correctly classifies body nodes", () => {
    const nodes = item(
      "board",
      item.paragraph("body text"),
      item("col1", item("task1")),
    )
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createLayoutRegistry()

    const navState: NavState = {
      cursorNodeId: "body text",
      rootId: "board",
      foldedNodes: new Set(),
      collapsedNodes: new Set(),
    }

    // Down from single body card should be null (boundary)
    const downTarget = nav.navigate("down", navState, repo, registry)
    expect(downTarget).toBeNull()

    // Up from body card should go to board level
    const upTarget = nav.navigate("up", navState, repo, registry)
    expect(upTarget).toBe("board")
  })

  it("navigation layer handles multiple body nodes", () => {
    const nodes = item(
      "board",
      item.paragraph("p1"),
      item.paragraph("p2"),
      item.paragraph("p3"),
      item("col1", item("task1")),
    )
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createLayoutRegistry()

    // Down from p1 → p2
    expect(nav.navigate("down", { cursorNodeId: "p1", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p2")

    // Down from p2 → p3
    expect(nav.navigate("down", { cursorNodeId: "p2", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p3")

    // Down from p3 → null (boundary)
    expect(nav.navigate("down", { cursorNodeId: "p3", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBeNull()

    // Up from p3 → p2
    expect(nav.navigate("up", { cursorNodeId: "p3", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p2")

    // Up from p1 → board
    expect(nav.navigate("up", { cursorNodeId: "p1", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("board")
  })
})
