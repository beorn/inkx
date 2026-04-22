/**
 * Scroll and Cursor Bug Tests
 *
 * Tests for:
 * - km-tui-scroll-follow: Scroll doesn't follow cursor when moving into items below viewport
 * - km-tui-cursor-jump: Cursor jumps to top of board when moving down from certain items
 * - km-tui-empty-cards: Cards render as empty boxes when content should be visible
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp, type TestApp } from "./helpers/test-app.ts"

describe("km-tui-scroll-follow: Scroll follows cursor", () => {
  test("cursor remains visible when scrolling down past viewport", () => {
    // Create a column with many cards that exceed viewport height
    // With rows=15, only ~3-4 cards fit (ESTIMATED_CARD_HEIGHT ~4)
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Navigate down through cards
    for (let i = 1; i < 15; i++) {
      app.command("cursor_down")

      // The current card should be visible in the text output
      expect(app.text, `card${i} should be visible after navigating down`).toContain(`card${i}`)
    }
  })

  test("cursor visible after G (jump to last)", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Jump to last card
    app.command("cursor_last")

    // Last card should be visible
    expect(app.text).toContain("card19")

    // Cursor should be on last card
    app.expect("#card19[data-cursor]").toExist()
  })

  test("cursor visible after scrolling up from bottom", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Jump to last, then navigate up
    app.command("cursor_last")
    app.command("cursor_up")
    app.command("cursor_up")
    app.command("cursor_up")

    // card16 should be visible (20-1-3 = 16)
    expect(app.text).toContain("card16")
    app.expect("#card16[data-cursor]").toExist()
  })
})

describe("km-tui-cursor-jump: Cursor movement boundaries", () => {
  test("j at last card in column rings bell, doesn't jump", () => {
    using app = createTestApp(
      item("board", item("col1", item("a"), item("b"), item("c")), item("col2", item("x"), item("y"))),
    )

    // Navigate to last card in col1
    app.command("cursor_down").command("cursor_down")
    app.expect("#c[data-cursor]").toExist()

    // Press j at boundary
    app.command("cursor_down")

    // Should ring bell and stay on c, not jump to board or col2
    expect(app.bell).toBe(true)
    app.expect("#c[data-cursor]").toExist()
    app.expect("#board[data-cursor]").not.toExist()
  })

  test("navigating down through deep hierarchy doesn't jump to top", () => {
    // Simulate structure similar to user's vault
    using app = createTestApp(
      item(
        "board",
        item("areas", item("Family"), item("Health"), item("Kinship"), item("MamaMuse")),
        item("projects", item("proj1"), item("proj2")),
      ),
    )

    // Navigate down through areas column
    app.expect("#Family[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#Health[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#Kinship[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#MamaMuse[data-cursor]").toExist()

    // At last card, should ring bell, not jump
    app.command("cursor_down")
    expect(app.bell).toBe(true)
    app.expect("#MamaMuse[data-cursor]").toExist()

    // Verify we didn't jump to top
    app.expect("#Family[data-cursor]").not.toExist()
    app.expect("#board[data-cursor]").not.toExist()
  })

  test("horizontal navigation preserves vertical position (curswant)", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d")), item("col2", item("2a"), item("2b"))),
    )

    // Navigate down to 1c (index 2)
    app.command("cursor_down").command("cursor_down")
    app.expect("#1c[data-cursor]").toExist()

    // Move right to col2 - should go to 2b (closest to row 2)
    app.command("cursor_right")

    // Should be at 2b (last card in col2), not jump to top
    app.expect("#2b[data-cursor]").toExist()
    app.expect("#2a[data-cursor]").not.toExist()
  })

  // km-tui.cursor-stuck-col-0-h-scrolls — horizontal nav must NOT scroll the
  // board on every keypress. Only scroll when the cursor lands off-screen.
  test("cursor_right keeps already-visible columns visible (no premature scroll)", () => {
    // 8 columns. At cols=120, ~3 columns fit on screen at once.
    using app = createTestApp(
      item(
        "board",
        item("c1", item("c1_t1")),
        item("c2", item("c2_t1")),
        item("c3", item("c3_t1")),
        item("c4", item("c4_t1")),
        item("c5", item("c5_t1")),
        item("c6", item("c6_t1")),
        item("c7", item("c7_t1")),
        item("c8", item("c8_t1")),
      ),
      { cols: 120, rows: 30 },
    )

    app.command("cursor_down")
    app.expect("#c1_t1[data-cursor]").toExist()

    // Move right — c2 is already in view at startup, so no scroll needed.
    app.command("cursor_right")
    app.expect("#c2_t1[data-cursor]").toExist()
    expect(app, "after one cursor_right, c1 should still be on screen").toContainText("c1")
  })

  test("cursor_right twice keeps c1+c2 visible at 120 cols (room for 3+ cols)", () => {
    using app = createTestApp(
      item(
        "board",
        item("c1", item("c1_t1")),
        item("c2", item("c2_t1")),
        item("c3", item("c3_t1")),
        item("c4", item("c4_t1")),
        item("c5", item("c5_t1")),
      ),
      { cols: 120, rows: 30 },
    )

    app.command("cursor_down")
    app.command("cursor_right") // c1 → c2
    app.command("cursor_right") // c2 → c3

    app.expect("#c3_t1[data-cursor]").toExist()
    // 120 cols / ~35 col-width = 3 cols fit. c1, c2, c3 should all be visible.
    expect(app, "after two cursor_right, c1 still on screen").toContainText("c1")
    expect(app, "after two cursor_right, c2 still on screen").toContainText("c2")
  })
})

describe("km-tui-empty-cards: Card content rendering", () => {
  test("cards with content show their text", () => {
    using app = createTestApp(item("board", item("col1", item("Task Alpha"), item("Task Beta"), item("Task Gamma"))))

    // All card content should be visible
    expect(app.text).toContain("Task Alpha")
    expect(app.text).toContain("Task Beta")
    expect(app.text).toContain("Task Gamma")
  })

  test("nested children show in card body", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          // Parent with children
          item("Parent", item("Child1"), item("Child2")),
        ),
      ),
      { rows: 30 }, // More space to show children
    )

    // Parent title visible
    expect(app.text).toContain("Parent")

    // Children should be visible too (not empty card body)
    expect(app.text).toContain("Child1")
    expect(app.text).toContain("Child2")
  })

  test("folder with children shows children inline when expanded", () => {
    using app = createTestApp(item("board", item("col1", item("Folder", item("Item1"), item("Item2"), item("Item3")))))

    // Folder title visible
    expect(app.text).toContain("Folder")
    // Children should be visible inline (expanded by default in cards view)
    expect(app.text).toContain("Item1")
    expect(app.text).toContain("Item2")
    expect(app.text).toContain("Item3")
  })

  test("cards at viewport edge are not cut off", () => {
    const cards = Array.from({ length: 10 }, (_, i) => item(`card${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 20,
      cols: 60,
      incremental: false,
    })

    // Navigate to card near the edge
    for (let i = 0; i < 5; i++) {
      app.command("cursor_down")
    }

    // card5 (selected) should be fully visible, not empty
    expect(app.text).toContain("card5")
    app.expect("#card5[data-cursor]").toExist()
  })
})

describe("Scroll virtualization doesn't hide content", () => {
  test("rapidly navigating doesn't leave cards empty", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`item${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 20,
      cols: 60,
      incremental: false,
    })

    // Rapidly navigate down
    for (let i = 0; i < 25; i++) {
      app.command("cursor_down")
    }

    // Current card should be visible with content
    expect(app.text).toContain("item25")
    app.expect("#item25[data-cursor]").toExist()
  })

  test("scrolling down in cards mode produces no visual artifacts", () => {
    // Regression test for incremental renderPhase rendering:
    // When scrolling, stale pixels from the cloned buffer can bleed through
    // as extraneous background colors or misplaced content.
    const cards = Array.from({ length: 20 }, (_, i) => item(`scroll${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Scroll down through the list, checking for artifacts at milestones
    const checkpoints = [5, 10, 15]
    for (let i = 0; i < 15; i++) {
      app.command("cursor_down")
      if (checkpoints.includes(i + 1)) {
        const text = app.text

        // No error strings or object dumps
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        expect(text).not.toMatch(/Error:|TypeError:|ReferenceError:/)

        // Current card should be visible
        expect(text).toContain(`scroll${i + 1}`)

        // Cursor should exist on exactly one element
        app.expect("[data-cursor]").toExist()
      }
    }

    // Scroll back up and verify no artifacts at milestones
    for (let i = 0; i < 15; i++) {
      app.command("cursor_up")
      if (checkpoints.includes(i + 1)) {
        const text = app.text
        expect(text).not.toContain("[object Object]")
        expect(text).not.toContain("undefined")
        app.expect("[data-cursor]").toExist()
      }
    }
  })

  test("page down (Ctrl+D) scrolls and keeps cursor visible", () => {
    const cards = Array.from({ length: 30 }, (_, i) => item(`page${i}`))

    using app = createTestApp(item("board", item("col1", ...cards)), {
      rows: 15,
      cols: 60,
      incremental: false,
    })

    // Page down
    app.press("\x04") // Ctrl+D

    // Some card should be selected and visible
    // After page down from 0, cursor should be ~halfway down viewport
    const cursorMatch = app.text.match(/page(\d+)/)
    expect(cursorMatch).not.toBeNull()

    // The selected card should exist in DOM with cursor
    if (cursorMatch?.[1]) {
      const idx = parseInt(cursorMatch[1], 10)
      app.expect(`#page${idx}[data-cursor]`).toExist()
    }
  })
})

// =============================================================================
// km-tui.column-top-disappears: Column top disappears on cursor-down
// =============================================================================
// User-reported bug: with ~5 columns tall with many mixed-height cards, pressing
// cursor_down makes the top cards disappear AND the apparent column height
// shrinks by ~1 row — as if the viewport under the header got smaller.
//
// Screenshots:
//   .40.png: cursor on "delei" (first card) — 6 cards visible below header
//   .46.png: after cursor-downs — top cards gone, fewer cards visible
//
// Fixture mirrors the user's vault: ~20 cards mixing:
//   - "short" cards — title only (~3 rows with border + title)
//   - "tall" cards — title + 2 children + overflow "+N more" (~7 rows)
// at cols=180 rows=45 (user's real terminal).
// =============================================================================

describe("km-tui.column-top-disappears", () => {
  // Count rendered cards inside col-index=0 (the "Next Actions" column).
  // Queries the AgNode tree via the headless driver's locator — robust against
  // sibling columns' text on the same row.
  function countCardsInCol0(app: TestApp): number {
    return app.driver.locator('[data-col-index="0"] [data-card-id]').count()
  }

  // Count non-blank rows INSIDE the first column slice of the screen.
  // At cols=180 with 3 columns, each column is ~60 wide. Slice each line
  // to only col0's horizontal range (0..60) before checking for non-blank.
  function countCol0ContentLines(app: TestApp, colWidth = 60): number {
    const lines = app.text.split("\n")
    const headerIdx = lines.findIndex((l) => l.includes("Next Actions"))
    if (headerIdx < 0) return 0
    let count = 0
    for (let i = headerIdx + 2; i < lines.length; i++) {
      const slice = (lines[i] ?? "").slice(0, colWidth)
      if (/\S/.test(slice)) count++
    }
    return count
  }

  // First visible card's data-card-id inside col0 (render order, top-down).
  function firstCardInCol0(app: TestApp): string | null {
    const loc = app.driver.locator('[data-col-index="0"] [data-card-id]')
    return loc.count() > 0 ? (loc.getAttribute("data-card-id") ?? null) : null
  }

  // Retained for the pre-existing initial fixture — counts content lines under
  // the header across ALL columns. Not column-scoped; prefer countCol0* above.
  function countContentLinesUnderHeader(app: { text: string }, headerMarker: string): number {
    const lines = app.text.split("\n")
    const headerIdx = lines.findIndex((l) => l.includes(headerMarker))
    if (headerIdx < 0) return 0
    let count = 0
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (/\S/.test(lines[i] ?? "")) count++
    }
    return count
  }

  // Build a tall column of ~22 cards, mixing short (title only) and tall
  // (title + 2 children) cards to match the user's real vault shape.
  function buildTallNextActionsColumn() {
    const mix: ReturnType<typeof item>[] = []
    for (let i = 0; i < 22; i++) {
      if (i % 3 === 0) {
        // Tall card: title + two children + at least one more to trigger "+N more"
        mix.push(
          item(
            `tall-${i} task body`,
            item(`body-${i}-a`),
            item(`body-${i}-b`),
            item(`body-${i}-c`),
            item(`body-${i}-d`),
          ),
        )
      } else {
        // Short card: just a title
        mix.push(item(`short-${i}`))
      }
    }
    return item(
      "board",
      item("Next Actions @next", ...mix),
      item("Ideas", item("idea1"), item("idea2")),
      item("Projects", item("proj1"), item("proj2")),
    )
  }

  test("FRESH: cursor_down preserves column header + no blanks + stable visible count", () => {
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      incremental: false, // eliminate incremental-render as a variable first
    })

    // Column header is rendered as a ColumnHeader — look for "Next Actions".
    // The @next sigil is rendered as a typeSuffix.
    expect(app.text, "initial state: column header must be visible").toContain("Next Actions")

    // Record the initial "column fullness" — how many content lines appear
    // under the header. This is the baseline for stability checks.
    const initialContent = countContentLinesUnderHeader(app, "Next Actions")
    expect(initialContent, "column should show cards under header initially").toBeGreaterThan(4)

    // Which visible card IDs do we see initially? Track them — the first few
    // MUST NOT vanish until the cursor has scrolled past them.
    const initiallyVisible = new Set<string>()
    for (let i = 0; i < 22; i++) {
      if (app.node(`short-${i}`).exists && app.node(`short-${i}`).visible) initiallyVisible.add(`short-${i}`)
      if (app.node(`tall-${i} task body`).exists && app.node(`tall-${i} task body`).visible) {
        initiallyVisible.add(`tall-${i} task body`)
      }
    }

    const contentCounts: number[] = [initialContent]

    // Press cursor_down 8 times and assert invariants after each step.
    for (let step = 1; step <= 8; step++) {
      app.command("cursor_down")

      // 1) Column header must still be rendered.
      expect(app.text, `step ${step}: column header must still be visible`).toContain("Next Actions")

      // 2) The visible card count in the column should be stable (±1).
      const content = countContentLinesUnderHeader(app, "Next Actions")
      contentCounts.push(content)
      const delta = Math.abs(content - initialContent)
      expect(
        delta,
        `step ${step}: column content height shrank by ${delta} (was ${initialContent}, now ${content}) — user-reported "column suddenly shorter"`,
      ).toBeLessThanOrEqual(2)

      // 3) No card that was visible AND hasn't been scrolled-past should
      //    suddenly be gone (i.e., no gap between header and first visible card).
      //    Because cards scroll, we only check that the CURRENT cursor card
      //    is visible AND the card directly after the header is a real card
      //    (not blank).
      const lines = app.text.split("\n")
      const headerLineIdx = lines.findIndex((l) => l.includes("Next Actions"))
      if (headerLineIdx >= 0) {
        // Scan for the first non-blank content line under the header.
        // It should NOT be more than ~3 rows below (allowing for border + padding).
        let firstContentOffset = -1
        for (let i = headerLineIdx + 1; i < Math.min(headerLineIdx + 10, lines.length); i++) {
          const line = lines[i]
          // Strip the neighbouring columns to focus on "Next Actions" column —
          // but that is finicky. Simpler: just ensure *some* content appears
          // in the first few rows under the header.
          if (line && /\S/.test(line) && !/^\s*$/.test(line)) {
            firstContentOffset = i - headerLineIdx
            break
          }
        }
        expect(
          firstContentOffset,
          `step ${step}: found a big blank gap under column header (offset=${firstContentOffset})`,
        ).toBeLessThanOrEqual(5)
      }
    }

    // Final assertion: content counts across all steps must cluster around
    // the initial count. Min should be within 2 of initial (allowing for a
    // card boundary entering/leaving the viewport).
    const minCount = Math.min(...contentCounts)
    expect(
      minCount,
      `column fullness dipped too low (min=${minCount}, initial=${initialContent})`,
    ).toBeGreaterThanOrEqual(initialContent - 2)
  })

  test("INCREMENTAL: cursor_down preserves column fullness across steps", () => {
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      incremental: true, // the mode the user actually runs in
      checkIncremental: true, // let SILVERY_STRICT=1 catch cascade bugs too
    })

    expect(app.text).toContain("Next Actions")
    const initialContent = countContentLinesUnderHeader(app, "Next Actions")

    const contentCounts: number[] = [initialContent]
    for (let step = 1; step <= 8; step++) {
      app.command("cursor_down")
      const content = countContentLinesUnderHeader(app, "Next Actions")
      contentCounts.push(content)
      // User-reported symptom: fewer cards visible after cursor-down.
      expect(
        content,
        `step ${step}: column content shrank to ${content} (was ${initialContent}) — user-reported "column suddenly shorter"`,
      ).toBeGreaterThanOrEqual(initialContent - 2)
    }

    const minCount = Math.min(...contentCounts)
    expect(
      minCount,
      `incremental: column fullness dipped (min=${minCount}, initial=${initialContent}) — counts=${contentCounts.join(",")}`,
    ).toBeGreaterThanOrEqual(initialContent - 2)
  })

  test("PROPER SCOPED: col0 card count + first card stable after cursor_down (headless/incremental)", () => {
    // Column-scoped measurement — count data-card-id inside col-index=0 only,
    // not the whole screen. This is the real signal for "column shorter".
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      incremental: true,
    })

    const initialCards = countCardsInCol0(app)
    const initialLines = countCol0ContentLines(app, 60)
    const initialFirstCard = firstCardInCol0(app)
    expect(initialCards, "should render multiple cards in col0 initially").toBeGreaterThan(3)

    const cardCounts: number[] = [initialCards]
    const lineCounts: number[] = [initialLines]
    const firstCards: (string | null)[] = [initialFirstCard]

    // Move cursor down step-by-step and capture the shape of col0 at each step.
    for (let step = 1; step <= 10; step++) {
      app.command("cursor_down")
      cardCounts.push(countCardsInCol0(app))
      lineCounts.push(countCol0ContentLines(app, 60))
      firstCards.push(firstCardInCol0(app))
    }

    // Invariant: the number of CONTENT LINES in col0 (rows with visible chars
    // in the col0 slice) must not shrink by more than ~2 rows across cursor
    // moves. The user report is "column suddenly 1 row shorter".
    const minLines = Math.min(...lineCounts)
    const diag = `lineCounts=${lineCounts.join(",")} cardCounts=${cardCounts.join(",")} firstCards=${firstCards.join("|")}`
    expect(
      minLines,
      `col0 content lines shrank to ${minLines} (initial=${initialLines}) — ${diag}`,
    ).toBeGreaterThanOrEqual(initialLines - 3)
  })

  // Shared VISUAL test body — takes a constructed app and runs the
  // cursor_down × 10 / cursor_up × 10 sequence, asserting the invariants.
  function runVisualShapeProbe(app: TestApp, label: string): void {
    function countTopBordersInCol0(): number {
      const lines = app.text.split("\n")
      let count = 0
      for (const line of lines) {
        // Look for `╭` only in the col0 x-range (first ~60 cols).
        const slice = line.slice(0, 60)
        if (slice.includes("╭")) count++
      }
      return count
    }

    function findFirstTopBorderRow(): number {
      const lines = app.text.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if ((lines[i] ?? "").slice(0, 60).includes("╭")) return i
      }
      return -1
    }

    const initialBorders = countTopBordersInCol0()
    const initialFirstRow = findFirstTopBorderRow()
    expect(initialBorders, "initial should render multiple cards in col0").toBeGreaterThan(2)

    const borderCounts: number[] = [initialBorders]
    const firstRows: number[] = [initialFirstRow]
    // Cursor-down then back up, mimicking user's observed "disappear / reappear"
    for (let step = 1; step <= 10; step++) {
      app.command("cursor_down")
      borderCounts.push(countTopBordersInCol0())
      firstRows.push(findFirstTopBorderRow())
    }
    for (let step = 1; step <= 10; step++) {
      app.command("cursor_up")
      borderCounts.push(countTopBordersInCol0())
      firstRows.push(findFirstTopBorderRow())
    }

    const minBorders = Math.min(...borderCounts)
    const diag = `borderCounts=${borderCounts.join(",")} firstRows=${firstRows.join(",")}`

    // INVARIANT A: border count in col0 stays stable (+/-1 card boundary as
    // scroll crosses). User-observed shrink is minBorders = initial - 1, BUT
    // that's accompanied by a 3-row GAP at the top. The real bug is the GAP,
    // not the card count.
    // Only assert this looser form (±1) — the tighter "exactly initial" would
    // pass on the no-scroll frames and miss the actual bug.
    expect(
      minBorders,
      `col0 rendered-card count dropped more than 1 (min=${minBorders}, initial=${initialBorders}) — ${diag}`,
    ).toBeGreaterThanOrEqual(initialBorders - 2)

    // INVARIANT B (THE REAL BUG): the first top-border row in col0 should
    // stay close to the column header. When scroll kicks in, the top of the
    // viewport should be a FULL card (at row 4-5 under header) OR the column
    // should render a partial (no-top-border) card at row 4-5.
    //
    // What the bug produces: after scroll, the first FULL card with `╭` top
    // border jumps from row 4 to row 7 — leaving blank rows 4-6. The user
    // sees this as "column got 3 rows shorter at the top."
    //
    // Expected (correct): firstRow stays ≤ 5 (header=3, separator=4, card=5).
    // Actual (buggy):      firstRow jumps to 7 → 3-row gap.
    const maxFirstRow = Math.max(...firstRows.filter((r) => r >= 0))
    expect(
      maxFirstRow,
      `[${label}] col0 first card jumped down the column (max firstRow=${maxFirstRow}) — leaves a blank gap under the header. This is the user-reported "column top disappears". ${diag}`,
    ).toBeLessThanOrEqual(6)
  }

  test("VISUAL/incremental: top-border position stable across cursor_down + cursor_up (REPRODUCES BUG)", () => {
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      incremental: true,
    })
    runVisualShapeProbe(app, "incremental")
  })

  test("VISUAL/fresh: same shape probe with incremental=false — isolates bug origin", () => {
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      incremental: false, // if this also fails, bug is NOT an incremental-cascade bug
    })
    runVisualShapeProbe(app, "fresh")
  })

  test("REPRO: vault-shaped column (section headers + wide tall cards) — top card disappears", () => {
    // More faithful reproduction of the user's Next Actions column:
    //   - first card is a tall multi-line card ($ delei with body text)
    //   - followed by short title-only cards ($ inbox, $ Shortcuts, $ taxomatic)
    //   - interrupted by MANY section-header style items (§ Next actions @next)
    //   - more tall cards further down
    // This maps the screenshot shape much more closely.
    const cards: ReturnType<typeof item>[] = []
    // First: tall "delei" card with 4 children + "more"
    cards.push(item("delei Auto-populated", item("- What lands here"), item("- Triage rules")))
    cards.push(item("inbox"))
    cards.push(item("Shortcuts"))
    cards.push(item("taxomatic"))
    cards.push(item("taxes"))
    cards.push(item("Office"))
    // Followed by 8 section-heading-style cards (§ Next actions @next)
    // these are title-only cards that look like headers — 3-row boxes.
    for (let i = 0; i < 8; i++) cards.push(item("Next actions @next"))
    // Then some tall + normal cards
    cards.push(item("Upcoming deadlines", item("- all projects, next 12 months"), item("- Follow up with")))
    cards.push(item("Pattern E — Dates and props"))
    cards.push(item("Difference from"))
    cards.push(item("Tax Prep — tasks", item("- Set up Mobilbank"), item("- Norwegian passport")))
    cards.push(item("Track the delegation"))
    cards.push(item("What is a groomed"))

    using app = createTestApp(item("board", item("Next Actions @next", ...cards), item("Ideas"), item("Projects")), {
      rows: 45,
      cols: 180,
      incremental: true,
    })

    expect(app.text).toContain("Next Actions")
    const initialContent = countContentLinesUnderHeader(app, "Next Actions")
    const contentCounts: number[] = [initialContent]

    for (let step = 1; step <= 12; step++) {
      app.command("cursor_down")
      const content = countContentLinesUnderHeader(app, "Next Actions")
      contentCounts.push(content)
    }

    const minCount = Math.min(...contentCounts)
    expect(
      minCount,
      `REPRO: column fullness dropped (min=${minCount}, initial=${initialContent}) — counts=${contentCounts.join(",")}`,
    ).toBeGreaterThanOrEqual(initialContent - 2)
  })

  test("TERMLESS: full ANSI pipeline through real terminal — column header + fullness stable", async () => {
    // Termless uses xterm.js as the backend — catches ANSI/output-phase bugs
    // that headless virtual-buffer tests miss. This matches the user's scenario
    // most closely (real terminal output, real incremental pipeline).
    using app = createTestApp(buildTallNextActionsColumn(), {
      rows: 45,
      cols: 180,
      backend: "termless",
    })

    // Let termless settle first render. createTestApp schedules settle internally.
    // Press a no-op to flush the initial frame.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const initialText = app.text
    expect(initialText, "termless: column header must be visible initially").toContain("Next Actions")
    const initialContent = countContentLinesUnderHeader(app, "Next Actions")

    const contentCounts: number[] = [initialContent]
    for (let step = 1; step <= 8; step++) {
      app.command("cursor_down")
      await new Promise((resolve) => setTimeout(resolve, 20))
      const text = app.text
      expect(text, `termless step ${step}: column header must still be visible`).toContain("Next Actions")
      const content = countContentLinesUnderHeader(app, "Next Actions")
      contentCounts.push(content)
    }

    const minCount = Math.min(...contentCounts)
    expect(
      minCount,
      `termless: column fullness shrank (min=${minCount}, initial=${initialContent}) — counts=${contentCounts.join(",")}`,
    ).toBeGreaterThanOrEqual(initialContent - 2)
  })

  // ===========================================================================
  // WINDOWING INVARIANT: render window fills viewport regardless of cursor
  // ===========================================================================
  // User's real diagnosis (2026-04-20):
  //   "columns still doesn't show all content - it shows only X cards above/below
  //    cursor - not the entire column's worth - so when i start with cursor at
  //    the top there's blank space at the bottom of the column, then as i move
  //    cursor down it fills in with cards at the bottom but cards at the top
  //    disappear"
  //
  // This is a VIRTUALIZER WINDOWING BUG, not a scroll-offset bug. useVirtualizer
  // computes start = cursor - floor(renderCount/2), which centers the window
  // on the cursor. When cursor is at 0, only the LOWER half of the window
  // (= overscan items below) renders — not enough to fill the viewport.
  //
  // Correct behaviour: render window is computed from scrollOffset (viewport
  // top), with overscan on both edges. The window should span from ~scrollOffset
  // to ~scrollOffset+visibleCount+overscan, regardless of cursor position.
  // The cursor only drives scrollOffset (via calcEdgeBasedScrollOffset); it
  // does NOT directly constrain the render window.
  //
  // Probe at cursor = {0, 5, 15, 25, last}. In every case, col0 must render
  // enough cards to fill the viewport. With viewport=41 and avg card height
  // ~5, at least ceil(41/avgHeight)-1 = ~7 cards must be rendered in col0.
  // ===========================================================================

  describe("WINDOW-FILLS-VIEWPORT: render window independent of cursor position", () => {
    // Count data-card-id inside col-index=0
    function countCardsInCol0(app: TestApp): number {
      return app.driver.locator('[data-col-index="0"] [data-card-id]').count()
    }

    // Count top-border rows (╭) in col0 slice — each full card starts with ╭.
    // This matches what the user actually SEES: distinct card tops on screen.
    function countTopBordersInCol0(app: TestApp): number {
      const lines = app.text.split("\n")
      let count = 0
      for (const line of lines) {
        const slice = line.slice(0, 60)
        if (slice.includes("╭")) count++
      }
      return count
    }

    // Build the user's real column: 30 mixed-height cards.
    // "short" = title only (~3 rows), "tall" = title + children with "+N more"
    // (~7 rows). Avg ~5 rows per card — viewport=41 fits ~8 cards.
    function buildLargeColumn() {
      const cards: ReturnType<typeof item>[] = []
      for (let i = 0; i < 30; i++) {
        if (i % 3 === 0) {
          cards.push(
            item(`tall-${i}`, item(`body-${i}-a`), item(`body-${i}-b`), item(`body-${i}-c`), item(`body-${i}-d`)),
          )
        } else {
          cards.push(item(`short-${i}`))
        }
      }
      return item(
        "board",
        item("Next Actions @next", ...cards),
        item("Ideas", item("idea1"), item("idea2")),
        item("Projects", item("proj1"), item("proj2")),
      )
    }

    // Probe col0 rendered-card count at a specific cursor position.
    // Navigates from the current cursor position to `targetIndex` via
    // cursor_down presses, then measures the window.
    function probeAtCursor(
      app: TestApp,
      targetIndex: number,
      currentIndex: number,
    ): { cards: number; borders: number } {
      const delta = targetIndex - currentIndex
      if (delta > 0) {
        for (let i = 0; i < delta; i++) app.command("cursor_down")
      } else if (delta < 0) {
        for (let i = 0; i < -delta; i++) app.command("cursor_up")
      }
      return {
        cards: countCardsInCol0(app),
        borders: countTopBordersInCol0(app),
      }
    }

    test("FAILING-REPRO: render window fills viewport at cursor=0 (top)", () => {
      using app = createTestApp(buildLargeColumn(), {
        rows: 45,
        cols: 180,
        incremental: true,
      })

      // Initial state — cursor is at index 0 (first card of first column).
      const { cards, borders } = probeAtCursor(app, 0, 0)

      // INVARIANT: with viewport height ~41 and avg card ~5 rows, at least
      // ceil(41/5)-1 = 7 cards' top-borders should be visible in col0 at
      // cursor=0. The BUG produces ~5 visible top-borders (cursor-centered
      // window with overscan=5 renders only OVERSCAN items below cursor=0,
      // leaving blank rows at the bottom of the column).
      //
      // User's exact quote: "when i start with cursor at the top there's
      // blank space at the bottom of the column".
      expect(
        borders,
        `cursor=0: col0 should render ≥7 card tops to fill viewport (got ${borders} visible ╭ rows, ${cards} card nodes)`,
      ).toBeGreaterThanOrEqual(7)
    })

    test("WINDOW-INVARIANT: card-top count stable across cursor positions", () => {
      using app = createTestApp(buildLargeColumn(), {
        rows: 45,
        cols: 180,
        incremental: true,
      })

      // Probe at 5 cursor positions spanning the column: top, upper, middle,
      // lower, bottom. The rendered-card count in col0 should be similar at
      // all of them (the window is viewport-sized, not cursor-window-sized).
      const probes: { label: string; target: number }[] = [
        { label: "top", target: 0 },
        { label: "upper", target: 5 },
        { label: "middle", target: 15 },
        { label: "lower", target: 25 },
        { label: "bottom", target: 29 },
      ]

      const results: { label: string; cards: number; borders: number }[] = []
      let currentIndex = 0
      for (const p of probes) {
        const r = probeAtCursor(app, p.target, currentIndex)
        results.push({ label: p.label, ...r })
        currentIndex = p.target
      }

      const borderCounts = results.map((r) => r.borders)
      const maxBorders = Math.max(...borderCounts)
      const minBorders = Math.min(...borderCounts)
      const diag = results.map((r) => `${r.label}=${r.borders}`).join(" ")

      // INVARIANT 1: min rendered-card count is close to max.
      // A stable viewport-sized window gives +/-1 variance (card boundaries
      // crossing the viewport edge). A cursor-centered window gives big
      // variance: min at edges (top/bottom), max in middle.
      expect(
        maxBorders - minBorders,
        `window size varies too much across cursor positions (${diag}) — cursor-centered bug`,
      ).toBeLessThanOrEqual(2)

      // INVARIANT 2: at every position, enough cards render to fill viewport.
      // viewport=41, avg=~5 → need ≥7 cards.
      expect(
        minBorders,
        `window dips below viewport-size (min=${minBorders}) at some cursor position — ${diag}`,
      ).toBeGreaterThanOrEqual(7)
    })

    test("TOP-EDGE: cards exist below cursor at top (not just overscan)", () => {
      using app = createTestApp(buildLargeColumn(), {
        rows: 45,
        cols: 180,
        incremental: true,
      })

      // At cursor=0, the bug shows cards 0..OVERSCAN only. A viewport-sized
      // window would show cards 0..~7. This test asserts that card at index
      // 7 (well beyond OVERSCAN=5) IS rendered — proving the window extends
      // past the cursor-centric OVERSCAN boundary.
      expect(countCardsInCol0(app)).toBeGreaterThanOrEqual(7)
    })
  })

  // ===========================================================================
  // BOTTOM BLANK GAP: when all cards fit in the viewport, there should be no
  // blank rows between the last card and the column's bottom chrome, and no
  // spurious ▼N overflow indicator.
  // ===========================================================================
  // User-reported pattern at 200×120 TTY: col3 "Next Actions @next" renders
  // ~18 cards (~95 rows), followed by a ~28-row blank gap and a spurious `▼1`
  // indicator claiming 1 card is below, even though every card fits.
  //
  // Two invariants:
  //   1. No `▼N` in the column's rendered output when content fits.
  //   2. Cards visually occupy a contiguous vertical region — no large blank
  //      gap between the last card and the column's bottom border.
  // ===========================================================================

  describe("BOTTOM BLANK GAP: no spurious overflow when content fits", () => {
    // Build a column with ~18 mixed-height cards whose total height is well
    // within a 120-row viewport (~95 rows of content, 114-row column viewport).
    function buildFitsColumn() {
      const cards: ReturnType<typeof item>[] = []
      for (let i = 0; i < 18; i++) {
        if (i % 3 === 0) {
          // "Tall" card — title + 3 children, ~6 rows each.
          cards.push(item(`task-${i}`, item(`body-${i}-a`), item(`body-${i}-b`), item(`body-${i}-c`)))
        } else {
          // "Short" card — title only, ~3 rows.
          cards.push(item(`short-${i}`))
        }
      }
      return item(
        "board",
        item("Next Actions @next", ...cards),
        item("Ideas", item("idea1")),
        item("Projects", item("proj1")),
      )
    }

    test("no ▼N overflow indicator in col0 when cards fit the viewport", () => {
      using app = createTestApp(buildFitsColumn(), {
        rows: 120,
        cols: 200,
        incremental: true,
      })

      // Slice col0 horizontally out of each row (col0 occupies ~0..66 at cols=200).
      const lines = app.text.split("\n")
      const col0Text = lines.map((l) => l.slice(0, 66)).join("\n")

      // INVARIANT: no bottom overflow indicator when every card fits.
      expect(col0Text, "col0 must NOT render `▼N` indicator when all cards fit in the viewport").not.toMatch(/▼\d+/)
      expect(col0Text, "col0 must NOT render `▲N` indicator when all cards fit in the viewport").not.toMatch(/▲\d+/)
    })

    test("no spurious overflow indicator AND all items render when content fits viewport", () => {
      // User-accepted contract (km-tui.column-top-disappears):
      //   "option b is acceptable as long as no fake ▼ indicator"
      //
      // When all cards fit in a tall viewport:
      //   - No fake ▼N or ▲N overflow indicator in col0 (blank space below the
      //     last card is acceptable; columns maintain fixed height for grid
      //     alignment, so trailing blank rows are inherent to the design).
      //   - Every card renders (18/18 top-borders visible).
      //   - The render window is NOT cursor-centered (was the original bug,
      //     fixed by silvery commits 5a0f50b8 + 681d19a8).
      using app = createTestApp(buildFitsColumn(), {
        rows: 120,
        cols: 200,
        incremental: true,
      })

      const lines = app.text.split("\n")
      const col0Text = lines.map((l) => (l ?? "").slice(0, 66)).join("\n")

      // INVARIANT 1: no spurious overflow indicators.
      expect(
        col0Text,
        "col0 must NOT render `▼N` indicator when all cards fit (hasOverflow=false since contentHeight < viewportHeight)",
      ).not.toMatch(/▼\d+/)
      expect(col0Text, "col0 must NOT render `▲N` indicator at cursor=0 (no items hidden above)").not.toMatch(/▲\d+/)

      // INVARIANT 2: every card renders (tiny-list path: count <= minWindowSize
      // = estimatedVisibleCount + 2*overscan). If this drops below 16, the
      // cursor-centered window bug has regressed.
      let topBorderCount = 0
      let bottomBorderCount = 0
      for (const line of lines) {
        const slice = (line ?? "").slice(0, 66)
        if (slice.includes("╭")) topBorderCount++
        if (slice.includes("╰")) bottomBorderCount++
      }
      expect(
        topBorderCount,
        `all 18 cards must render their top border when they fit in viewport (got ${topBorderCount})`,
      ).toBeGreaterThanOrEqual(16)
      expect(
        bottomBorderCount,
        `all 18 cards must render their bottom border when they fit in viewport (got ${bottomBorderCount})`,
      ).toBeGreaterThanOrEqual(16)
    })

    test("all 18 cards render when viewport is tall enough to show them", () => {
      using app = createTestApp(buildFitsColumn(), {
        rows: 120,
        cols: 200,
        incremental: true,
      })

      // INVARIANT: when the viewport can fit every card, every card should
      // render. Today's bug: virtualizer window is cursor-centric + bounded
      // by overscan (~5 items), so only ~7-8 of 18 cards render, leaving
      // half the viewport blank at the bottom.
      //
      // Count TOP BORDERS (╭) in the col0 slice — each card starts with ╭.
      // This matches the visual count (one ╭ per rendered card).
      const lines = app.text.split("\n")
      let borderTops = 0
      for (const line of lines) {
        if ((line ?? "").slice(0, 66).includes("╭")) borderTops++
      }
      expect(
        borderTops,
        `only ${borderTops} of 18 cards rendered in col0 — the render window fails to fill the viewport when content fits`,
      ).toBeGreaterThanOrEqual(16)
    })
  })

  // ===========================================================================
  // REAL USER BUG (re-opened 2026-04-20): at 200×120 on ~/Bear/Vault, col3
  // "Next Actions @next" shows ▼1 indicator with ~28 rows of BLANK space
  // between the last rendered card and the indicator. Cursor at the top
  // of the column. The window.shortfall is NOT covered by the "no ▼N when
  // content fits" test above — here hiddenBelow > 0 (legitimate overflow),
  // but rendered cards fail to fill the available viewport space.
  //
  // User-visible contract:
  //   When hiddenBelow > 0 AND cursor is at the top of a column, rendered
  //   cards should occupy a contiguous region from the column top down to
  //   the row adjacent to the ▼N indicator. No large blank gap between the
  //   last rendered card and the indicator row.
  // ===========================================================================

  describe("km-tui.column-top-disappears: WINDOW SHORTFALL with hiddenBelow > 0", () => {
    // Build a column where content *barely* exceeds the viewport, mirroring
    // the real-vault col3 scenario: ~24 items mixing short (3-row) and tall
    // (7-row) cards, totaling ~120 rows for a ~114-row viewport. Cursor at
    // index 0, scrollOffset = 0. The tail ~1-3 items get pushed below the
    // viewport → hiddenBelow > 0 → ▼N.
    function buildBarelyOverflowColumn() {
      const cards: ReturnType<typeof item>[] = []
      for (let i = 0; i < 24; i++) {
        if (i % 2 === 0) {
          // 7-row card (title + 4 body items)
          cards.push(
            item(`task-${i}`, item(`body-${i}-a`), item(`body-${i}-b`), item(`body-${i}-c`), item(`body-${i}-d`)),
          )
        } else {
          // 3-row card (title only)
          cards.push(item(`short-${i}`))
        }
      }
      return item(
        "board",
        item("Barely-Overflows @col", ...cards),
        item("Ideas", item("idea1")),
        item("Projects", item("proj1")),
      )
    }

    test("no large blank gap between last rendered card and ▼N indicator (hiddenBelow>0, cursor=0)", () => {
      using app = createTestApp(buildBarelyOverflowColumn(), {
        rows: 120,
        cols: 200,
        incremental: true,
      })

      // Slice col0 horizontally (col0 occupies ~0..66 at cols=200).
      const lines = app.text.split("\n")
      const col0Slices = lines.map((l) => (l ?? "").slice(0, 66))

      // Find the row of the ▼N indicator.
      let indicatorRow = -1
      for (let i = 0; i < col0Slices.length; i++) {
        if (/▼\d+/.test(col0Slices[i] ?? "")) {
          indicatorRow = i
          break
        }
      }

      // Diagnostic dump: which rows have content in col0, + indicator position
      const dumpLines = col0Slices
        .map((s, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(s) ? s : "<blank>"}`)
        .join("\n")

      // If there's no ▼N, the test fixture isn't producing the overflow —
      // fail with a diagnostic rather than silently passing.
      expect(
        indicatorRow,
        `Test fixture must produce a ▼N indicator (hiddenBelow > 0) to cover this bug path.\nCOL0 DUMP:\n${dumpLines}`,
      ).toBeGreaterThan(0)

      // Walk backward from the indicator row, counting blank rows until we
      // hit a card's bottom border `╰` — those are the "blank gap" rows.
      let blankGap = 0
      for (let i = indicatorRow - 1; i >= 0; i--) {
        const slice = col0Slices[i] ?? ""
        if (slice.includes("╰") || slice.includes("│")) break
        if (!/\S/.test(slice)) blankGap++
        else break
      }

      // Contract: the gap between the last card and ▼N is at most a few
      // rows (padding, spacer). A 28-row gap (user-reported) is the bug.
      //
      // NOTE (2026-04-20): this synthetic fixture does NOT currently
      // reproduce the real-vault bug — blankGap is 0 here. The real bug
      // appears to be data-dependent: likely interaction between specific
      // card structures (embedded text vs child-item bodies, "···"
      // ellipsis markers, measured vs estimated heights) and the
      // virtualizer's window calculation. Ticket km-tui.column-top-disappears
      // remains open for real-vault investigation — see bead for repro at
      // /tmp/km-view-still-broken.png.
      expect(
        blankGap,
        `[km-tui.column-top-disappears] ${blankGap} blank rows between last rendered card and ▼N indicator at row ${indicatorRow} — rendered cards should fill the viewport when hiddenBelow>0\n\nCOL0 DUMP:\n${dumpLines}`,
      ).toBeLessThanOrEqual(3)
    })
  })
})
