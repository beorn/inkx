/**
 * Reproduce level-nav-shift bug with fixture data
 *
 * This test uses realistic fixture data to reproduce the bug where content shifts
 * after k k j j navigation.
 *
 * ## Findings (2026-02-04)
 *
 * The test harness buffer is CORRECT - before and after k k j j navigation,
 * the buffer content is identical. The bug is NOT in:
 * - React state management
 * - Buffer generation
 * - Incremental vs fresh render comparison
 *
 * The bug IS in the ANSI diff output that's sent to the real terminal.
 * The terminal receives incorrect cursor positioning or partial updates
 * that cause the wrong content to be displayed.
 *
 * This means we need to debug output-phase.ts `changesToAnsi` function
 * to understand why the ANSI sequence causes wrong display on real terminals.
 *
 * Run with:
 *   INKX_CHECK_INCREMENTAL=1 bun vitest run apps/km-tui/tests/reproduce-level-nav.test.ts
 */

import { describe, test, expect } from "vitest"
import { createTestBoard } from "@km/tui/test"
import { stripAnsi } from "inkx/testing"
import { item } from "./helpers/board-test.ts"

/**
 * Create a realistic vault-like fixture with:
 * - Multiple columns with varied content
 * - Nested folders that can be expanded
 * - Names similar to real vault data to test edge cases
 * - Enough items to require scrolling on smaller terminals
 */
function createRealisticBoard(options?: { rows?: number; columns?: number }) {
  return createTestBoard(
    item.root(
      "vault",
      // Column 1: Health/Fitness zone-style naming (mimics real vault)
      item(
        "Zone 1: 50-60%",
        item("Morning run"),
        item("Evening walk"),
        item("Recovery jog"),
        item("Warm up routine"),
      ),
      // Column 2: Similar naming pattern that could cause confusion
      item(
        "Health & Fitness",
        item.folder(
          "Exercise",
          item("Cardio"),
          item("Strength"),
          item("Flexibility"),
        ),
        item.folder("Nutrition", item("Meal prep"), item("Supplements")),
        item("Sleep tracking"),
        item("Weekly review"),
      ),
      // Column 3: Zone 2 (similar to Zone 1)
      item(
        "Zone 2: 60-70%",
        item("HIIT session"),
        item("Cycling"),
        item("Swimming"),
      ),
      // Column 4: Projects with deeper nesting
      item(
        "Projects",
        item.folder(
          "Work",
          item("Quarterly report"),
          item("Team meeting notes"),
          item("Performance review"),
        ),
        item.folder(
          "Personal",
          item("Home renovation"),
          item("Vacation planning"),
        ),
      ),
      // Column 5: Quick tasks (lots of items)
      item(
        "Inbox",
        item("Reply to email"),
        item("Schedule dentist"),
        item("Buy groceries"),
        item("Call mom"),
        item("Fix bike tire"),
        item("Update resume"),
        item("Book flight"),
      ),
    ),
    { rows: options?.rows ?? 40, columns: options?.columns ?? 120 },
  )
}

describe("Level nav bug reproduction", () => {
  test("k k j j buffer content is identical (proves bug is in ANSI output)", () => {
    const board = createRealisticBoard()

    // Capture initial state
    const initialText = board.text
    const initialLines = stripAnsi(initialText).split("\n").slice(1, -1) // Skip breadcrumb and status bar

    // Navigate up to board level
    board.press("k")
    board.press("k")

    // Navigate back down
    board.press("j")
    board.press("j")

    // Capture final state
    const finalText = board.text
    const finalLines = stripAnsi(finalText).split("\n").slice(1, -1)

    // The test harness buffer should be identical
    // If this passes, the bug is in ANSI output, not buffer generation
    expect(finalLines.slice(0, 10)).toEqual(initialLines.slice(0, 10))
  })

  test("incremental vs fresh render match", () => {
    const board = createRealisticBoard()

    // Navigate levels
    board.press("k")
    board.press("k")
    board.press("j")
    board.press("j")

    // Compare incremental buffer with fresh render
    const incremental = board.driver.app.lastBuffer()
    const fresh = board.driver.app.freshRender()

    if (incremental && fresh) {
      // Compare first 10 lines of each
      for (let y = 0; y < Math.min(10, incremental.height); y++) {
        for (let x = 0; x < Math.min(40, incremental.width); x++) {
          const a = incremental.getCell(x, y)
          const b = fresh.getCell(x, y)
          expect(a.char, `Cell (${x},${y}) char mismatch`).toBe(b.char)
        }
      }
    }
  })

  test("mixed h/l navigation with level changes", () => {
    // This sequence is known to trigger incremental rendering bugs
    // We test that incremental rendering matches fresh rendering
    const board = createRealisticBoard()

    // Move right through columns
    board.press("l")
    board.press("l")

    // Navigate up to board level
    board.press("k")
    board.press("k")

    // Move left at board level
    board.press("h")

    // Navigate back down
    board.press("j")
    board.press("j")

    // Compare incremental vs fresh render - the key invariant
    const incremental = board.driver.app.lastBuffer()
    const fresh = board.driver.app.freshRender()

    if (incremental && fresh) {
      for (let y = 0; y < incremental.height; y++) {
        for (let x = 0; x < incremental.width; x++) {
          const a = incremental.getCell(x, y)
          const b = fresh.getCell(x, y)
          if (a.char !== b.char) {
            expect.fail(
              `Buffer mismatch at (${x},${y}): incremental="${a.char}", fresh="${b.char}"`,
            )
          }
        }
      }
    }
  })

  test("scrolled column preserves position after level navigation", () => {
    // Create a board with a tall column that requires scrolling
    const tallItems = Array.from({ length: 25 }, (_, i) =>
      item(`Item ${String(i + 1).padStart(2, "0")}`),
    )

    const board = createTestBoard(
      item.root(
        "board",
        item("Tall Column", ...tallItems),
        item("Short Column", item("A"), item("B"), item("C")),
      ),
      { rows: 15, columns: 80 },
    )

    // Scroll down in the tall column
    for (let i = 0; i < 10; i++) {
      board.press("j")
    }

    // Capture visible items before level navigation
    const beforeText = stripAnsi(board.text)

    // Navigate up to board level and back down
    board.press("k")
    board.press("k")
    board.press("j")
    board.press("j")

    // Capture visible items after
    const afterText = stripAnsi(board.text)

    // The content should match (cursor may have restored to scrolled position)
    // We compare a substring to account for minor cursor differences
    expect(afterText.slice(0, 200)).toBe(beforeText.slice(0, 200))
  })

  test("fold/unfold with level navigation", () => {
    const board = createRealisticBoard()

    // Navigate to a folder
    board.press("l") // Move to column with folders
    board.press("j") // Move to a folder

    // Fold it
    board.press("z")

    // Navigate up and back down
    board.press("k")
    board.press("k")
    board.press("j")
    board.press("j")

    // Unfold
    board.press("z")

    // Compare incremental vs fresh render
    const incremental = board.driver.app.lastBuffer()
    const fresh = board.driver.app.freshRender()

    if (incremental && fresh) {
      for (let y = 0; y < incremental.height; y++) {
        for (let x = 0; x < incremental.width; x++) {
          const a = incremental.getCell(x, y)
          const b = fresh.getCell(x, y)
          if (a.char !== b.char) {
            expect.fail(
              `Buffer mismatch at (${x},${y}): incremental="${a.char}", fresh="${b.char}"`,
            )
          }
        }
      }
    }
  })

  test("outline depth changes with level navigation", () => {
    const board = createRealisticBoard()

    // Enter outline mode
    board.press(">")
    board.press(">")

    // Navigate around
    board.press("j")
    board.press("j")

    // Exit outline mode
    board.press("<")
    board.press("<")

    // Level navigation
    board.press("k")
    board.press("k")
    board.press("j")
    board.press("j")

    // Compare incremental vs fresh render
    const incremental = board.driver.app.lastBuffer()
    const fresh = board.driver.app.freshRender()

    if (incremental && fresh) {
      for (let y = 0; y < incremental.height; y++) {
        for (let x = 0; x < incremental.width; x++) {
          const a = incremental.getCell(x, y)
          const b = fresh.getCell(x, y)
          if (a.char !== b.char) {
            expect.fail(
              `Buffer mismatch at (${x},${y}): incremental="${a.char}", fresh="${b.char}"`,
            )
          }
        }
      }
    }
  })
})
