/**
 * Tests for date, priority, and recurrence features.
 *
 * Verifies:
 * - td chord opens date prompt dialog
 * - sp cycles priority
 * - tr opens recurrence prompt
 * - Date prompt dialog text input (no key leak from chord)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("date prompt (td)", () => {
  test("td chord opens due date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))))

    // Navigate to card level
    board.press("j")

    // Press t (chord prefix) then d (due date)
    board.press("t")
    board.press("d")

    // Dialog should be open — check for "Set Due Date" text
    const text = board.screenshot()
    expect(text).toContain("Set Due Date")
  })

  test("td chord does not leak 'd' into text input", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // The dialog input should be empty (no leaked 'd')
    const text = board.screenshot()
    // The prompt shows "> " followed by a cursor — no 'd' character
    expect(text).not.toMatch(/> d[^a-z]/)
    // Should show empty state hint
    expect(text).toContain("Empty = clear value")
  })

  test("ts chord opens start date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("s")

    const text = board.screenshot()
    expect(text).toContain("Set Start Date")
  })

  test("tr chord opens recurrence dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("r")

    const text = board.screenshot()
    expect(text).toContain("Set Recurrence")
  })

  test("Escape cancels date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // Verify dialog open
    expect(board.screenshot()).toContain("Set Due Date")

    // Cancel
    board.press("Escape")

    // Dialog should be closed
    expect(board.screenshot()).not.toContain("Set Due Date")
  })
})

describe("priority (sp)", () => {
  test("sp sets P1 on card", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")

    // Initially no priority in full screenshot
    expect(board.screenshot()).not.toMatch(/P[1-4]/)

    // sp → P1
    board.press("s")
    board.press("p")

    // Should show P1 somewhere (toast or card)
    const text = board.screenshot()
    expect(text).toContain("P1")
  })

  test("sp cycles through priorities", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")

    // Cycle: none → P1 → P2 → P3 → P4 → none
    // Each sp should show the next priority in a toast
    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P1")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P2")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P3")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P4")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: None")
  })
})
