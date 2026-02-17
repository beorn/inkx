/**
 * Regression test for km-axswu: Breadcrumb text corruption on h/l navigation.
 *
 * Tests that the ANSI diff output correctly updates the breadcrumb (top bar)
 * when navigating between columns. The internal buffer is correct, but the
 * ANSI escape sequences sent to the terminal may fail to update all changed
 * cells, causing old characters to "leak through."
 *
 * This test uses VirtualTerminal to simulate what a real terminal would show
 * after receiving the ANSI diff.
 */

import { describe, test, expect } from "vitest"
import { outputPhase, VirtualTerminal } from "inkx/toolbelt"
import { testEnv, item } from "./helpers/board-test.ts"

describe("breadcrumb ANSI replay on h/l navigation", () => {
  test("ANSI replay matches buffer after pressing l", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col-a", item("1a"), item("1b")),
          item("col-b", item("2a"), item("2b")),
          item("col-c", item("3a")),
        ),
      { incremental: true, columns: 80, rows: 24 },
    )

    const app = board._result

    // Get initial buffer
    const initialBuffer = app.lastBuffer()!
    expect(initialBuffer).toBeTruthy()

    // Press l to move to next column
    board.press("l")

    const afterBuffer = app.lastBuffer()!
    expect(afterBuffer).toBeTruthy()

    // Get the ANSI diff that would be sent to a real terminal
    const ansiDiff = outputPhase(initialBuffer, afterBuffer)

    // Simulate what a terminal would show
    const vterm = new VirtualTerminal(80, 24)
    vterm.loadFromBuffer(initialBuffer)
    vterm.applyAnsi(ansiDiff)

    // Compare terminal output to expected buffer
    const mismatches = vterm.compareToBuffer(afterBuffer)
    if (mismatches.length > 0) {
      // Show the breadcrumb row (row 0) for debugging
      let row0Expected = ""
      let row0Actual = ""
      for (let x = 0; x < 80; x++) {
        row0Expected += afterBuffer.getCellChar(x, 0)
        row0Actual += vterm.getChar(x, 0)
      }

      const details = mismatches
        .slice(0, 15)
        .map((m) => `  (${m.x},${m.y}): expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
        .join("\n")
      expect.unreachable(
        `ANSI replay mismatch after pressing 'l': ${mismatches.length} cells differ\n` +
          `  Row 0 expected: ${JSON.stringify(row0Expected.trimEnd())}\n` +
          `  Row 0 actual:   ${JSON.stringify(row0Actual.trimEnd())}\n` +
          details,
      )
    }
  })

  test("ANSI replay matches buffer after pressing h", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col-a", item("1a"), item("1b")),
          item("col-b", item("2a"), item("2b")),
          item("col-c", item("3a")),
        ),
      { incremental: true, columns: 80, rows: 24 },
    )

    const app = board._result

    // Move to col-b first
    board.press("l")
    const midBuffer = app.lastBuffer()!

    // Press h to go back
    board.press("h")
    const afterBuffer = app.lastBuffer()!

    const ansiDiff = outputPhase(midBuffer, afterBuffer)

    const vterm = new VirtualTerminal(80, 24)
    vterm.loadFromBuffer(midBuffer)
    vterm.applyAnsi(ansiDiff)

    const mismatches = vterm.compareToBuffer(afterBuffer)
    if (mismatches.length > 0) {
      let row0Expected = ""
      let row0Actual = ""
      for (let x = 0; x < 80; x++) {
        row0Expected += afterBuffer.getCellChar(x, 0)
        row0Actual += vterm.getChar(x, 0)
      }

      const details = mismatches
        .slice(0, 15)
        .map((m) => `  (${m.x},${m.y}): expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
        .join("\n")
      expect.unreachable(
        `ANSI replay mismatch after pressing 'h': ${mismatches.length} cells differ\n` +
          `  Row 0 expected: ${JSON.stringify(row0Expected.trimEnd())}\n` +
          `  Row 0 actual:   ${JSON.stringify(row0Actual.trimEnd())}\n` +
          details,
      )
    }
  })

  test("ANSI replay matches buffer through multiple h/l navigations", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col-one", item("1a"), item("1b"), item("1c")),
          item("col-deep", item("2a"), item("2b")),
          item("Processing", item("3a")),
          item("Waiting"),
        ),
      { incremental: true, columns: 80, rows: 24 },
    )

    const app = board._result
    const navKeys = ["l", "l", "l", "h", "h", "l", "h", "h", "h", "l", "l", "l"]

    for (const key of navKeys) {
      const prevBuffer = app.lastBuffer()!
      board.press(key)
      const nextBuffer = app.lastBuffer()!

      const ansiDiff = outputPhase(prevBuffer, nextBuffer)

      const vterm = new VirtualTerminal(80, 24)
      vterm.loadFromBuffer(prevBuffer)
      vterm.applyAnsi(ansiDiff)

      const mismatches = vterm.compareToBuffer(nextBuffer)
      if (mismatches.length > 0) {
        let row0Expected = ""
        let row0Actual = ""
        for (let x = 0; x < 80; x++) {
          row0Expected += nextBuffer.getCellChar(x, 0)
          row0Actual += vterm.getChar(x, 0)
        }

        const details = mismatches
          .slice(0, 15)
          .map((m) => `  (${m.x},${m.y}): expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
          .join("\n")
        expect.unreachable(
          `ANSI replay mismatch after pressing '${key}': ${mismatches.length} cells\n` +
            `  Row 0 expected: ${JSON.stringify(row0Expected.trimEnd())}\n` +
            `  Row 0 actual:   ${JSON.stringify(row0Actual.trimEnd())}\n` +
            details,
        )
      }
    }
  })

  test("narrow terminal ANSI replay on h/l", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col-one", item("1a"), item("1b")),
          item("col-deep", item("2a")),
          item("col-three", item("3a")),
        ),
      { incremental: true, columns: 40, rows: 20 },
    )

    const app = board._result

    for (const key of ["l", "l", "h", "h", "l"]) {
      const prevBuffer = app.lastBuffer()!
      board.press(key)
      const nextBuffer = app.lastBuffer()!

      const ansiDiff = outputPhase(prevBuffer, nextBuffer)

      const vterm = new VirtualTerminal(40, 20)
      vterm.loadFromBuffer(prevBuffer)
      vterm.applyAnsi(ansiDiff)

      const mismatches = vterm.compareToBuffer(nextBuffer)
      if (mismatches.length > 0) {
        let row0Expected = ""
        let row0Actual = ""
        for (let x = 0; x < 40; x++) {
          row0Expected += nextBuffer.getCellChar(x, 0)
          row0Actual += vterm.getChar(x, 0)
        }

        const details = mismatches
          .slice(0, 15)
          .map((m) => `  (${m.x},${m.y}): expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
          .join("\n")
        expect.unreachable(
          `ANSI replay mismatch (40-col) after '${key}': ${mismatches.length} cells\n` +
            `  Row 0 expected: ${JSON.stringify(row0Expected.trimEnd())}\n` +
            `  Row 0 actual:   ${JSON.stringify(row0Actual.trimEnd())}\n` +
            details,
        )
      }
    }
  })
})
