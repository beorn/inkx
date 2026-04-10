/**
 * Fold operation tests.
 *
 * Tests fold/unfold behavior, border integrity through fold operations,
 * ANSI diff replay correctness, and fold count color consistency.
 *
 * Covers:
 * - H/L (fold_node/unfold_node), < / > (fold_all/unfold_all), gc (toggle_collapse)
 * - Border integrity after fold/unfold operations
 * - ANSI diff replay correctness after fold operations
 * - Incremental vs fresh buffer comparison after fold
 * - Fold count color (gray, not dim, not bold) across fold states
 * - Column header count color with ownColor
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp, type TestApp } from "./helpers/test-app.ts"
import { VirtualTerminal, outputPhase } from "@silvery/ag-term/toolbelt"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

// =============================================================================
// Fold all / unfold all commands
// =============================================================================

describe("fold-all-corruption", () => {
  test("zM (fold all chord) folds all cards in column", () => {
    using app = createTestApp(item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))))

    expect(app.text).toContain("child-1")

    // zM chord → fold_all (progressive: each press decreases depth by 1, starts at 3)
    app.command("fold_all_more") // 3→2
    app.command("fold_all_more") // 2→1
    app.command("fold_all_more") // 1→0

    expect(app.text).not.toContain("child-1")
    expect(app.text).not.toContain("child-2")
    // Parent title should still be readable
    expect(app.text).toContain("Parent")
  })

  test("H folds a card, > should unfold it", async () => {
    using app = createTestApp(item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))))

    // Fold via H
    app.command("fold_more")

    // Children should be hidden
    expect(app.text).not.toContain("child-1")

    // Z (unfold all) should restore children
    app.command("unfold_all_more")

    expect(app.text).toContain("child-1")
    expect(app.text).toContain("child-2")
  })

  test("H (fold_node) folds current card and hides children", () => {
    using app = createTestApp(item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))))

    expect(app.text).toContain("child-1")

    // H → fold_node
    app.command("fold_more")

    const folded = app.text
    expect(folded).not.toContain("child-1")
    expect(folded).not.toContain("child-2")
    expect(folded).toContain("Parent")
  })

  test("L (unfold node) restores children after fold", () => {
    using app = createTestApp(item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))))

    // Fold with H
    app.command("fold_more")
    expect(app.text).not.toContain("child-1")

    // Unfold with L
    app.command("unfold_more")

    const unfolded = app.text
    expect(unfolded).toContain("child-1")
    expect(unfolded).toContain("child-2")
  })

  test("Z unfolds all after individually folding multiple cards", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.folder("Processing", item("sub-a"), item("sub-b")), item.folder("Review", item("sub-c"))),
      ),
    )

    // Fold both cards individually with H
    app.command("fold_more") // fold Processing
    app.command("cursor_down") // move to Review
    app.command("fold_more") // fold Review

    expect(app.text).not.toContain("sub-a")
    expect(app.text).not.toContain("sub-c")

    // Z should unfold all
    app.command("unfold_all_more")

    const after = app.text
    expect(after).toContain("sub-a")
    expect(after).toContain("sub-b")
    expect(after).toContain("sub-c")
  })
})

// =============================================================================
// Fold border blank (km-tui.fold-border-blank)
// =============================================================================

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
        // Allow overflow label pattern: dashes + " +N " or " +N more " + dashes
        const isOverflowBorder = /^\u2500*\s\+\d+(?:\smore)?\s\u2500*$/.test(between)
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

    // Progressive fold: each press decreases depth by 1 (starts at 3)
    board.command("fold_all_more") // 3→2
    const mid1 = board.screenshot()
    checkBorderIntegrity(mid1, "after first <")

    board.command("fold_all_more") // 2→1
    const mid2 = board.screenshot()
    checkBorderIntegrity(mid2, "after second <")

    // Decrease to depth 0 (no children visible)
    board.command("fold_all_more") // 1→0
    const after = board.screenshot()
    expect(after).not.toContain("a-child1")
    checkBorderIntegrity(after, "after third <")
  })

  test("increase outline depth after decrease preserves borders", () => {
    const { board } = nestedBoard()

    // Decrease then increase
    board.command("fold_all_more").command("fold_all_more").command("fold_all_more") // progressive: 3→2→1→0
    board.command("unfold_all_more").command("unfold_all_more").command("unfold_all_more") // progressive: 0→1→2→3 (fully unfolded)

    const text = board.screenshot()
    expect(text).toContain("a-child1")
    checkBorderIntegrity(text, "after round-trip")
  })

  test("fold all (<) preserves border integrity", () => {
    const { board } = nestedBoard()

    // < = fold_all: folds all cards in column
    board.command("fold_all_more")

    const text = board.screenshot()
    checkBorderIntegrity(text, "after fold all")
  })

  test("toggle fold (gc) preserves border integrity", () => {
    const { board } = nestedBoard()

    // gc = toggle_collapse on current card (card-a)
    board.command("toggle_collapse")

    const text = board.screenshot()
    // Collapsed column renders vertically with top border (╭─╮) but bottom (╰─╯)
    // may be off-screen. Status toast also has borders. Allow ≤1 mismatch for
    // viewport clipping of the collapsed column.
    const rows = text.split("\n")
    const topBorders = rows.filter((r) => r.includes("\u256d") && r.includes("\u256e"))
    const bottomBorders = rows.filter((r) => r.includes("\u2570") && r.includes("\u256f"))
    expect(
      Math.abs(topBorders.length - bottomBorders.length),
      `after toggle fold: top=${topBorders.length} bottom=${bottomBorders.length}`,
    ).toBeLessThanOrEqual(1)
  })

  test("no stale border lines below shrunken cards", () => {
    const { board } = nestedBoard()

    const before = board.screenshot()
    // card-a should be multiline (has children)
    const beforeRows = before.split("\n")
    const cardATopRow = beforeRows.findIndex((r) => r.includes("card-a"))

    // Decrease depth to hide children
    board.command("fold_all_more").command("fold_all_more")
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prevBuffer: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextBuffer: any,
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
    board.command("fold_all_more")
    const afterBuf1 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf1, afterBuf1, "after first <")

    // Capture buffer before second <
    const prevBuf2 = afterBuf1.clone()
    board.command("fold_all_more")
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
    board.command("fold_all_more")
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
    board.command("fold_all_more")
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
    incBoard.command("fold_all_more").command("fold_all_more").command("fold_all_more")
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
    freshBoard.command("fold_all_more").command("fold_all_more").command("fold_all_more")
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
    board.command("decrease_content_lines")
    const afterBuf1 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf1, afterBuf1, "after first -")
    checkBorderIntegrity(board.screenshot(), "buffer after first -")

    const prevBuf2 = afterBuf1.clone()
    board.command("decrease_content_lines")
    const afterBuf2 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf2, afterBuf2, "after second -")
    checkBorderIntegrity(board.screenshot(), "buffer after second -")
  })
})

// =============================================================================
// Fold border blank — buffer-level border assertions (km-tui.fold-border-blank)
// =============================================================================

describe("fold border blank — buffer-level assertions", () => {
  /**
   * Board with 4 cards in a single column — some with children, some without.
   * Tests that folding (via < or H) preserves bottom borders of folded cards
   * AND top borders of cards directly below them.
   */
  function multiCardBoard(opts?: { columns?: number; rows?: number }): TestApp {
    return createTestApp(
      item(
        "board",
        item(
          "col1",
          item("Parent-A", item("a-child1"), item("a-child2"), item("a-child3")),
          item("Parent-B", item("b-child1"), item("b-child2")),
          item("Leaf-C"),
          item("Parent-D", item("d-child1")),
        ),
      ),
      { cols: opts?.columns ?? 60, rows: opts?.rows ?? 30, incremental: true },
    )
  }

  /**
   * Find the Card border box for a node by scanning for its text in the rendered
   * output, then searching upward/downward for top/bottom border characters.
   *
   * Returns the row indices of the card's top border (╭) and bottom border (╰).
   */
  function findCardBorderRows(app: TestApp, nodeText: string): { topRow: number; bottomRow: number } {
    const rows = app.text.split("\n")
    // Find the text row INSIDE a card (must have │ on the left margin, skipping breadcrumb)
    let textRow = -1
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (row.includes(nodeText) && row.trimStart().startsWith("\u2502")) {
        textRow = i
        break
      }
    }
    expect(textRow, `"${nodeText}" should be inside a card (bordered row)`).toBeGreaterThanOrEqual(0)

    // Search upward for top border (╭)
    let topRow = -1
    for (let y = textRow; y >= 0; y--) {
      if (rows[y]!.includes("\u256d")) {
        topRow = y
        break
      }
    }

    // Search downward for bottom border (╰)
    let bottomRow = -1
    for (let y = textRow; y < rows.length; y++) {
      if (rows[y]!.includes("\u2570")) {
        bottomRow = y
        break
      }
    }

    expect(topRow, `top border for "${nodeText}"`).toBeGreaterThanOrEqual(0)
    expect(bottomRow, `bottom border for "${nodeText}"`).toBeGreaterThan(topRow)
    return { topRow, bottomRow }
  }

  /**
   * Assert that a card's bottom border row has continuous dashes between ╰ and ╯.
   * This is the core assertion for the fold-border-blank bug: when folding shrinks
   * a card, the bottom border should not be left blank or overwritten.
   */
  function expectBottomBorderIntact(app: TestApp, nodeText: string) {
    const { bottomRow } = findCardBorderRows(app, nodeText)
    const rows = app.text.split("\n")
    const row = rows[bottomRow]!
    const leftIdx = row.indexOf("\u2570")
    const rightIdx = row.lastIndexOf("\u256f")
    expect(leftIdx, `╰ in bottom border row for "${nodeText}"`).toBeGreaterThanOrEqual(0)
    expect(rightIdx, `╯ in bottom border row for "${nodeText}"`).toBeGreaterThan(leftIdx)
    const between = row.slice(leftIdx + 1, rightIdx)
    // Allow overflow label pattern: dashes + " +N " + dashes
    const isOverflow = /^\u2500*\s\+\d+\s\u2500*$/.test(between)
    if (!isOverflow) {
      for (let i = 0; i < between.length; i++) {
        expect(
          between[i],
          `"${nodeText}" bottom border at col ${leftIdx + 1 + i} should be ─ but got "${between[i]}"`,
        ).toBe("\u2500")
      }
    }
  }

  /**
   * Assert that a card's top border row has continuous dashes between ╭ and ╮.
   */
  function expectTopBorderIntact(app: TestApp, nodeText: string) {
    const { topRow } = findCardBorderRows(app, nodeText)
    const rows = app.text.split("\n")
    const row = rows[topRow]!
    const leftIdx = row.indexOf("\u256d")
    const rightIdx = row.lastIndexOf("\u256e")
    expect(leftIdx, `╭ in top border row for "${nodeText}"`).toBeGreaterThanOrEqual(0)
    expect(rightIdx, `╮ in top border row for "${nodeText}"`).toBeGreaterThan(leftIdx)
    const between = row.slice(leftIdx + 1, rightIdx)
    for (let i = 0; i < between.length; i++) {
      expect(between[i], `"${nodeText}" top border at col ${leftIdx + 1 + i} should be ─ but got "${between[i]}"`).toBe(
        "\u2500",
      )
    }
  }

  /**
   * Assert no stale content between two cards (no orphaned border chars or content
   * between one card's bottom border and the next card's top border).
   */
  function expectNoStaleBetweenCards(app: TestApp, upperNode: string, lowerNode: string) {
    const { bottomRow: upperBottom } = findCardBorderRows(app, upperNode)
    const { topRow: lowerTop } = findCardBorderRows(app, lowerNode)
    const rows = app.text.split("\n")
    // Between upper card bottom and lower card top, there should be no stale border chars
    for (let i = upperBottom + 1; i < lowerTop; i++) {
      const row = rows[i] ?? ""
      expect(row, `Row ${i} between "${upperNode}" and "${lowerNode}" should not have stale borders`).not.toMatch(
        /[\u2500\u2502\u256d\u256e\u256f\u2570]/,
      )
    }
  }

  test("decrease outline depth (<) preserves bottom border of folded cards", () => {
    using app = multiCardBoard()

    // Decrease outline depth twice: hides all children
    app.command("fold_all_more")
    app.command("fold_all_more")

    // After folding: all cards should have intact bottom borders
    expectBottomBorderIntact(app, "Parent-A")
    expectBottomBorderIntact(app, "Parent-B")
    expectTopBorderIntact(app, "Leaf-C")
    expectBottomBorderIntact(app, "Leaf-C")
  })

  test("decrease outline depth preserves borders between adjacent cards", () => {
    using app = multiCardBoard()

    // Fold once
    app.command("fold_all_more")
    expectBottomBorderIntact(app, "Parent-A")
    expectTopBorderIntact(app, "Parent-B")

    // Fold again
    app.command("fold_all_more")
    expectBottomBorderIntact(app, "Parent-A")
    expectTopBorderIntact(app, "Parent-B")
    expectBottomBorderIntact(app, "Leaf-C")
    expectNoStaleBetweenCards(app, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(app, "Parent-B", "Leaf-C")
  })

  test("individual fold (H) preserves border of card below", () => {
    using app = multiCardBoard()

    // Fold Parent-A via H
    app.command("fold_more")

    // Parent-A bottom border should be intact
    expectBottomBorderIntact(app, "Parent-A")
    // Parent-B top border should be intact (card below the folded one)
    expectTopBorderIntact(app, "Parent-B")
    // No stale content between Parent-A and Parent-B
    expectNoStaleBetweenCards(app, "Parent-A", "Parent-B")
  })

  test("toggle fold (H) preserves borders of folded card and neighbors", () => {
    using app = multiCardBoard()

    // Navigate to Parent-B then fold it
    app.command("cursor_down")
    app.command("fold_more")

    // Parent-B bottom border should be intact
    expectBottomBorderIntact(app, "Parent-B")
    // Leaf-C borders should be intact (card below the folded one)
    expectTopBorderIntact(app, "Leaf-C")
    expectBottomBorderIntact(app, "Leaf-C")
    // Parent-A borders should remain intact (card above)
    expectBottomBorderIntact(app, "Parent-A")
    // No stale content between cards
    expectNoStaleBetweenCards(app, "Parent-B", "Leaf-C")
  })

  test("fold then unfold round-trip preserves all borders", () => {
    using app = multiCardBoard()

    // Fold Parent-A, then unfold it — individual card fold round-trip
    app.command("fold_more") // fold Parent-A
    app.command("unfold_more") // unfold Parent-A

    // All cards should have intact borders after round-trip
    expectBottomBorderIntact(app, "Parent-A")
    expectBottomBorderIntact(app, "Parent-B")
    expectBottomBorderIntact(app, "Leaf-C")
    expectBottomBorderIntact(app, "Parent-D")
    expectTopBorderIntact(app, "Parent-A")
    expectTopBorderIntact(app, "Parent-B")
    expectTopBorderIntact(app, "Leaf-C")
    expectTopBorderIntact(app, "Parent-D")
  })

  test("fold with many cards and realistic viewport (5+ cards, constrained height)", async () => {
    // Smaller viewport forces scrolling and more border stress
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item("Task-1", item("1a"), item("1b")),
          item("Task-2", item("2a")),
          item("Task-3", item("3a"), item("3b"), item("3c")),
          item("Task-4"),
          item("Task-5", item("5a")),
          item("Task-6"),
        ),
      ),
      { cols: 50, rows: 20, incremental: true },
    )

    // Fold twice to hide nested children
    app.command("fold_all_more")
    app.command("fold_all_more")

    const text = app.text
    // Every bottom border line should have continuous dashes (no blanks)
    const rows = text.split("\n")
    for (const row of rows) {
      const leftIdx = row.indexOf("\u2570")
      const rightIdx = row.lastIndexOf("\u256f")
      if (leftIdx >= 0 && rightIdx > leftIdx + 1) {
        const between = row.slice(leftIdx + 1, rightIdx)
        // Allow overflow label (+N)
        const isOverflow = /^\u2500*\s\+\d+\s\u2500*$/.test(between)
        if (!isOverflow) {
          for (let i = 0; i < between.length; i++) {
            expect(
              between[i],
              `bottom border dash at col ${leftIdx + 1 + i} should be \u2500 but got "${between[i]}"`,
            ).toBe("\u2500")
          }
        }
      }
    }
  })

  test("multi-step fold sequence: navigate, fold, navigate, fold preserves borders", async () => {
    using app = multiCardBoard()

    // Step 1: fold Parent-A
    app.command("fold_more")
    expectBottomBorderIntact(app, "Parent-A")

    // Step 2: move down to Parent-B, fold it
    app.command("cursor_down")
    app.command("fold_more")
    expectBottomBorderIntact(app, "Parent-B")

    // Step 3: move down to Leaf-C — its borders should be intact
    app.command("cursor_down")
    expectTopBorderIntact(app, "Leaf-C")
    expectBottomBorderIntact(app, "Leaf-C")

    // Step 4: move down to Parent-D, fold it
    app.command("cursor_down")
    app.command("fold_more")
    expectBottomBorderIntact(app, "Parent-D")

    // Step 5: unfold each card individually via zl, verify borders restored
    // Cursor is on Parent-D after step 4
    app.command("unfold_more") // unfold Parent-D
    expectBottomBorderIntact(app, "Parent-D")
    app.command("cursor_up") // move up to Leaf-C
    app.command("cursor_up") // move up to Parent-B
    app.command("unfold_more") // unfold Parent-B
    expectBottomBorderIntact(app, "Parent-B")
    app.command("cursor_up") // move up to Parent-A
    app.command("unfold_more") // unfold Parent-A
    expectBottomBorderIntact(app, "Parent-A")
    // No stale between cards
    expectNoStaleBetweenCards(app, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(app, "Parent-B", "Leaf-C")
    expectNoStaleBetweenCards(app, "Leaf-C", "Parent-D")
  })

  test("cell-level border check: bottom border cells are not blank after fold", () => {
    using app = multiCardBoard()

    // Fold via < <
    app.command("fold_all_more")
    app.command("fold_all_more")

    // Find each card's bottom border row and check cell-by-cell
    for (const nodeText of ["Parent-A", "Parent-B", "Leaf-C", "Parent-D"]) {
      const { bottomRow } = findCardBorderRows(app, nodeText)
      // Check cells across the full width using the screen buffer (not text)
      let foundCornerLeft = false
      let foundCornerRight = false
      for (let x = 0; x < app.screen.width; x++) {
        const cell = app.screen.cell(x, bottomRow)
        if (cell.char === "\u2570") foundCornerLeft = true
        if (cell.char === "\u256f") foundCornerRight = true
        // Between corners: should be ─, not space or other characters
        if (foundCornerLeft && !foundCornerRight && cell.char !== "\u2570") {
          expect(
            cell.char,
            `"${nodeText}" bottom border cell at (${x},${bottomRow}) should be ─ but got "${cell.char}"`,
          ).toBe("\u2500")
        }
      }
      expect(foundCornerLeft, `"${nodeText}" bottom border has ╰`).toBe(true)
      expect(foundCornerRight, `"${nodeText}" bottom border has ╯`).toBe(true)
    }
  })
})

// =============================================================================
// Fold border regression
// =============================================================================

describe("Fold border regression", () => {
  function countBottomBorders(screenshot: string): number {
    return screenshot.split("\n").filter((line) => /╰.*─.*╯/.test(line)).length
  }

  function countTopBorders(screenshot: string): number {
    return screenshot.split("\n").filter((line) => /╭.*─.*╮/.test(line)).length
  }

  test("every visible card has matching top and bottom borders", () => {
    // Cards with children overflow a 20-row viewport with default fold depth.
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item("A", item("a1"), item("a2"), item("a3")),
          item("B", item("b1"), item("b2")),
          item("C", item("c1"), item("c2"), item("c3")),
          item("D"),
          item("E", item("e1")),
          item("F"),
          item("G", item("g1")),
        ),
      ),
      { cols: 60, rows: 20 },
    )

    // At every fold level, top borders must equal bottom borders
    for (let press = 0; press < 4; press++) {
      if (press > 0) app.command("fold_all_more")
      const text = app.text
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      // Top can exceed bottom by 1 (partially visible card at viewport edge)
      expect(Math.abs(top - bottom), `After ${press} '<' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }

    for (let press = 0; press < 4; press++) {
      app.command("unfold_all_more")
      const text = app.text
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      expect(Math.abs(top - bottom), `After ${press} '>' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }
  })

  test("border integrity after scrolling then folding", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item("A", item("a1"), item("a2")),
          item("B", item("b1"), item("b2")),
          item("C", item("c1")),
          item("D", item("d1"), item("d2"), item("d3")),
          item("E"),
          item("F", item("f1")),
          item("G"),
          item("H", item("h1")),
        ),
      ),
      { cols: 60, rows: 20 },
    )

    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("fold_all_more")
    app.command("fold_all_more")

    const text = app.text
    const top = countTopBorders(text)
    const bottom = countBottomBorders(text)
    expect(Math.abs(top - bottom), `scrolled + folded: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// Overflow-to-no-overflow transition (fold-border-blank root cause)
// =============================================================================

describe("fold overflow transition border integrity", () => {
  /**
   * When a card has overflow (+N indicator), folding it via H removes all children
   * and the card transitions from custom bottom border (╰─ +N ─╯) to standard
   * round border (╰──────╯). This transition must not leave stale pixels.
   */
  test("fold card with overflow preserves bottom border (no blank cells)", () => {
    // Create cards with enough children to trigger overflow
    // maxContentLines defaults to 3, so 6 children will show +3 overflow
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item("BigCard", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6")),
          item("SmallCard"),
        ),
      ),
      { cols: 60, rows: 30, incremental: true },
    )

    // Verify overflow is showing before fold
    const before = app.text
    expect(before, "should show overflow indicator").toContain("+")

    // Fold BigCard via H
    app.command("fold_more")

    // After fold, the +N indicator should be gone and borders should be intact
    const after = app.text
    const lines = after.split("\n")

    // Find BigCard and check its bottom border row
    let bigCardRow = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes("BigCard")) {
        bigCardRow = i
        break
      }
    }
    expect(bigCardRow, "BigCard should be found in screenshot").toBeGreaterThan(-1)

    // Check that no row between BigCard and SmallCard has blank/space cells
    // where border characters should be
    let bottomBorderRow = -1
    for (let i = bigCardRow + 1; i < lines.length; i++) {
      if (lines[i]!.includes("╰")) {
        bottomBorderRow = i
        break
      }
    }
    expect(bottomBorderRow, "BigCard should have bottom border").toBeGreaterThan(bigCardRow)

    // Cell-level check: bottom border row should have proper border characters.
    // The row pattern is: ╰─── +N ───╯ (when overflow, label has spaces)
    // or ╰────────────╯ (when no overflow)
    // Allowed chars between ╰ and ╯: ─, space (part of +N label), +, digits
    const rowText = app.screen.row(bottomBorderRow)
    let inBorder = false
    // Overflow label format: "─── +N more ───" — allow border chars, digits, and "more" letters
    const ALLOWED = new Set(["─", " ", "+", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "m", "o", "r", "e"])
    for (let x = 0; x < app.screen.width; x++) {
      const cell = app.screen.cell(x, bottomBorderRow)
      if (cell.char === "╰") {
        inBorder = true
        continue
      }
      if (cell.char === "╯") {
        inBorder = false
        continue
      }
      if (inBorder && !ALLOWED.has(cell.char)) {
        expect(
          cell.char,
          `BigCard bottom border at (${x},${bottomBorderRow}) has unexpected char "${cell.char}" (row: "${rowText}")`,
        ).toBe("─")
      }
    }

    // Also verify the row is entirely accounted for (has both corners)
    expect(rowText, "bottom border should have ╰").toContain("╰")
    expect(rowText, "bottom border should have ╯").toContain("╯")
  })

  test("unfold card restores overflow indicator without border corruption", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item("BigCard", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6")),
          item("NextCard", item("n1")),
        ),
      ),
      { cols: 60, rows: 30, incremental: true },
    )

    // Fold then unfold — should restore overflow indicator with intact borders
    app.command("fold_more") // fold
    app.command("unfold_more") // unfold

    const after = app.text
    expect(after, "should show overflow indicator after unfold").toContain("+")

    // Check NextCard's top border is intact (card below BigCard)
    const lines = after.split("\n")
    let nextCardRow = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes("NextCard")) {
        nextCardRow = i
        break
      }
    }
    expect(nextCardRow).toBeGreaterThan(-1)

    // Row above NextCard should be a top border (╭) or BigCard's bottom border
    if (nextCardRow > 0) {
      const rowAbove = lines[nextCardRow - 1]!
      expect(
        rowAbove.includes("╭") || rowAbove.includes("╰") || rowAbove.includes("+"),
        `Row above NextCard should be a border: "${rowAbove}"`,
      ).toBe(true)
    }
  })

  test("decrease outline depth with overflow cards preserves all borders (cell-level)", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item(
            "CardA",
            item("a1", item("deep1")),
            item("a2", item("deep2")),
            item("a3", item("deep3")),
            item("a4"),
            item("a5"),
          ),
          item("CardB", item("b1"), item("b2"), item("b3"), item("b4")),
          item("CardC"),
        ),
      ),
      { cols: 60, rows: 25, incremental: true },
    )

    // Decrease outline depth — should change overflow counts
    app.command("fold_all_more")

    // Check every visible card's bottom border row
    for (const nodeText of ["CardA", "CardB", "CardC"]) {
      const lines = app.text.split("\n")
      let textRow = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes(nodeText) && lines[i]!.includes("│")) {
          textRow = i
          break
        }
      }
      if (textRow === -1) continue // card may be off-screen

      // Find bottom border below this card
      let bottomRow = -1
      for (let i = textRow + 1; i < lines.length; i++) {
        if (lines[i]!.includes("╰")) {
          bottomRow = i
          break
        }
        if (lines[i]!.includes("╭")) break // hit next card's top, no bottom border found
      }
      if (bottomRow === -1) continue

      // Cell-level: no blank cells in bottom border
      let inBorder = false
      for (let x = 0; x < app.screen.width; x++) {
        const cell = app.screen.cell(x, bottomRow)
        if (cell.char === "\u2570") inBorder = true
        if (cell.char === "\u256f") inBorder = false
        if (inBorder && cell.char !== "\u2570" && cell.char !== "\u2500" && cell.char !== " ") {
          // Allow spaces for "+N" label, but not blank cells outside the label
          const rowText = app.screen.row(bottomRow)
          if (!rowText.includes("+")) {
            expect(cell.char, `"${nodeText}" bottom border at (${x},${bottomRow}) should be ─`).toBe("\u2500")
          }
        }
      }
    }
  })
})

// =============================================================================
// Fold count color
// =============================================================================

describe("fold count color", () => {
  /**
   * Find the child count cell on a given row.
   * Looks for a number preceded by whitespace near the end of the row.
   */
  function findCountCell(
    board: ReturnType<typeof testEnv>["board"],
    row: number,
  ): { x: number; y: number; char: string; fg: unknown; bg: unknown; attrs: Record<string, unknown> } | null {
    const rowText = board.screen.row(row)
    // The count is at the right end of content area, before any border char
    const match = rowText.match(/\s(\d+)\s*[│]?\s*$/)
    if (match?.index === undefined) return null
    const countX = match.index + 1 // skip leading space
    const cell = board.screen.cell(countX, row)
    return {
      x: countX,
      y: row,
      char: cell.char,
      fg: cell.fg,
      bg: cell.bg,
      attrs: cell.attrs as Record<string, unknown>,
    }
  }

  describe("card with children in columns view", () => {
    // Child count is only shown in columns (oneliner) view, not cards view.
    // Use two cards so the cursor card has a unique name not in the breadcrumb.
    function createBoard() {
      return testEnv(
        () => item("board", item("col1", item("Alpha", item("cmd1"), item("cmd2"), item("cmd3")), item("Beta"))),
        { columns: 80, rows: 24, viewMode: "columns" },
      )
    }

    /** Find the row for a card by looking in the content area (skip breadcrumb at row 0) */
    function findCardRow(board: ReturnType<typeof testEnv>["board"], name: string): number {
      for (let r = 2; r < 24; r++) {
        const text = board.screen.row(r)
        if (text.includes(name)) return r
      }
      return -1
    }

    test("count is not dim when children visible", () => {
      const { board } = createBoard()

      const pcRow = findCardRow(board, "Alpha")
      expect(pcRow, "Alpha row").toBeGreaterThanOrEqual(2)

      const countCell = findCountCell(board, pcRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should NOT be dim
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
    })

    test("count is not bold when children hidden (folded)", () => {
      const { board } = createBoard()

      // Fold Alpha with H
      board.command("fold_more")

      const pcRow = findCardRow(board, "Alpha")
      expect(pcRow, "Alpha row").toBeGreaterThanOrEqual(2)

      // The count should appear on Alpha showing folded children count
      const countCell = findCountCell(board, pcRow)
      if (countCell) {
        expect(countCell.attrs.dim, "not dim").toBeFalsy()
        expect(countCell.attrs.bold, "not bold").toBeFalsy()
      }
    })

    test("count is never dimmed regardless of fold state", () => {
      const { board } = createBoard()

      const pcRow = findCardRow(board, "Alpha")
      expect(pcRow, "Alpha row (unfolded)").toBeGreaterThanOrEqual(2)
      const cell2 = findCountCell(board, pcRow)
      expect(cell2).not.toBeNull()

      // cell2 should not be dimmed
      expect(cell2!.attrs.dim, "not dim when unfolded").toBeFalsy()
      expect(cell2!.attrs.bold, "not bold when unfolded").toBeFalsy()
    })
  })

  describe("column header count with ownColor", () => {
    function createColorBoard() {
      // Two columns: col-colored (cyan, WIP limit 5) and col-other.
      // Navigate cursor to col-other so col-colored is unselected.
      // WIP limit is required for count to be visible.
      const nodes = item(
        "board",
        item("col-colored km.limit:: 5", item("c1"), item("c2"), item("c3")),
        item("col-other", item("other-task")),
      )
      // Set color on the column node
      nodes.find((n) => n.id === "col-colored km.limit:: 5")!.rules = { color: "cyan", limit: 5 } as any
      return testEnv(() => nodes, { columns: 80, rows: 24 })
    }

    test("column header count is $text2, not ownColor, when column unselected", () => {
      const { board } = createColorBoard()

      // Move cursor to col-other so col-colored is unselected
      board.command("cursor_right")

      // Find the header row containing "col-colored"
      const headerRow = board.screen.findRow("col-colored")
      expect(headerRow, "header row found").toBeGreaterThanOrEqual(0)

      // Find the "3/5" count in the first column (left half of screen).
      // With 80 cols and 2 columns, col-colored is in the first ~40 chars.
      const rowText = board.screen.row(headerRow)
      const halfWidth = Math.floor(80 / 2)
      const leftHalf = rowText.slice(0, halfWidth)
      const countMatch = leftHalf.match(/(\d+\/\d+)\s*$/)
      expect(countMatch, "count/wip found in col-colored header").not.toBeNull()
      const countX = countMatch!.index!

      const cell = board.screen.cell(countX, headerRow)
      expect(cell.char).toBe("3")

      // Count should be white (fg=7, $text2), not cyan (ownColor)
      expect(cell.fg, "fg=7 (white/$text2), not ownColor").toBe(7)
      expect(cell.attrs.dim, "not dim").toBeFalsy()
    })
  })
})

// =============================================================================
// Progressive fold/unfold
// =============================================================================

describe("progressive fold/unfold", () => {
  // Deep tree: board > col > card > child > grandchild > great-grandchild
  // With default fold depth of 2, nodes at depth >= 2 with children are auto-folded.
  const deepTree = () =>
    item(
      "board",
      item(
        "col1",
        item.folder(
          "Project",
          item.folder("Phase 1", item.folder("Task A", item("subtask-x")), item("Task B")),
          item.folder("Phase 2", item("Task C")),
        ),
      ),
    )

  test("initial fold depth: cards render with remainingDepth=2, deepest children folded", () => {
    using app = createTestApp(deepTree(), { rows: 30 })

    const initial = app.text
    // remainingDepth={2}: card content visible down to depth 2 from card root
    // Phase 1/2 at depth 1 — visible
    expect(initial).toContain("Phase 1")
    expect(initial).toContain("Phase 2")
    // Task A/B/C at depth 2 — visible (depth 0 = node shown but children folded)
    expect(initial).toContain("Task A")
    expect(initial).toContain("Task B")
    expect(initial).toContain("Task C")
    // subtask-x at depth 3 — hidden (Task A at depth 0 is folded, hiding children)
    expect(initial).not.toContain("subtask-x")
  })

  test("L unfolds per-card depth, eventually revealing deepest children", async () => {
    // Disable incremental check: expanding folded nodes changes tree height,
    // which can cause fresh-render layout drift in silvery
    using app = createTestApp(deepTree(), { rows: 30, checkIncremental: false })

    // Initially everything visible down to depth 2, subtask-x hidden
    expect(app.text).toContain("Phase 1")
    expect(app.text).toContain("Task A")
    expect(app.text).not.toContain("subtask-x")

    // First L: increases Project foldOverride from inherited 1 → 2 (same as default remainingDepth)
    // No visible change since resolved depth was already 2
    app.command("unfold_more")
    expect(app.text).not.toContain("subtask-x")

    // Second L: increases Project foldOverride to 3, Task A gets depth 1, subtask-x visible
    app.command("unfold_more")
    expect(app.text).toContain("subtask-x")
  })

  test("H folds deepest unfolded level progressively", () => {
    // Disable incremental check: fold/unfold changes tree height
    using app = createTestApp(deepTree(), { rows: 30, checkIncremental: false })

    // Initially Phase 1/2 are folded. Unfold both levels first.
    app.command("unfold_more") // unfold Phase 1/2, auto-fold Task A
    app.command("unfold_more") // unfold Task A
    expect(app.text).toContain("subtask-x")

    // H folds deepest unfolded foldable level (Task A at depth 2)
    app.command("fold_more")
    expect(app.text).not.toContain("subtask-x")
    expect(app.text).toContain("Task A") // still visible, just folded

    // Another H folds Phase 1/2 (depth 1)
    app.command("fold_more")
    expect(app.text).not.toContain("Task A")
    expect(app.text).not.toContain("Task B")
    expect(app.text).toContain("Phase 1") // still shows as folded header

    // Another H folds Project itself (depth 0)
    app.command("fold_more")
    expect(app.text).not.toContain("Phase 1")
    expect(app.text).toContain("Project") // card title always visible
  })

  test("L on fully-folded card reveals only one level (progressive disclosure, km-ovuzg)", async () => {
    // Disable incremental check: fold/unfold changes tree height
    using app = createTestApp(deepTree(), { rows: 30, checkIncremental: false })

    // Fold Project completely (3 H presses: depth 2 -> depth 1 -> depth 0)
    app.command("fold_more") // fold Phase 1/2 (depth 1 — deepest unfolded with children)
    app.command("fold_more") // fold Project (depth 0)
    expect(app.text).not.toContain("Phase 1")
    expect(app.text).toContain("Project")

    // First L: unfold Project — should reveal Phase 1/2 but NOT their children
    app.command("unfold_more")
    const afterFirstL = app.text
    expect(afterFirstL).toContain("Phase 1")
    expect(afterFirstL).toContain("Phase 2")
    // Phase 1/2's children should be hidden because they were auto-folded
    expect(afterFirstL).not.toContain("Task A")
    expect(afterFirstL).not.toContain("Task B")
    expect(afterFirstL).not.toContain("Task C")

    // Second L: unfold Phase 1/2 — should reveal Task A/B/C but NOT subtask-x
    app.command("unfold_more")
    const afterSecondL = app.text
    expect(afterSecondL).toContain("Task A")
    expect(afterSecondL).toContain("Task B")
    expect(afterSecondL).toContain("Task C")
    // subtask-x should still be hidden (Task A auto-folded since it has children)
    expect(afterSecondL).not.toContain("subtask-x")

    // Third L: unfold Task A — reveals subtask-x
    app.command("unfold_more")
    expect(app.text).toContain("subtask-x")
  })

  test("L on card with flat children (no grandchildren) reveals all at once", () => {
    // When children are all leaves, L should show them all — no unnecessary folding
    using app = createTestApp(
      item("board", item("col1", item.folder("FlatParent", item("child-a"), item("child-b"), item("child-c")))),
      { rows: 30, checkIncremental: false },
    )

    // Fold FlatParent
    app.command("fold_more")
    expect(app.text).not.toContain("child-a")

    // Unfold — all children should be visible (they're all leaves)
    app.command("unfold_more")
    const after = app.text
    expect(after).toContain("child-a")
    expect(after).toContain("child-b")
    expect(after).toContain("child-c")
  })

  test("H/L round-trip: fold then unfold restores visibility", () => {
    // Disable incremental check: fold/unfold changes tree height
    using app = createTestApp(deepTree(), { rows: 30, checkIncremental: false })

    // Initially Phase 1/2 are folded at depth 1. Unfold first.
    app.command("unfold_more") // unfold Phase 1/2, auto-fold Task A
    expect(app.text).toContain("Task A")

    // H folds the deepest unfolded level (Phase 1/2 at depth 1, since Task A is auto-folded)
    app.command("fold_more")
    const folded = app.text
    expect(folded).not.toContain("Task A")
    expect(folded).toContain("Phase 1") // visible but folded

    // L unfolds the shallowest fold — Phase 1/2 at depth 1
    // With progressive disclosure, children-with-children (Task A) get auto-folded
    app.command("unfold_more")
    const restored = app.text
    expect(restored).toContain("Phase 1")
    expect(restored).toContain("Task A") // visible but folded (auto-folded by progressive disclosure)
    expect(restored).toContain("Task B") // leaf, always visible
    expect(restored).not.toContain("subtask-x") // Task A is auto-folded, so subtask-x hidden
  })
})

// =============================================================================
// Fold Boundary Feedback (km-tui.fold-boundary)
// =============================================================================

describe("fold boundary feedback (km-tui.fold-boundary)", () => {
  test("H at depth 0 rings bell with 'already fully folded' message", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Fold to depth 0
    board.command("fold_more") // fold once

    // Try to fold again — should hit boundary
    board.command("fold_more")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("already fully folded")
  })

  test("< (fold all) progressively folds all cards to depth 0", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Initially child-1 is visible
    expect(board.screenshot()).toContain("child-1")

    // Progressive fold: 3 presses to reach depth 0 (3→2→1→0)
    board.command("fold_all_more").command("fold_all_more").command("fold_all_more")
    expect(board.screenshot()).not.toContain("child-1")
    expect(board.screenshot()).toContain("Parent") // card title always visible

    // Pressing < again is idempotent (FOLD_LEVEL always succeeds, no bell)
    board.command("fold_all_more")
    expect(board.screenshot()).not.toContain("child-1")
  })

  test("L clears bell on valid unfold after boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Hit fold boundary
    board.command("fold_more")
    board.command("fold_more")
    expect(board.bell).toBe(true)

    // Unfold — should clear bell and succeed (status shows info "Unfolded: ...")
    board.command("unfold_more")
    expect(board.bell).toBe(false)
    expect(board.screenshot()).toContain("child-1")
  })

  test("> (unfold all) removes all per-card fold overrides", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Fold first, then unfold all
    board.command("fold_all_more").command("fold_all_more").command("fold_all_more") // progressive: 3→2→1→0
    expect(board.screenshot()).not.toContain("child-1")

    // Unfold all — progressive unfold back
    board.command("unfold_all_more")
    expect(board.screenshot()).toContain("child-1")

    // Pressing > again is idempotent (UNFOLD_LEVEL always succeeds, no bell)
    board.command("unfold_all_more")
    expect(board.screenshot()).toContain("child-1")
  })

  test("L (unfold node) caps at MAX_FOLD_DEPTH per card", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Unfold many times on the same card to reach the cap
    for (let i = 0; i < 25; i++) {
      board.command("unfold_more")
    }

    expect(board.bell).toBe(true)
    const status = board.getStatus()
    expect(status?.message).toContain("maximum depth reached")
  })

  test("fold depth never goes negative (H repeatedly)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Press H many times — should bottom out at 0, never go negative
    for (let i = 0; i < 10; i++) {
      board.command("fold_more")
    }

    // Should ring bell (at boundary)
    expect(board.bell).toBe(true)

    // Unfold once — should work (depth goes from 0 to 1)
    board.command("unfold_more")
    expect(board.screenshot()).toContain("child-1")
  })
})

// =============================================================================
// Cursor reveals hidden nodes — cursor must never be invisible
// =============================================================================

describe("cursor-reveals-hidden", () => {
  test("fold_all moves cursor out of hidden subtree to parent card", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Navigate to child-1 using J (block nav down)
    board.command("block_nav_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-1")

    // Fold all — progressive: 3 presses to reach depth 0 (3→2→1→0)
    board.command("fold_all_more").command("fold_all_more").command("fold_all_more")

    // Children should be hidden
    expect(board.screenshot()).not.toContain("child-1")

    // BUG: cursor stays on hidden child-1 instead of moving to visible ancestor
    const paneAfterFold = getActiveBoardPane(store.getState())!
    expect(paneAfterFold.sel.node.cursor() as string | null).not.toBe("child-1")
    // Cursor should be on a visible node (data-cursor attribute rendered on screen)
    expect(board.q(`[data-cursor]`).count()).toBeGreaterThan(0)
  })

  test("TOGGLE_FOLD on card with cursor on child moves cursor to card", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Navigate to child-1 using J (block nav down)
    board.command("block_nav_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-1")

    // Toggle fold on the parent card via the board reducer directly
    // (fold_node/H may not fold when cursor is on subitem — TOGGLE_FOLD is the direct path)
    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "Parent" })
    // Force React to re-render
    board.press("")

    // After fold, children should be hidden
    expect(board.screenshot()).not.toContain("child-1")

    // Cursor should have moved to the card (not stuck on hidden child)
    const paneAfterFold = getActiveBoardPane(store.getState())!
    expect(paneAfterFold.sel.node.cursor() as string | null).not.toBe("child-1")
    expect(board.q(`[data-cursor]`).count()).toBeGreaterThan(0)
  })

  test("block_nav_down auto-unfolds when cursor moves beyond render depth", () => {
    // Deep tree: card → item1a (depth 1) → 5 children at depth 2 (FoldedChildRow)
    // CARD_REMAINING_DEPTH = 2: item1a visible, children rendered as FoldedChildRow
    // When ctrl-n navigates past children, all siblings should be visible
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("card", item("item1a", item("c1"), item("c2"), item("c3"), item("c4"), item("c5")))),
        ),
      { rows: 30, checkIncremental: false },
    )

    // Navigate: card → item1a → c1 → c2 → ... → c5
    board.command("block_nav_down") // card → item1a
    board.expect("#item1a[data-cursor]").toExist()

    board.command("block_nav_down") // item1a → c1
    board.expect("#c1[data-cursor]").toExist()
    expect(board.screenshot()).toContain("c1")

    // Navigate to the last child — all siblings should remain visible
    board.command("block_nav_down") // c1 → c2
    board.command("block_nav_down") // c2 → c3
    board.command("block_nav_down") // c3 → c4
    board.expect("#c4[data-cursor]").toExist()
    expect(board.screenshot()).toContain("c4")

    board.command("block_nav_down") // c4 → c5
    board.expect("#c5[data-cursor]").toExist()
    expect(board.screenshot()).toContain("c5")
    // All siblings should be visible
    expect(board.screenshot()).toContain("c1")
    expect(board.screenshot()).toContain("c2")
    expect(board.screenshot()).toContain("c3")
    expect(board.screenshot()).toContain("c4")
  })

  test("block_nav_down skips task-status-filtered nodes", () => {
    // Card has children, some with task status "done". When task filter hides done items,
    // block_nav_down should skip them — cursor must not land on a hidden node.
    const nodes = item("board", item("col1", item("Card", item("done-task"), item("todo-task"), item("another-done"))))
    // Mark some as done
    const doneNode = nodes.find((n) => n.id === "done-task")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }
    const anotherDone = nodes.find((n) => n.id === "another-done")!
    anotherDone.item = { ...anotherDone.item, task: { status: "done", marker: "[x]" } }

    const { board, store } = testEnv(() => nodes, { rows: 24, checkIncremental: false })

    // Enable task filter: only show "todo" status
    board.setUI({
      filterProperties: {
        taskStatus: new Set(["todo"]),
        priority: new Set(),
        dueDate: new Set(),
        assignedTo: new Set(),
        nodeType: new Set(),
      },
    })
    // Force re-render
    board.press("")

    // Verify done tasks are hidden
    expect(board.screenshot()).not.toContain("done-task")
    expect(board.screenshot()).toContain("todo-task")

    // Navigate: Card → should skip done-task, land on todo-task
    board.command("block_nav_down")
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.sel.node.cursor() as string | null).toBe("todo-task")
    expect(board.screenshot()).toContain("todo-task")
  })

  test("block_nav_down skips done parent subtrees (todo children inside done parent)", () => {
    // Matches ~vault/TODO.md: Card has done children (item1) with todo grandchildren (1-5).
    // Block nav must NOT descend into done parent's subtree — those children are invisible.
    const nodes = item(
      "board",
      item("col1", item("Card", item("done-parent", item("todo-grandchild")), item("todo-sibling"))),
    )
    const doneNode = nodes.find((n) => n.id === "done-parent")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }

    const { board, store } = testEnv(() => nodes, { rows: 24, checkIncremental: false })

    board.setUI({
      filterProperties: {
        taskStatus: new Set(["todo"]),
        priority: new Set(),
        dueDate: new Set(),
        assignedTo: new Set(),
        nodeType: new Set(),
      },
    })
    board.press("")

    // ctrl-n from Card should skip done-parent AND its todo-grandchild, land on todo-sibling
    board.command("block_nav_down")
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.sel.node.cursor() as string | null).toBe("todo-sibling")
    expect(board.screenshot()).toContain("todo-sibling")
    // Must NOT land on the invisible grandchild
    expect(pane.sel.node.cursor() as string | null).not.toBe("todo-grandchild")
  })

  test("block_nav_down auto-unfolds deeply nested nodes", () => {
    // 4-level deep: card → section → task → subtask (depth 3, invisible without unfold)
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card", item("section-a", item("task-a", item("subtask-x")))))),
      { rows: 30, checkIncremental: false },
    )

    board.command("block_nav_down") // card → section-a
    board.command("block_nav_down") // section-a → task-a
    board.command("block_nav_down") // task-a → subtask-x (depth 3)
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.sel.node.cursor() as string | null).toBe("subtask-x")
    expect(board.screenshot()).toContain("subtask-x")
  })
})

// =============================================================================
// Sticky folds (km-tui.sticky-fold Phase 2) — per-node pins immune to fold-all
// =============================================================================

describe("sticky folds", () => {
  test("vs on an unfolded card pins it — fold_all_more leaves it unfolded", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.folder("PinnedParent", item("pinned-child-1"), item("pinned-child-2")),
          item.folder("OtherParent", item("other-child-1"), item("other-child-2")),
        ),
      ),
    )

    // Move cursor to the parent card we want to pin.
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "PinnedParent" })
    board.press("")

    // Press vs → toggle_sticky_fold pins PinnedParent as sticky-unfolded
    // (current state = unfolded). store action is the direct path; board.command
    // is the binding-driven equivalent if vs resolves via keybinding.
    board.command("toggle_sticky_fold")

    // Sticky state is in the active board pane
    let pane = getActiveBoardPane(store.getState())!
    expect(pane.stickyFolds.get("PinnedParent")).toBe("unfolded")

    // Sanity check: both parents' children are currently visible
    expect(board.screenshot()).toContain("pinned-child-1")
    expect(board.screenshot()).toContain("other-child-1")

    // Fold progressively until children would be hidden. fold_all_more is
    // progressive (depth 3 → 2 → 1 → 0); 3 presses reach depth 0.
    board.command("fold_all_more")
    board.command("fold_all_more")
    board.command("fold_all_more")

    // Sticky check: OtherParent's children are hidden, PinnedParent's are NOT.
    expect(board.screenshot()).not.toContain("other-child-1")
    expect(board.screenshot()).toContain("pinned-child-1")

    // Sticky state survives the fold-all (not cleared)
    pane = getActiveBoardPane(store.getState())!
    expect(pane.stickyFolds.get("PinnedParent")).toBe("unfolded")
  })

  test("vs on a folded card pins it — unfold_all_more leaves it folded", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.folder("PinnedParent", item("pinned-child-1"), item("pinned-child-2")),
          item.folder("OtherParent", item("other-child-1"), item("other-child-2")),
        ),
      ),
    )

    // Fold PinnedParent first via the store (skips the cursor-nav dance).
    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "PinnedParent" })
    board.press("")
    expect(board.screenshot()).not.toContain("pinned-child-1")

    // Move cursor to the now-folded card
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "PinnedParent" })
    board.press("")

    // Pin it — now sticky-folded
    board.command("toggle_sticky_fold")
    let pane = getActiveBoardPane(store.getState())!
    expect(pane.stickyFolds.get("PinnedParent")).toBe("folded")

    // Also fold OtherParent so unfold_all_more has something to unfold
    store.getState().dispatchBoard({ type: "TOGGLE_FOLD", nodeId: "OtherParent" })
    board.press("")
    expect(board.screenshot()).not.toContain("other-child-1")

    // unfold_all_more: OtherParent unfolds, PinnedParent stays folded
    board.command("unfold_all_more")
    board.press("")

    expect(board.screenshot()).toContain("other-child-1")
    expect(board.screenshot()).not.toContain("pinned-child-1")

    // Sticky state survives the unfold-all
    pane = getActiveBoardPane(store.getState())!
    expect(pane.stickyFolds.get("PinnedParent")).toBe("folded")
  })

  test("vs three times cycles sticky-unfolded → sticky-folded → off", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Cursor on the parent card; card starts unfolded.
    store.getState().dispatchBoard({ type: "SELECT", nodeId: "Parent" })
    board.press("")

    // 1st vs: pins at current state (unfolded)
    board.command("toggle_sticky_fold")
    expect(getActiveBoardPane(store.getState())!.stickyFolds.get("Parent")).toBe("unfolded")
    // Children still visible (sticky-unfolded keeps them visible)
    expect(board.screenshot()).toContain("child-1")

    // 2nd vs: flips to sticky-folded and collapses the node
    board.command("toggle_sticky_fold")
    expect(getActiveBoardPane(store.getState())!.stickyFolds.get("Parent")).toBe("folded")
    expect(board.screenshot()).not.toContain("child-1")

    // 3rd vs: clears the pin entirely (node remains folded; user can unfold)
    board.command("toggle_sticky_fold")
    expect(getActiveBoardPane(store.getState())!.stickyFolds.has("Parent")).toBe(false)
  })
})

// =============================================================================
// Characterization: fold depths preserved across zoom
// =============================================================================

describe("fold depth preservation across zoom", () => {
  test("zoom out resets fold depths — folded children become visible again", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )

    // Fold the Parent card (H)
    board.command("fold_more")
    expect(board.screenshot()).not.toContain("child-1")

    // Confirm fold state exists
    const pane1 = getActiveBoardPane(store.getState())!
    expect(pane1.foldDepths.size).toBeGreaterThan(0)

    // Zoom into col1
    board.command("zoom_inwards")
    const pane2 = getActiveBoardPane(store.getState())!
    expect(pane2.rootId).not.toBe("board")

    // Zoom back out
    board.command("zoom_outwards")

    // Current behavior: zoom cycle resets fold depths — children become visible
    // (Characterization: this documents that fold state is lost on zoom out)
    expect(board.screenshot()).toContain("Parent")
    expect(board.screenshot()).toContain("child-1")
  })

  test("progressive fold all (< x3) then unfold all (> x3) restores children", () => {
    using app = createTestApp(
      item("board", item("col1", item.folder("P1", item("c1"), item("c2")), item.folder("P2", item("c3")))),
    )

    expect(app.text).toContain("c1")
    expect(app.text).toContain("c3")

    // Fold all progressively
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.command("fold_all_more")
    expect(app.text).not.toContain("c1")
    expect(app.text).not.toContain("c3")

    // Unfold all progressively — children should restore
    app.command("unfold_all_more")
    app.command("unfold_all_more")
    app.command("unfold_all_more")
    expect(app.text).toContain("c1")
    expect(app.text).toContain("c3")
  })

  test("sticky fold survives navigation away and back", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Pinned", item("child-1"), item("child-2"))), item("col2", item("other"))),
    )

    // Navigate to Pinned and toggle sticky fold
    board.navigateTo("Pinned")
    board.command("toggle_sticky_fold") // unfolded → sticky-unfolded
    board.command("toggle_sticky_fold") // sticky-unfolded → sticky-folded

    const paneBefore = getActiveBoardPane(store.getState())!
    expect(paneBefore.stickyFolds.has("Pinned")).toBe(true)

    // Navigate away to col2
    board.press("l")
    // Navigate back
    board.press("h")

    // Sticky fold should still be there
    const paneAfter = getActiveBoardPane(store.getState())!
    expect(paneAfter.stickyFolds.has("Pinned")).toBe(true)
  })
})
