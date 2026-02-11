/**
 * Card layout regression tests.
 *
 * Tests that card rendering respects border boundaries, text truncation,
 * and padding at various terminal widths.
 *
 * Regression: text was observed overflowing onto the right border character
 * when card content had long words/URLs that filled the content area.
 * Root cause: Card Box had no paddingRight, so text could fill to the border.
 */
import { describe, expect, test } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Assert that no text content touches the right border │ of any card.
 * Every bordered content line should end with at least 1 space before │.
 */
function assertCardBordersClean(screenshot: string, label: string) {
  const lines = screenshot.split("\n")
  const problems: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // Match bordered content rows: │<content>│
    const cardMatches = line.matchAll(/│([^│]+)│/g)
    for (const match of cardMatches) {
      const content = match[1]!
      // Skip horizontal border lines (all ─)
      if (/^[─━═]+$/.test(content)) continue
      // Content should end with at least 1 space before the right border
      if (content.length > 0 && content[content.length - 1] !== " ") {
        problems.push(`line ${i}: text touches right border: │${content}│`)
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
            item(
              "Vehicle registration and DMV-related tasks with long description",
            ),
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
            item(
              "This is a task with quite a long title that might wrap around or overflow the card border",
            ),
            item(
              "Another task with a URL like example.com/very/long/path/to/resource",
            ),
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
          item(
            "col1",
            item("A moderate length task title here"),
            item("Status: Not started depends on other"),
          ),
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
              item(
                "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
              ),
              item("example.com/path/to/some/resource/that/is/quite/long"),
            ),
            item("col2", item("short")),
          ),
        { columns: cols, rows: 20 },
      )
      const ss = board.screenshot()
      require("fs").writeFileSync(`/tmp/card-${cols}.txt`, ss)
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
        item(
          "board",
          item(
            "col1",
            item(
              "https://very-long-domain.example.com/path/to/resource/with/many/segments",
            ),
          ),
        ),
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
              item(
                "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
              ),
              item("example.com/path/to/some/resource/that/is/quite/long"),
            ),
            item(
              "col2",
              item("Short task in col2"),
              item("Another task in col2 with some more text"),
            ),
            item(
              "col3",
              item("Col3 task alpha"),
              item("Col3 task beta with longer content here"),
            ),
          ),
        { columns: cols, rows: 20 },
      )

      // Initial render — should be clean
      assertCardBordersClean(board.screenshot(), `${cols}-col initial`)

      // Move right to col2
      board.press("l")
      assertCardBordersClean(
        board.screenshot(),
        `${cols}-col after right to col2`,
      )

      // Move right to col3
      board.press("l")
      assertCardBordersClean(
        board.screenshot(),
        `${cols}-col after right to col3`,
      )

      // Move back left to col2
      board.press("h")
      assertCardBordersClean(
        board.screenshot(),
        `${cols}-col after left to col2`,
      )

      // Move back left to col1
      board.press("h")
      assertCardBordersClean(
        board.screenshot(),
        `${cols}-col after left back to col1`,
      )
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
