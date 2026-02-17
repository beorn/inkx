/**
 * Test: Fold operations and border rendering integrity
 *
 * Bug km-tui.fold-border-blank: When pressing '<' to decrease outline depth
 * or 'z' to fold all, cards shrink but bottom borders may be left blank
 * or overwritten with stale pixels from the previous (taller) render.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { VirtualTerminal, outputPhase } from "inkx/toolbelt"

describe("fold border blank (km-tui.fold-border-blank)", () => {
  /** Board with nested children that will shrink when outline depth decreases */
  function nestedBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("card-a", item("a-child1"), item("a-child2"), item("a-child3")),
            item("card-b", item("b-child1")),
            item("card-c"),
          ),
        ),
      { columns: 50, rows: 30, incremental: true },
    )
  }

  /** Verify border structure: top/bottom count match AND dashes are continuous */
  function checkBorderIntegrity(text: string, label: string) {
    const rows = text.split("\n")
    // Count top and bottom borders (round style: ╭╮ for top, ╰╯ for bottom)
    const topBorders = rows.filter((r) => r.includes("\u256d") && r.includes("\u256e"))
    const bottomBorders = rows.filter((r) => r.includes("\u2570") && r.includes("\u256f"))
    expect(bottomBorders.length, `${label}: bottom borders should match top borders`).toBe(topBorders.length)

    // Check that each bottom border has continuous horizontal dashes (not spaces).
    // Overflow cards have a custom bottom border with a "+N" label, e.g.:
    //   ╰───────── +1 ──────────╯
    // The "+N" label is allowed; stale blank spaces are not.
    for (const row of bottomBorders) {
      const leftIdx = row.indexOf("\u2570")
      const rightIdx = row.lastIndexOf("\u256f")
      if (leftIdx >= 0 && rightIdx > leftIdx + 1) {
        const between = row.slice(leftIdx + 1, rightIdx)
        // Allow overflow label pattern: dashes + " +N " + dashes
        const isOverflowBorder = /^\u2500*\s\+\d+\s\u2500*$/.test(between)
        if (!isOverflowBorder) {
          for (let i = 0; i < between.length; i++) {
            expect(
              between[i],
              `${label}: bottom border at col ${leftIdx + 1 + i} should be \u2500 but got "${between[i]}"`,
            ).toBe("\u2500")
          }
        }
      }
    }
  }

  test("decrease outline depth preserves border integrity", () => {
    const { board } = nestedBoard()

    // Initial: children visible
    const before = board.screenshot()
    expect(before).toContain("a-child1")
    checkBorderIntegrity(before, "before fold")

    // Decrease to depth 1 (children at depth 1 still visible: 0 < 1)
    board.press("<")
    const mid = board.screenshot()
    checkBorderIntegrity(mid, "after first <")

    // Decrease to depth 0 (no children visible: 0 < 0 = false)
    board.press("<")
    const after = board.screenshot()
    expect(after).not.toContain("a-child1")
    checkBorderIntegrity(after, "after second <")
  })

  test("increase outline depth after decrease preserves borders", () => {
    const { board } = nestedBoard()

    // Decrease then increase
    board.press("<").press("<") // depth 2 → 0
    board.press(">").press(">") // depth 0 → 2

    const text = board.screenshot()
    expect(text).toContain("a-child1")
    checkBorderIntegrity(text, "after round-trip")
  })

  test("fold all (z) preserves border integrity", () => {
    const { board } = nestedBoard()

    // z = fold_all: folds all cards in column
    board.press("z")

    // Wait for chord timeout to resolve
    // The 'z' key is a chord prefix; standalone timeout resolves to fold_all
    const text = board.screenshot()
    checkBorderIntegrity(text, "after fold all")
  })

  test("toggle fold (za) preserves border integrity", () => {
    const { board } = nestedBoard()

    // za = toggle fold on current card (card-a)
    board.press("z")
    // z is chord prefix, wait for it then press a
    board.press("a")

    const text = board.screenshot()
    checkBorderIntegrity(text, "after toggle fold")
  })

  test("no stale border lines below shrunken cards", () => {
    const { board } = nestedBoard()

    const before = board.screenshot()
    // card-a should be multiline (has children)
    const beforeRows = before.split("\n")
    const cardATopRow = beforeRows.findIndex((r) => r.includes("card-a"))

    // Decrease depth to hide children
    board.press("<").press("<")
    const after = board.screenshot()
    const afterRows = after.split("\n")

    // Find card-a in after state — it should be shorter
    const cardATopRowAfter = afterRows.findIndex((r) => r.includes("card-a"))
    expect(cardATopRowAfter).toBeGreaterThanOrEqual(0)

    // After the card's bottom border, the next content should be another card or empty space
    // There should be no orphaned border characters (─ without ╰/╯)
    const cardABottom = afterRows.findIndex(
      (r, i) => i > cardATopRowAfter && r.includes("\u2570") && r.includes("\u256f"),
    )
    expect(cardABottom).toBeGreaterThan(cardATopRowAfter)

    // Check that rows between card-a bottom and card-b top have no stale border chars
    const cardBTop = afterRows.findIndex((r, i) => i > cardABottom && r.includes("\u256d") && r.includes("\u256e"))
    if (cardBTop > cardABottom + 1) {
      // Rows between cards should not have border characters
      for (let i = cardABottom + 1; i < cardBTop; i++) {
        const row = afterRows[i] ?? ""
        expect(row, `Row ${i} between cards should not have stale borders`).not.toMatch(
          /[\u2500\u2502\u256d\u256e\u256f\u2570]/,
        )
      }
    }
  })

  /** Convert VirtualTerminal grid to text string (row per line) */
  function vtermToText(vterm: VirtualTerminal): string {
    const lines: string[] = []
    for (let y = 0; y < vterm.height; y++) {
      let line = ""
      for (let x = 0; x < vterm.width; x++) {
        line += vterm.getChar(x, y)
      }
      lines.push(line)
    }
    return lines.join("\n")
  }

  /** Verify ANSI diff replay produces correct terminal output */
  function verifyDiffReplay(
    prevBuffer: ReturnType<ReturnType<typeof import("inkx/testing").createRenderer>["lastBuffer"]>,
    nextBuffer: ReturnType<ReturnType<typeof import("inkx/testing").createRenderer>["lastBuffer"]>,
    label: string,
  ) {
    if (!prevBuffer || !nextBuffer) throw new Error(`${label}: No buffer`)

    // Render initial state to a virtual terminal
    const vterm = new VirtualTerminal(prevBuffer.width, prevBuffer.height)
    const fullAnsi = outputPhase(null, prevBuffer)
    vterm.applyAnsi(fullAnsi)

    // Apply the incremental diff
    const diffAnsi = outputPhase(prevBuffer, nextBuffer)
    vterm.applyAnsi(diffAnsi)

    // Compare virtual terminal content with expected buffer
    const mismatches = vterm.compareToBuffer(nextBuffer)
    if (mismatches.length > 0) {
      const details = mismatches
        .slice(0, 20)
        .map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
        .join("\n")
      throw new Error(`${label}: ANSI diff replay mismatch: ${mismatches.length} cells differ:\n${details}`)
    }
  }

  test("ANSI diff replay correct after decrease outline depth", () => {
    const { board } = nestedBoard()

    // Capture buffer before first <
    const prevBuf1 = board._result.lastBuffer()!.clone()
    board.press("<")
    const afterBuf1 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf1, afterBuf1, "after first <")

    // Capture buffer before second <
    const prevBuf2 = afterBuf1.clone()
    board.press("<")
    const afterBuf2 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf2, afterBuf2, "after second <")
  })

  test("ANSI diff replay terminal borders correct after fold", () => {
    const { board } = nestedBoard()

    // Simulate what a real terminal sees: full render, then each diff in sequence
    const buf0 = board._result.lastBuffer()!.clone()
    const vterm = new VirtualTerminal(buf0.width, buf0.height)
    vterm.applyAnsi(outputPhase(null, buf0))

    // First < press
    board.press("<")
    const buf1 = board._result.lastBuffer()!
    const diff1 = outputPhase(buf0, buf1)
    vterm.applyAnsi(diff1)

    // Verify first diff is correct
    const mismatches1 = vterm.compareToBuffer(buf1)
    expect(mismatches1.length, "vterm should match buf1 after first diff").toBe(0)

    // Check after first diff
    let terminalText = vtermToText(vterm)
    checkBorderIntegrity(terminalText, "terminal after first <")

    // Second < press
    const buf1Clone = buf1.clone()
    board.press("<")
    const buf2 = board._result.lastBuffer()!
    const diff2 = outputPhase(buf1Clone, buf2)
    vterm.applyAnsi(diff2)

    // Verify second diff cell-by-cell
    const mismatches2 = vterm.compareToBuffer(buf2)
    if (mismatches2.length > 0) {
      const details = mismatches2
        .slice(0, 30)
        .map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
        .join("\n")
      throw new Error(`vterm should match buf2 after second diff: ${mismatches2.length} cells differ:\n${details}`)
    }

    // Check after second diff
    terminalText = vtermToText(vterm)
    checkBorderIntegrity(terminalText, "terminal after second <")

    // Check bottom border dash integrity (the specific bug symptom)
    const rows = terminalText.split("\n")
    for (const row of rows) {
      const leftIdx = row.indexOf("\u2570")
      const rightIdx = row.lastIndexOf("\u256f")
      if (leftIdx >= 0 && rightIdx > leftIdx + 1) {
        const between = row.slice(leftIdx + 1, rightIdx)
        for (let i = 0; i < between.length; i++) {
          expect(between[i], `bottom border at col ${leftIdx + 1 + i} should be \u2500 but got "${between[i]}"`).toBe(
            "\u2500",
          )
        }
      }
    }
  })

  test("incremental vs fresh buffer comparison after fold", () => {
    // Run with incremental=true
    const { board: incBoard } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("card-a", item("a-child1"), item("a-child2"), item("a-child3")),
            item("card-b", item("b-child1")),
            item("card-c"),
          ),
        ),
      { columns: 50, rows: 30, incremental: true },
    )
    incBoard.press("<").press("<")
    const incText = incBoard.screenshot()

    // Run with incremental=false
    const { board: freshBoard } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("card-a", item("a-child1"), item("a-child2"), item("a-child3")),
            item("card-b", item("b-child1")),
            item("card-c"),
          ),
        ),
      { columns: 50, rows: 30, incremental: false },
    )
    freshBoard.press("<").press("<")
    const freshText = freshBoard.screenshot()

    // Compare line by line — collect all differences
    const incRows = incText.split("\n")
    const freshRows = freshText.split("\n")
    const diffs: string[] = []
    for (let i = 0; i < Math.max(incRows.length, freshRows.length); i++) {
      if (incRows[i] !== freshRows[i]) {
        diffs.push(`Row ${i}:\n  inc:   "${incRows[i]}"\n  fresh: "${freshRows[i]}"`)
      }
    }
    if (diffs.length > 0) {
      expect.fail(`${diffs.length} rows differ:\n${diffs.join("\n")}`)
    }
  })

  test("ANSI diff replay correct after decrease content lines", () => {
    const { board } = nestedBoard()

    // Decrease content lines (- key) instead of outline depth
    const prevBuf1 = board._result.lastBuffer()!.clone()
    board.press("-")
    const afterBuf1 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf1, afterBuf1, "after first -")
    checkBorderIntegrity(board.screenshot(), "buffer after first -")

    const prevBuf2 = afterBuf1.clone()
    board.press("-")
    const afterBuf2 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf2, afterBuf2, "after second -")
    checkBorderIntegrity(board.screenshot(), "buffer after second -")
  })
})
