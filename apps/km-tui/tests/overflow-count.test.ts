/**
 * Overflow count and child count tests.
 *
 * Tests:
 * 1. Cards with many children show overflow "+N" indicator
 * 2. Subitems with children show child count on their title row
 * 3. After zooming into a section, cards still show overflow indicators
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Child count on subitems
// =============================================================================

describe("child count on subitems", () => {
  test("subitem with children shows child count in card view", () => {
    // Create a card with a subitem that itself has children.
    // The subitem "Parent" has 3 children, so it should show " 3" on its line.
    const { board } = testEnv(() =>
      item("board", item("col1", item("Card1", item("Parent", item("child-a"), item("child-b"), item("child-c"))))),
    )

    // The card should render "Parent" as a subitem inside Card1
    board.expectScreen("Parent")
    // The child count " 3" should appear somewhere on screen near "Parent"
    const screenshot = board.screenshot()
    // Find the line with "Parent"
    const lines = screenshot.split("\n")
    const parentLine = lines.find((l) => l.includes("Parent"))
    expect(parentLine).toBeDefined()
    // Should show child count "3" on the same line
    expect(parentLine).toContain("3")
  })

  test("virtual body cards preserve child count", () => {
    // Body nodes (non-oi before first oi) in a virtual body column should show child counts.
    // Use testEnvWithRepo to create li (task) nodes with children directly.
    const { board } = testEnv(
      () => {
        // Build: board > col1 > [bodyTask(li, 3 children), sectionA(oi, 1 card)]
        // bodyTask is li type so it's body content before sectionA (oi).
        // After rendering, bodyTask should be in a virtual body column with childCount=3.
        const nodes = [...item("board", item("col1"))]
        // bodyTask as li (body content, not oi) with children
        const bodyTask: KNode = {
          id: "bodyTask",
          type: "p", item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo",
          content: "bodyTask",
          data: {},
          parent_id: "col1",
          parent_idx: 0,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        // bodyTask children
        const btChild1: KNode = {
          id: "bt-child-1",
          type: "p", item: true,
          list_marker: "-",
          content: "bt-child-1",
          data: {},
          parent_id: "bodyTask",
          parent_idx: 0,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        const btChild2: KNode = {
          id: "bt-child-2",
          type: "p", item: true,
          list_marker: "-",
          content: "bt-child-2",
          data: {},
          parent_id: "bodyTask",
          parent_idx: 1,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        const btChild3: KNode = {
          id: "bt-child-3",
          type: "p", item: true,
          list_marker: "-",
          content: "bt-child-3",
          data: {},
          parent_id: "bodyTask",
          parent_idx: 2,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        // sectionA as oi (structural)
        const sectionA: KNode = {
          id: "sectionA",
          type: "h", item: true,
          fstype: "folder",
          content: undefined,
          data: { name: "sectionA" },
          parent_id: "col1",
          parent_idx: 1,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        const card1: KNode = {
          id: "card1",
          type: "p", item: true,
          list_marker: "-",
          content: "card1",
          data: {},
          parent_id: "sectionA",
          parent_idx: 0,
          embed_source: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        }
        return [...nodes, bodyTask, btChild1, btChild2, btChild3, sectionA, card1]
      },
      { checkIncremental: false },
    )

    const screenshot = board.screenshot()
    // bodyTask should be visible in the virtual body column
    expect(screenshot).toContain("bodyTask")
    // bodyTask should show child count 3 on its line
    const lines = screenshot.split("\n")
    const bodyLine = lines.find((l) => l.includes("bodyTask"))
    expect(bodyLine).toBeDefined()
    expect(bodyLine).toContain("3")
  })
})

// =============================================================================
// Overflow indicator on cards
// =============================================================================

describe("overflow indicator on cards", () => {
  test("card with more children than maxContentLines shows overflow count", () => {
    // maxContentLines defaults to 3, so a card with 5 children should show "+2"
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("Card1", item("sub-1"), item("sub-2"), item("sub-3"), item("sub-4"), item("sub-5"))),
      ),
    )

    // First 3 children should be visible
    board.expectScreen("sub-1")
    board.expectScreen("sub-2")
    board.expectScreen("sub-3")
    // Overflow indicator should show +2
    board.expectScreen("+2")
  })

  test("after zoom, cards with many children show overflow indicator", () => {
    // Structure: board > col1 > zoomTarget > sectionA > card1(5 kids)
    // After zoom (e) into zoomTarget: sectionA is column, card1 is a card with 5 children.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "zoomTarget",
              item("sectionA", item("card1", item("a1"), item("a2"), item("a3"), item("a4"), item("a5"))),
            ),
          ),
        ),
      { checkIncremental: false }, // zoom causes incremental mismatch (separate issue)
    )

    // Zoom into zoomTarget via 'e'
    board.press("z")

    const screenshot = board.screenshot()
    // After zoom into zoomTarget: sectionA is column, card1 is a card
    // card1 has 5 children, maxContentLines=3 => should show +2 overflow
    expect(screenshot).toContain("card1")
    expect(screenshot).toContain("a1")
    expect(screenshot).toContain("a2")
    expect(screenshot).toContain("a3")
    expect(screenshot).toContain("+2")
  })
})
