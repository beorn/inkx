/**
 * Regression: km-tui.truncate-lines
 *
 * Card truncation should produce full lines ending with ellipsis,
 * never partial trailing lines like "i…" on their own line.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

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

      if (i < titles.length - 1) board.press("j")
    }
  })
})
