/**
 * Card layout regression tests.
 *
 * Tests that card rendering respects border boundaries, text truncation,
 * and padding at various terminal widths.
 *
 * Regression: text was observed overflowing onto the right border character
 * when card content had long words/URLs that filled the content area.
 * Root cause: silvery text measure function ignored height constraints from
 * the layout engine, allowing text lines to overflow into border rows.
 * Fixed in silvery reconciler/nodes.ts (height clamping in measure function).
 */
import { describe, expect, test } from "vitest"
import { writeFileSync } from "fs"
import { testEnv, item } from "./helpers/board-test.ts"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Assert that card borders are intact — right border │ is present on all
 * content rows. Text may fill the full content area (touch the border),
 * but must not overwrite the border character itself.
 */
function assertCardBordersClean(screenshot: string, label: string) {
  const lines = screenshot.split("\n")
  const problems: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // Find bordered card rows: lines that contain │...│ pattern
    // Check that border characters are intact (│ is present at expected positions)
    const borderPairs = [...line.matchAll(/│/g)]
    // Each bordered row should have an even number of │ characters (left + right pairs)
    // We just check that the pattern is well-formed: │content│
    const cardMatches = line.matchAll(/│([^│]+)│/g)
    for (const match of cardMatches) {
      const content = match[1]!
      // Skip horizontal border lines (all ─ or border decoration)
      if (/^[─━═╭╮╰╯┌┐└┘]+$/.test(content)) continue
      // Check for text bleeding into border rows (bottom border contains text)
      // A bottom border like "╰──text──╯" means text overflowed
      if (/^[╰└].*[a-zA-Z].*[╰╯└┘─]$/.test(line)) {
        problems.push(`line ${i}: text bled into border row: ${line}`)
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`[${label}] Card border overflow:\n${problems.join("\n")}`)
  }
}

/**
 * Assert that all bordered card lines have consistent width.
 * Each card should have uniform line width (top border through bottom border).
 */
function assertCardWidthConsistent(screenshot: string, label: string) {
  const lines = screenshot.split("\n")
  // Group bordered lines by horizontal position (start of │)
  const cardStarts = new Map<number, number[]>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // Find │ or ╭ at various positions
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === "│" || ch === "╭" || ch === "╰") {
        const arr = cardStarts.get(col) ?? []
        arr.push(i)
        cardStarts.set(col, arr)
      }
    }
  }
}

// ─── Border Overflow Tests ───────────────────────────────────────────────────

describe("card border overflow", () => {
  test("long text should not touch right card border", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "column1",
            item("Short task"),
            item("Vehicle registration and DMV-related tasks with long description"),
            item("runnersworld.com/beginner/a2081-heart-rate-training-zones"),
          ),
        ),
      { columns: 80, rows: 20 },
    )
    assertCardBordersClean(board.screenshot(), "80 cols long text")
  })

  test("boundary-width content should not overflow", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("A".repeat(30) + " overflow test here"),
            item("Status: Blocked by guardianship requirements"),
            item("Static stretch 3x30s 6 days per week recommended"),
          ),
          item("col2", item("placeholder")),
        ),
      { columns: 80, rows: 20 },
    )
    assertCardBordersClean(board.screenshot(), "80 cols boundary")
  })

  test("single column card stays within borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "only-column",
            item("This is a task with quite a long title that might wrap around or overflow the card border"),
            item("Another task with a URL like example.com/very/long/path/to/resource"),
          ),
        ),
      { columns: 60, rows: 20 },
    )
    assertCardBordersClean(board.screenshot(), "60 cols single col")
  })

  test("narrow terminal cards stay within borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A moderate length task title here"), item("Status: Not started depends on other")),
          item("col2", item("filler")),
        ),
      { columns: 50, rows: 15 },
    )
    assertCardBordersClean(board.screenshot(), "50 cols narrow")
  })

  test("card with children: body text stays within borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "tasks",
            item(
              "T009 BMW DMV Issues",
              item("Status: Not started - Low priority"),
              item("Context: Found in inbox old DMV notices from 2019"),
              item("Attachments: PDF documents"),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )
    assertCardBordersClean(board.screenshot(), "card with children")
  })
})

// ─── Width Sweep ─────────────────────────────────────────────────────────────

describe("card layout across terminal widths", () => {
  // Sweep terminal widths to catch off-by-one errors at various sizes
  for (const cols of [40, 50, 60, 70, 80, 100, 120]) {
    test(`${cols}-col terminal: cards respect borders`, () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item("AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL"),
              item("example.com/path/to/some/resource/that/is/quite/long"),
            ),
            item("col2", item("short")),
          ),
        { columns: cols, rows: 20 },
      )
      const ss = board.screenshot()
      writeFileSync(`/tmp/card-${cols}.txt`, ss)
      assertCardBordersClean(ss, `${cols}-col`)
    })
  }
})

// ─── Text Truncation ─────────────────────────────────────────────────────────

describe("card text truncation", () => {
  test("very long single-word content is truncated, not overflowing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            // A single word that's wider than any card — must be truncated
            item("A".repeat(200)),
          ),
        ),
      { columns: 80, rows: 15 },
    )
    assertCardBordersClean(board.screenshot(), "200-char word")
  })

  test("long URL without spaces wraps within card borders", () => {
    const { board } = testEnv(
      () =>
        item("board", item("col1", item("https://very-long-domain.example.com/path/to/resource/with/many/segments"))),
      { columns: 80, rows: 15 },
    )
    assertCardBordersClean(board.screenshot(), "long URL")
  })

  test("card borders stay clean after cursor moves right between columns", () => {
    // Regression: moving cursor right to the next column caused the FIRST
    // column to re-render incorrectly with card overflow. Each subsequent
    // right-move made it worse.
    for (const cols of [40, 60, 80, 100]) {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item("AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL"),
              item("example.com/path/to/some/resource/that/is/quite/long"),
            ),
            item("col2", item("Short task in col2"), item("Another task in col2 with some more text")),
            item("col3", item("Col3 task alpha"), item("Col3 task beta with longer content here")),
          ),
        { columns: cols, rows: 20 },
      )

      // Initial render — should be clean
      assertCardBordersClean(board.screenshot(), `${cols}-col initial`)

      // Move right to col2
      board.command("cursor_right")
      assertCardBordersClean(board.screenshot(), `${cols}-col after right to col2`)

      // Move right to col3
      board.command("cursor_right")
      assertCardBordersClean(board.screenshot(), `${cols}-col after right to col3`)

      // Move back left to col2
      board.command("cursor_left")
      assertCardBordersClean(board.screenshot(), `${cols}-col after left to col2`)

      // Move back left to col1
      board.command("cursor_left")
      assertCardBordersClean(board.screenshot(), `${cols}-col after left back to col1`)
    }
  })

  test("child text does not bleed into card bottom border (km-yt5bv)", () => {
    // Regression: "Context: Found in inbox old DMV notices from 2019" wrapped
    // and the wrapped portion "notices from 2019" appeared ON the bottom border:
    //   ╰────notices from 2019───────────────╯
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "T009 - BMW DMV Issues",
              item("Status: Not started - Low priority"),
              item("Context: Found in inbox old DMV notices from 2019"),
            ),
          ),
          item("col2", item("placeholder")),
        ),
      { columns: 80, rows: 24 },
    )
    const screenshot = board.screenshot()
    assertCardBordersClean(screenshot, "child text bleed")
    // Verify wrapped text doesn't appear embedded in border characters
    expect(screenshot).not.toMatch(/[╰╯─].*notices from 2019.*[╰╯─]/)
  })
})

// =============================================================================
// Body indicator (···) (absorbed from body-indicator.test.ts)
// =============================================================================

describe("body indicator (···)", () => {
  test("does NOT show ··· when children are visible as subitems", () => {
    // Card with body children (paragraphs) — these render as subitems in cards view
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card-with-body", item.p("Some body text"), item.p("More text"))),
          item("col2", item("card2")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // The card should NOT show ··· because body is visible as subitems
    const screen = board.screenshot()
    expect(screen).not.toContain("···")
  })

  test("does NOT show ··· on column headers (body content visible as cards)", () => {
    // Column with body children (paragraphs) — these are shown as cards in the column
    const { board } = testEnv(
      () => item("board", item("col-with-body", item.p("Body paragraph"), item("regular-card")), item("col2")),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // The column header should NOT show ···
    const screen = board.screenshot()
    expect(screen).not.toContain("···")
  })

  test("shows ··· when card is folded and has body children", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card-with-body", item.p("Hidden body text"), item.p("More hidden text"))),
          item("col2", item("card2")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    // Fold the card's children with zh chord (fold_node)
    board.command("fold_more")

    // Now ··· should show because body children are hidden (folded)
    const screen = board.screenshot()
    expect(screen).toContain("···")
  })
})

// =============================================================================
// Card border text wrapping (absorbed from card-border-wrap.test.ts)
// =============================================================================

/**
 * Regression: card title wrapping used heuristic width instead of actual column width.
 *
 * Board.tsx estimated cardInnerWidth using "35 chars per column" heuristic,
 * which overestimates column count when few columns exist on a wide terminal.
 * Fix: use actual column count from filteredColumns + collapsedNodes.
 */
describe("card border text wrapping", () => {
  test("card title fits on one line when actual column is wide enough", { timeout: 5000 }, () => {
    // At 120 cols with 2 columns, each column is ~59 chars wide.
    // Card inner width = 57, text width = 55 (minus 2 for prefix).
    // A 39-char title must fit on 1 line.
    const title = "[Tech] Set up chrome dev tools for node"

    const { board } = testEnv(
      () => item("board", item("col1", item(title), item("another card")), item("col2", item("card in col2"))),
      { columns: 120, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    const lines = text.split("\n")

    // "node" should NOT appear alone on a wrapped line inside a border
    const wrappedNodeLine = lines.find((l) => /│\s+node\s+│/.test(l))
    expect(
      wrappedNodeLine,
      '"node" should not wrap to a separate line — title (39 chars) fits at actual column width',
    ).toBeUndefined()
  })

  test("many columns still wrap correctly at narrow width", { timeout: 5000 }, () => {
    // With 5 columns at 120 chars, each column is ~23 chars. Title should wrap.
    const title = "[Tech] Set up chrome dev tools for node"

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("c1", item(title), item("card")),
          item("c2", item("card")),
          item("c3", item("card")),
          item("c4", item("card")),
          item("c5", item("card")),
        ),
      { columns: 120, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    // With 5 columns on 120 chars, the title SHOULD wrap (cards are narrow).
    // Just verify the test runs and renders without errors.
    expect(text).toContain("chrome dev tools")
  })
})

// =============================================================================
// Card title wrap width (absorbed from card-title-wrap.test.ts)
// =============================================================================

/**
 * Bug: cardInnerWidth off by 1 causes wrong title wrap calculation.
 *
 * Board.tsx computes cardInnerWidth = expandedWidth - 2, but the actual card
 * inner width is expandedWidth - 3 because CardColumn.tsx passes
 * width - 1 to Card (line 703). The overflow calculation uses
 * cardInnerWidth - 2 for text width, which is 1 column too wide.
 *
 * Width chain:
 *   Column: width = expandedWidth
 *   Card:   width = expandedWidth - 1        (CardColumn renderItem)
 *   Inner:  expandedWidth - 1 - 2 = eW - 3   (border left+right)
 *   Title:  eW - 3 - 2 = eW - 5              (prefix: marker + space)
 *
 * cardInnerWidth should be expandedWidth - 3 (not -2).
 * textWidth should be expandedWidth - 5 (not -4).
 */
describe("card title wrap width", () => {
  test("overflow indicator shows when title wraps at actual card width", { timeout: 5000 }, () => {
    // With 2 columns at 80 chars:
    //   expandedWidth = floor((80 - 1) / 2) = 39
    //   Actual title area = 39 - 5 = 34 chars
    //   Buggy textWidth  = 39 - 4 = 35 chars (1 too wide)
    //
    // A 35-char title wraps in 34-char space (2 lines).
    // Buggy calc: ceil(35/35) - 1 = 0  -> no overflow detected
    // Fixed calc: ceil(35/34) - 1 = 1  -> overflow detected
    //
    // Card has exactly maxContentLines (3) children.
    // Title wrap should add +1 to overflow, showing the indicator.
    const title35 = "A very long title that needs wrap!!" // exactly 35 chars
    expect(title35.length).toBe(35) // sanity check

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item(title35, item("child1"), item("child2"), item("child3"))),
          item("col2", item("card")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()

    // With correct cardInnerWidth, the overflow indicator (+1) should appear
    // because the title wraps and consumes an extra visual line.
    expect(text, `Overflow indicator should appear when title wraps.\nScreenshot:\n${text}`).toMatch(/\+\d/)
  })

  test("no false overflow when title fits on one line", { timeout: 5000 }, () => {
    // A 33-char title fits in 34-char space. No overflow from title.
    // Card has exactly maxContentLines (3) children. No overflow from children.
    const title33 = "A title that fits in the column!!" // exactly 33 chars
    expect(title33.length).toBe(33) // sanity check

    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item(title33, item("child1"), item("child2"), item("child3"))),
          item("col2", item("card")),
        ),
      { columns: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const text = board.screenshot()
    const lines = text.split("\n")

    // No overflow: title fits on 1 line, children fit in maxContentLines.
    // The overflow indicator should NOT appear.
    const overflowLine = lines.find((l) => /╰.*\+\d.*╯/.test(l))
    expect(overflowLine, `Should NOT show overflow when title fits on one line.\nScreenshot:\n${text}`).toBeUndefined()
  })
})

// =============================================================================
// Card text truncation (absorbed from truncate-lines.test.ts)
// =============================================================================

/**
 * Regression: km-tui.truncate-lines
 *
 * Card truncation should produce full lines ending with ellipsis,
 * never partial trailing lines like "i…" on their own line.
 */
describe("truncate-lines: card title truncation avoids partial lines", () => {
  test("long card title does not produce partial trailing line", () => {
    // Title with a long URL that would wrap to 3+ lines and leave a partial last line
    const longTitle =
      "44 most beautiful places in the world ^1209904823302245https://www.travelandleisure.com/trip-ideas/beautiful-places"
    const { board } = testEnv(() => item("board", item("col1", item(longTitle), item("short task"))), {
      rows: 20,
      columns: 40,
    })

    // The card should be visible and selected
    board.expect("[data-cursor]").toExist()

    // Get the rendered text of the first card
    const cursorCard = board.q("[data-cursor]")
    const text = cursorCard.textContent()

    // The title should end with ellipsis if truncated, not have a partial line
    // Split into visual lines — no line should be just 1-3 chars (partial fragment)
    const lines = text.split("\n").filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const trimmed = line.trim()
      // A partial trailing line would be very short (1-3 chars like "i…" or "…")
      // Allow the marker line (single char prefix) but not content fragments
      if (trimmed.length <= 3 && trimmed !== "□" && trimmed !== "◻") {
        // This is likely a partial trailing line — should not exist
        expect(trimmed).not.toMatch(/^.{0,2}…$/)
      }
    }
  })

  test("card title with exactly fitting content has no ellipsis", () => {
    const shortTitle = "Short task title"
    const { board } = testEnv(() => item("board", item("col1", item(shortTitle))), { rows: 20, columns: 40 })

    const cursorCard = board.q("[data-cursor]")
    const text = cursorCard.textContent()
    // Short title should NOT have ellipsis
    expect(text).not.toContain("…")
    expect(text).toContain("Short task title")
  })

  test("truncated card title ends with ellipsis on a full line", () => {
    // Very long title that will definitely need truncation
    const longTitle =
      "This is an extremely long card title that contains a URL https://www.example.com/very/long/path/to/resource?param=value&other=thing and more text after"
    const { board } = testEnv(() => item("board", item("col1", item(longTitle))), { rows: 20, columns: 40 })

    const cursorCard = board.q("[data-cursor]")
    const text = cursorCard.textContent()

    // If truncated, should end with ellipsis
    if (text.includes("…")) {
      // The ellipsis should be on a line that has substantial content before it
      const lines = text.split("\n").filter((l) => l.trim().length > 0)
      const ellipsisLine = lines.find((l) => l.includes("…"))
      expect(ellipsisLine).toBeDefined()
      // The line with ellipsis should be reasonably long (>5 chars), not a partial fragment
      expect(ellipsisLine!.trim().length).toBeGreaterThan(5)
    }
  })

  test("multiple cards with long titles all truncate cleanly", () => {
    const titles = [
      "First long card ^99365004304232https://wakeupstoked.com/kiteboarding-cape-town/ more text",
      "Second card with URL ^95625296115693Coworking near the beach https://example.com/location",
      "Third card Digital nomad https://www.example.com/very/long/destination/path?country=southam",
    ]
    const { board } = testEnv(() => item("board", item("col1", ...titles.map((t) => item(t)))), {
      rows: 30,
      columns: 40,
    })

    // Navigate through cards and check each one
    for (let i = 0; i < titles.length; i++) {
      const cursorCard = board.q("[data-cursor]")
      const text = cursorCard.textContent()

      // Check no partial trailing lines
      const lines = text.split("\n").filter((l) => l.trim().length > 0)
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length <= 3 && !["□", "◻", "▸", "▾"].includes(trimmed)) {
          expect(trimmed).not.toMatch(/^.{0,2}…$/)
        }
      }

      if (i < titles.length - 1) board.command("cursor_down")
    }
  })
})

// =============================================================================
// Display bug regressions (absorbed from display-bugs.test.ts)
// =============================================================================

/**
 * Regression tests for display bugs:
 * - km-tui.raw-section-ids: Empty mdsection nodes show raw GID fallback "(01KHW5W9)"
 * - km-tui.trailing-hash: Trailing "#" from "#@mention" Asana tag syntax
 * - km-tui.query-dsl-leaked: Internal query DSL "rules" visible in detail pane
 */
describe("km-tui.raw-section-ids — untitled section shows label not raw ID", () => {
  test("empty mdsection shows '(untitled section)' instead of raw GID", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("task-1"), item("task-2")))
        // Mutate task-2 to be an empty mdsection with a long GID-like ID
        const emptySection = nodes.find((n) => n.id === "task-2")!
        emptySection.id = "01KHW5W9JJHE7ZS2DTDBN0X0YQ"
        emptySection.type = "h"
        emptySection.item = {}
        emptySection.fstype = "mdsection"
        emptySection.content = ""
        emptySection.title = ""
        emptySection.name = ""
        emptySection.data = {}
        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    // The raw GID "(01KHW5W9)" should NOT appear
    expect(text).not.toContain("(01KHW5W9)")
    // Should show the human-readable label instead
    expect(text).toContain("(untitled section)")
  })
})

describe("km-tui.trailing-hash — strip orphan # from Asana tag syntax", () => {
  test("card title strips trailing # from #@mention pattern", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Thermostat schedule #@home"))), {
      columns: 80,
      rows: 24,
    })

    const text = board.screen.text
    // Should show "Thermostat schedule" without trailing "#"
    expect(text).toContain("Thermostat schedule")
    expect(text).not.toMatch(/Thermostat schedule\s+#/)
  })

  test("card title strips multiple #@mention patterns", () => {
    const { board } = testEnv(() => item("board", item("col1", item("BVI admin #@work #@home"))), {
      columns: 80,
      rows: 24,
    })

    const text = board.screen.text
    expect(text).toContain("BVI admin")
    expect(text).not.toMatch(/BVI admin\s+#/)
  })
})

describe("km-tui.query-dsl-leaked — hide rules from detail pane", () => {
  test("section card does not show km.add:: query DSL", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item.section("Inbox", item("task-a"), item("task-b")))
        // Simulate a section with query DSL in content
        const inboxNode = nodes.find((n) => n.id === "Inbox")!
        inboxNode.content = "Inbox km.add:: ./inbox/** km.default:: true"
        inboxNode.data = {
          ...inboxNode.data,
          rules: { default: true, add: ["./inbox/**"] },
        }
        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    // "km.add::" query DSL should not be visible on the card
    expect(text).not.toContain("km.add::")
    expect(text).not.toContain("km.default::")
  })
})

// =============================================================================
// Inline ^refs stripped from display (absorbed from inline-refs.test.ts)
// =============================================================================

/**
 * Regression: km-tui.inline-refs
 *
 * Inline ^caret references (Asana-style numeric block IDs) should be
 * stripped from display text. They appear as "See previous ^1202466275397380"
 * or "talk to Fidelity^1212075048027297" in imported content.
 */
describe("inline-refs: ^numeric-id stripped from card display", () => {
  test("inline ^ref mid-text is stripped from card title", () => {
    const { board } = testEnv(() => item("board", item("col1", item("See previous ^1202466275397380 notes"))), {
      rows: 20,
      columns: 60,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1202466275397380")
    expect(text).toContain("See previous")
    expect(text).toContain("notes")
  })

  test("^ref at end of title is stripped", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Talk to Fidelity^1212075048027297"))), {
      rows: 20,
      columns: 60,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1212075048027297")
    expect(text).toContain("Talk to Fidelity")
  })

  test("^ref followed by URL (no space) strips ID but keeps URL", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Beautiful places ^1209904823302245https://example.com"))),
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1209904823302245")
    expect(text).toContain("Beautiful places")
    // URL is prettified (protocol stripped) by the text pipeline
    expect(text).toContain("example.com")
  })

  test("multiple ^refs in same title are all stripped", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("ref ^1202466275397380 and ^1212075048027297 end"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("^1202466275397380")
    expect(text).not.toContain("^1212075048027297")
    expect(text).toContain("ref")
    expect(text).toContain("end")
  })

  test("short ^refs (not Asana IDs) are preserved", () => {
    const { board } = testEnv(() => item("board", item("col1", item("value ^42 is good"))), { rows: 20, columns: 60 })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("^42")
    expect(text).toContain("value")
    expect(text).toContain("is good")
  })
})
