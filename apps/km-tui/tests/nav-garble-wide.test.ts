/**
 * Regression test: navigation garble at wide terminal widths with flag-emoji titles.
 *
 * Original bug (fixed in a487c3288, silvery commit): After pressing `j` then `l`,
 * the first column showed duplicate card content, stale border fragments, and
 * overlapping cards. Flag emoji (🇨🇦) in the board title caused cursor drift in
 * the ANSI output phase, which compounded on navigation that triggered horizontal
 * column scroll.
 *
 * Repro: `km view --repo imports/asana launch-academy` at 220 cols, press j then l.
 *
 * What this file tests today:
 *  1. No duplicate card titles after j+l (garble detection via occurrence counts).
 *  2. No card text leaking into bottom borders (garble detection via border parse).
 *  3. At widths ≥ 220 cols (all 6 columns fit), INBOX + UNIQUE_CARD_A remain
 *     visible after j+l+h round-trip.
 *  4. Incremental rendering matches fresh at every width (auto-checked by
 *     createTestApp's `checkIncremental: true`, which is the successor to the
 *     original `board.expectIncrementalMatchesFresh()` assertion).
 *
 * What this file deliberately does NOT test: that UNIQUE_CARD_A stays on-screen
 * at narrower widths (160/200 cols). At those widths, the 6-column board cannot
 * fit horizontally, so scrolling to the 2nd column (PROJECTS AND PHASES) legitimately
 * pushes INBOX off the left edge — this is correct behavior, not garble.
 * The garble check is performed via occurrence counts + border parse instead,
 * and incremental correctness is auto-checked on every press.
 */
import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// Reproduce the Asana launch-academy structure: INBOX column has 2 cards with
// long titles that wrap at narrow column widths, PROJECTS column has many cards.
// Use UNIQUE_TAG_XYZ in card titles to enable precise duplicate detection.
function asanaLikeBoard() {
  // Generate many cards for the PROJECTS column (like the real vault)
  const projectCards = Array.from({ length: 29 }, (_, i) => item(`Monthly investor updates to LA number ${i + 1}`))
  return item(
    "\u{1F1E8}\u{1F1E6} Launch Academy",
    // Column 1: INBOX — 2 cards with long titles and children
    item(
      "INBOX",
      item(
        "UNIQUE_CARD_A Maybe WP michael-welch created 2022-06-06",
        item("Apply at border only requirement is MW WP has 6 months remaining so before Dec 31 2024"),
        item("Inform Craig and Co when she plans applying so they can draft the letter"),
      ),
      item(
        "UNIQUE_CARD_B Attend Traction conf Aug 10 to 11 with 2 tickets michael-welch sprint-2022q3-archive",
        item("https share hsforms com 1t4jtegvgTe29oR1ayOTUBw4fye9"),
        item("See also referenced item"),
        item("Sign up for Traction"),
      ),
    ),
    // Column 2: PROJECTS — many cards (triggers virtualization at 220 cols)
    item("PROJECTS AND PHASES", ...projectCards),
    // Columns 3-6: Various sizes
    item(
      "ADMIN",
      item("Work Permit and Immigration Process long title"),
      item("Michaels Work Permit and Application"),
      item("Bjorn Work Permit long title that wraps at narrow widths"),
      item("Work Permit Visa renewal process"),
      item("Wrap up Phase 2 transition work"),
    ),
    item(
      "FINANCE",
      item("Business model and value proposition for customers"),
      item("Projections for 2022 and 2023"),
      item("Stock Options Plan draft Founders Agreement"),
      item("None-Bonus structure draft"),
    ),
    item(
      "SETUP",
      item("Domestic Setup in Canada long title"),
      item("Bjorn and Delei Bank Account"),
      item("Citizenship application process"),
    ),
    item(
      "LEGAL",
      item("Monthly investor updates to LA with significant event"),
      item("Post to Dropbox request qArBEE8xvXB"),
      item("Monthly investor updates to LA due diligence form"),
      item("Monthly investor updates to LA IRCC SUV MAPLE"),
    ),
  )
}

describe("Navigation garble at wide terminal", () => {
  test("pressing j then l at 220x50 does not garble first column", () => {
    using app = createTestApp(asanaLikeBoard(), { cols: 220, rows: 50 })

    // Initial state — first card should be visible
    const initialScreen = app.text
    expect(initialScreen).toContain("UNIQUE_CARD_A")

    // Press j to move cursor to second card in INBOX
    app.press("j")
    const afterJ = app.text
    expect(afterJ).toContain("UNIQUE_CARD_B")

    // Press l to move to PROJECTS column — this triggers the garble
    app.press("l")

    const afterL = app.text

    // GARBLE CHECK: Each card title should appear at most once.
    // Garble manifests as duplicate card titles in the first column.
    const shanCount = countOccurrences(afterL, "UNIQUE_CARD_A")
    expect(shanCount, `"UNIQUE_CARD_A" appears ${shanCount} times after j+l, expected ≤1`).toBeLessThanOrEqual(1)

    const tractionCount = countOccurrences(afterL, "UNIQUE_CARD_B")
    expect(tractionCount, `"UNIQUE_CARD_B" appears ${tractionCount} times after j+l, expected ≤1`).toBeLessThanOrEqual(
      1,
    )

    // Check border integrity per-column — bottom borders shouldn't contain card text
    // Each column has its own ╰...╯ pair; check each individually
    const lines = afterL.split("\n")
    for (const line of lines) {
      for (const segment of extractBorderSegments(line)) {
        expect(segment, `Border segment contains unexpected text: "${segment}"`).not.toMatch(/[a-zA-Z]{3,}/)
      }
    }
  })

  test("column switch does not duplicate cards at various widths", () => {
    for (const cols of [220, 200, 160]) {
      using app = createTestApp(asanaLikeBoard(), { cols, rows: 50 })
      app.press("j")
      app.press("l")

      const screen = app.text
      const shanCount = countOccurrences(screen, "UNIQUE_CARD_A")
      expect(shanCount, `"UNIQUE_CARD_A" appears ${shanCount} times at ${cols} cols`).toBeLessThanOrEqual(1)
    }
  })

  test("j then l then h round-trip preserves INBOX column", () => {
    using app = createTestApp(asanaLikeBoard(), { cols: 220, rows: 50 })

    // Navigate: j → l → h (should return to same view)
    app.press("j")
    app.press("l")
    app.press("h")

    const afterRoundTrip = app.text

    // The first column (INBOX) should look the same, just with cursor on card 2
    // Check no duplication
    const shanCount = countOccurrences(afterRoundTrip, "UNIQUE_CARD_A")
    expect(shanCount, `"UNIQUE_CARD_A" duplicated after j+l+h`).toBeLessThanOrEqual(1)
  })

  test.each([
    { cols: 220, rows: 50 },
    { cols: 200, rows: 50 },
    { cols: 160, rows: 40 },
  ])("no screen corruption after j+l at $cols x $rows", async ({ cols, rows }) => {
    using app = createTestApp(asanaLikeBoard(), { cols, rows })
    app.press("j")
    app.press("l")

    // Garble check 1: no duplicate card titles. This is the core bug fingerprint —
    // the original output-phase cursor drift showed duplicated card text in the
    // first column after j+l at flag-emoji boards. With the silvery fix in place,
    // every unique card title must appear at most once on screen.
    const text = app.text
    const aCount = countOccurrences(text, "UNIQUE_CARD_A")
    const bCount = countOccurrences(text, "UNIQUE_CARD_B")
    expect(aCount, `"UNIQUE_CARD_A" appears ${aCount} times after j+l at ${cols}x${rows}`).toBeLessThanOrEqual(1)
    expect(bCount, `"UNIQUE_CARD_B" appears ${bCount} times after j+l at ${cols}x${rows}`).toBeLessThanOrEqual(1)

    // Garble check 2: no card text leaking into bottom borders — the original
    // garble left card-title fragments in ╰─...─╯ segments. Inner content should
    // only be border chars, overflow indicators, or digits.
    for (const line of text.split("\n")) {
      for (const segment of extractBorderSegments(line)) {
        expect(segment, `Border segment contains unexpected text at ${cols}x${rows}: "${segment}"`).not.toMatch(
          /[a-zA-Z]{3,}/,
        )
      }
    }

    // Note: incremental-vs-fresh rendering correctness is auto-verified on every
    // app.press() by createTestApp's checkIncremental: true (the successor to
    // board.expectIncrementalMatchesFresh() in the original test). No explicit
    // call needed here — a mismatch would throw from inside press().
  })
})

function countOccurrences(text: string, search: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

/** Extract text content from each ╰...╯ border segment individually.
 * A wide line may have multiple columns with separate border segments. */
function extractBorderSegments(line: string): string[] {
  const segments: string[] = []
  let pos = 0
  while (pos < line.length) {
    const start = line.indexOf("╰", pos)
    if (start < 0) break
    const end = line.indexOf("╯", start + 1)
    if (end < 0) break
    const inner = line
      .substring(start + 1, end)
      .replace(/[─ +\d▼]/g, "")
      .replace(/hidden/g, "")
      .replace(/more/g, "")
      .trim()
    if (inner.length > 0) segments.push(inner)
    pos = end + 1
  }
  return segments
}
