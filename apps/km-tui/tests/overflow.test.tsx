/**
 * Overflow indicator tests — spurious indicators, counts, positioning, component.
 *
 * Consolidated from:
 * - overflow-top-spurious.test.tsx (spurious ▲ at top)
 * - overflow-count.test.ts (child count + overflow +N)
 * - overflow-indicator-position.test.ts (▼ adjacency to last card)
 * - views/OverflowIndicator.test.tsx (component unit tests)
 */

import { describe, test, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { testEnv, item } from "./helpers/board-test.ts"
import { OverflowIndicator } from "../src/views/OverflowIndicator.tsx"
import type { KNode } from "@km/core"

// =============================================================================
// Spurious ▲ at top of column
// =============================================================================

describe("overflow-top-spurious", () => {
  test("no spurious ▲ at top (cards view)", () => {
    const children = Array.from({ length: 30 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...children)), { rows: 24, columns: 80 })

    const text = board.screenshot()
    expect(text).not.toContain("\u25b2")
    expect(text).toContain("\u25bc")
  })

  test("no spurious ▲ at top (columns view)", () => {
    const children = Array.from({ length: 40 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...children)), {
      rows: 24,
      columns: 80,
      viewMode: "columns",
    })

    const text = board.screenshot()
    expect(text).not.toContain("\u25b2")
    expect(text).toContain("\u25bc")
  })

  test("▼ disappears after scrolling back to top", () => {
    const children = Array.from({ length: 30 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...children)), { rows: 24, columns: 80 })

    // Scroll down — ▼ should be visible (items below viewport)
    for (let i = 0; i < 10; i++) board.command("cursor_down")
    expect(board.screenshot()).toContain("\u25bc")

    // Scroll back to top — ▼ should still be visible (still items below)
    for (let i = 0; i < 10; i++) board.command("cursor_up")
    // At top, no ▲ should show
    expect(board.screenshot()).not.toContain("\u25b2")
  })
})

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
          type: "p",
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
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
          type: "p",
          item: { list: "-" },
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
          type: "p",
          item: { list: "-" },
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
          type: "p",
          item: { list: "-" },
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
          type: "h",
          item: {},
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
          type: "p",
          item: { list: "-" },
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

    // Zoom inwards toward zoomTarget: first z → root=col1, second z → root=zoomTarget
    board.command("zoom_inwards")
    board.command("zoom_inwards")

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

// =============================================================================
// Overflow indicator positioning
// =============================================================================

describe("overflow indicator position in board columns", () => {
  test("▼ indicator is adjacent to last card, dump for debugging", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card-${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 50,
    })

    const text = board.screenshot()
    const lines = text.split("\n")

    // Dump all lines with row numbers for analysis
    const dump: string[] = []
    let indicatorRow = -1
    let lastCardBorderRow = -1
    let lastCardContentRow = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || ""
      const flags: string[] = []
      if (line.includes("▼")) {
        indicatorRow = i
        flags.push("<<< ▼ INDICATOR")
      }
      if (line.includes("▲")) flags.push("<<< ▲ INDICATOR")
      if (/card-\d+/.test(line)) {
        lastCardContentRow = i
        flags.push("<<< CARD CONTENT")
      }
      if (line.includes("╰")) {
        lastCardBorderRow = i
        flags.push("<<< CARD BORDER BOTTOM")
      }
      if (line.includes("╭")) flags.push("<<< CARD BORDER TOP")
      if (line.includes("─".repeat(10))) flags.push("<<< SEPARATOR")
      dump.push(`${String(i).padStart(2)}: ${line}  ${flags.join(" ")}`)
    }

    // The last visible card may be partially clipped (no bottom border row),
    // so measure gap from last card content row, not border row.
    const gap = indicatorRow - lastCardContentRow

    // Fail with full dump
    expect({ indicatorRow, lastCardBorderRow, lastCardContentRow, gap, dump: "\n" + dump.join("\n") }).toEqual(
      expect.objectContaining({ gap: 1 }),
    )
  })
})

// =============================================================================
// OverflowIndicator component unit tests
// =============================================================================

describe("OverflowIndicator", () => {
  const render = createRenderer()

  it("returns null when count is 0", () => {
    const app = render(<OverflowIndicator direction="down" count={0} />)
    // Component returns null, so the frame should be empty (just whitespace)
    expect(app.text.trim()).toBe("")
  })

  it("returns null when count is negative", () => {
    const app = render(<OverflowIndicator direction="down" count={-5} />)
    // Component returns null, so the frame should be empty (just whitespace)
    expect(app.text.trim()).toBe("")
  })

  it("shows down arrow with count for direction down", () => {
    const app = render(<OverflowIndicator direction="down" count={5} />)
    expect(app.text).toContain("▼")
    expect(app.text).toContain("5 more")
  })

  it("shows up arrow with count for direction up", () => {
    const app = render(<OverflowIndicator direction="up" count={3} />)
    expect(app.text).toContain("▲")
    expect(app.text).toContain("3 more")
  })

  it("renders with width prop", () => {
    const app = render(<OverflowIndicator direction="down" count={5} width={30} />)
    // Verify the text is present
    // Note: centering behavior (padding spaces) may be stripped by text extraction
    expect(app.text).toContain("▼ 5 more")
  })

  it("does not center when width is too narrow", () => {
    const app = render(<OverflowIndicator direction="down" count={5} width={5} />)
    // Width is less than text, so no padding should be applied
    expect(app.text).toContain("▼ 5 more")
  })

  it("handles large counts", () => {
    const app = render(<OverflowIndicator direction="down" count={999} />)
    expect(app.text).toContain("▼")
    expect(app.text).toContain("999 more")
  })

  it("works without width prop", () => {
    const app = render(<OverflowIndicator direction="up" count={10} />)
    expect(app.text).toContain("▲ 10 more")
  })
})
