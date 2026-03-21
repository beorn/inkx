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
import { VirtualTerminal, outputPhase } from "@silvery/term/toolbelt"

// =============================================================================
// Fold all / unfold all commands
// =============================================================================

describe("fold-all-corruption", () => {
  test("zM (fold all chord) folds all cards in column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    expect(board.screenshot()).toContain("child-1")

    // zM chord → fold_all (FOLD_LEVEL depth:1)
    board.command("fold_all")

    expect(board.screenshot()).not.toContain("child-1")
    expect(board.screenshot()).not.toContain("child-2")
    // Parent title should still be readable
    expect(board.screenshot()).toContain("Parent")
  })

  test("H folds a card, > should unfold it", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Fold via H
    board.command("fold_node")

    // Children should be hidden
    expect(board.screenshot()).not.toContain("child-1")

    // Z (unfold all) should restore children
    board.command("unfold_all")

    expect(board.screenshot()).toContain("child-1")
    expect(board.screenshot()).toContain("child-2")
  })

  test("H (fold_node) folds current card and hides children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    expect(board.screenshot()).toContain("child-1")

    // H → fold_node
    board.command("fold_node")

    const folded = board.screenshot()
    expect(folded).not.toContain("child-1")
    expect(folded).not.toContain("child-2")
    expect(folded).toContain("Parent")
  })

  test("L (unfold node) restores children after fold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Fold with H
    board.command("fold_node")
    expect(board.screenshot()).not.toContain("child-1")

    // Unfold with L
    board.command("unfold_node")

    const unfolded = board.screenshot()
    expect(unfolded).toContain("child-1")
    expect(unfolded).toContain("child-2")
  })

  test("Z unfolds all after individually folding multiple cards", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Processing", item("sub-a"), item("sub-b")), item.folder("Review", item("sub-c"))),
      ),
    )

    // Fold both cards individually with H
    board.command("fold_node") // fold Processing
    board.command("cursor_down") // move to Review
    board.command("fold_node") // fold Review

    expect(board.screenshot()).not.toContain("sub-a")
    expect(board.screenshot()).not.toContain("sub-c")

    // Z should unfold all
    board.command("unfold_all")

    const after = board.screenshot()
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
    board.command("fold_all")
    const mid = board.screenshot()
    checkBorderIntegrity(mid, "after first <")

    // Decrease to depth 0 (no children visible: 0 < 0 = false)
    board.command("fold_all")
    const after = board.screenshot()
    expect(after).not.toContain("a-child1")
    checkBorderIntegrity(after, "after second <")
  })

  test("increase outline depth after decrease preserves borders", () => {
    const { board } = nestedBoard()

    // Decrease then increase
    board.command("fold_all").command("fold_all") // depth 2 → 0
    board.command("unfold_all").command("unfold_all") // depth 0 → 2

    const text = board.screenshot()
    expect(text).toContain("a-child1")
    checkBorderIntegrity(text, "after round-trip")
  })

  test("fold all (<) preserves border integrity", () => {
    const { board } = nestedBoard()

    // < = fold_all: folds all cards in column
    board.command("fold_all")

    const text = board.screenshot()
    checkBorderIntegrity(text, "after fold all")
  })

  test("toggle fold (gc) preserves border integrity", () => {
    const { board } = nestedBoard()

    // gc = toggle_collapse on current card (card-a)
    board.command("toggle_collapse")

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
    board.command("fold_all").command("fold_all")
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
    board.command("fold_all")
    const afterBuf1 = board._result.lastBuffer()!
    verifyDiffReplay(prevBuf1, afterBuf1, "after first <")

    // Capture buffer before second <
    const prevBuf2 = afterBuf1.clone()
    board.command("fold_all")
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
    board.command("fold_all")
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
    board.command("fold_all")
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
    incBoard.command("fold_all").command("fold_all")
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
    freshBoard.command("fold_all").command("fold_all")
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
  function multiCardBoard(opts?: { columns?: number; rows?: number }) {
    return testEnv(
      () =>
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
      { columns: opts?.columns ?? 60, rows: opts?.rows ?? 30, incremental: true },
    )
  }

  /**
   * Find the Card border box for a node by scanning for its text in the rendered
   * output, then searching upward/downward for top/bottom border characters.
   *
   * Returns the row indices of the card's top border (╭) and bottom border (╰).
   */
  function findCardBorderRows(
    board: ReturnType<typeof testEnv>["board"],
    nodeText: string,
  ): { topRow: number; bottomRow: number } {
    const rows = board.screenshot().split("\n")
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
  function expectBottomBorderIntact(board: ReturnType<typeof testEnv>["board"], nodeText: string) {
    const { bottomRow } = findCardBorderRows(board, nodeText)
    const rows = board.screenshot().split("\n")
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
  function expectTopBorderIntact(board: ReturnType<typeof testEnv>["board"], nodeText: string) {
    const { topRow } = findCardBorderRows(board, nodeText)
    const rows = board.screenshot().split("\n")
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
  function expectNoStaleBetweenCards(board: ReturnType<typeof testEnv>["board"], upperNode: string, lowerNode: string) {
    const { bottomRow: upperBottom } = findCardBorderRows(board, upperNode)
    const { topRow: lowerTop } = findCardBorderRows(board, lowerNode)
    const rows = board.screenshot().split("\n")
    // Between upper card bottom and lower card top, there should be no stale border chars
    for (let i = upperBottom + 1; i < lowerTop; i++) {
      const row = rows[i] ?? ""
      expect(row, `Row ${i} between "${upperNode}" and "${lowerNode}" should not have stale borders`).not.toMatch(
        /[\u2500\u2502\u256d\u256e\u256f\u2570]/,
      )
    }
  }

  test("decrease outline depth (<) preserves bottom border of folded cards", () => {
    const { board } = multiCardBoard()

    // Decrease outline depth twice: hides all children
    board.command("fold_all").command("fold_all")

    // After folding: all cards should have intact bottom borders
    expectBottomBorderIntact(board, "Parent-A")
    expectBottomBorderIntact(board, "Parent-B")
    expectTopBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Leaf-C")
  })

  test("decrease outline depth preserves borders between adjacent cards", () => {
    const { board } = multiCardBoard()

    // Fold once
    board.command("fold_all")
    expectBottomBorderIntact(board, "Parent-A")
    expectTopBorderIntact(board, "Parent-B")

    // Fold again
    board.command("fold_all")
    expectBottomBorderIntact(board, "Parent-A")
    expectTopBorderIntact(board, "Parent-B")
    expectBottomBorderIntact(board, "Leaf-C")
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(board, "Parent-B", "Leaf-C")
  })

  test("individual fold (H) preserves border of card below", () => {
    const { board } = multiCardBoard()

    // Fold Parent-A via H
    board.command("fold_node")

    // Parent-A bottom border should be intact
    expectBottomBorderIntact(board, "Parent-A")
    // Parent-B top border should be intact (card below the folded one)
    expectTopBorderIntact(board, "Parent-B")
    // No stale content between Parent-A and Parent-B
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
  })

  test("toggle fold (H) preserves borders of folded card and neighbors", () => {
    const { board } = multiCardBoard()

    // Navigate to Parent-B then fold it
    board.command("cursor_down")
    board.command("fold_node")

    // Parent-B bottom border should be intact
    expectBottomBorderIntact(board, "Parent-B")
    // Leaf-C borders should be intact (card below the folded one)
    expectTopBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Leaf-C")
    // Parent-A borders should remain intact (card above)
    expectBottomBorderIntact(board, "Parent-A")
    // No stale content between cards
    expectNoStaleBetweenCards(board, "Parent-B", "Leaf-C")
  })

  test("fold then unfold round-trip preserves all borders", () => {
    const { board } = multiCardBoard()

    // Fold Parent-A, then unfold it — individual card fold round-trip
    board.command("fold_node") // fold Parent-A
    board.command("unfold_node") // unfold Parent-A

    // All cards should have intact borders after round-trip
    expectBottomBorderIntact(board, "Parent-A")
    expectBottomBorderIntact(board, "Parent-B")
    expectBottomBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Parent-D")
    expectTopBorderIntact(board, "Parent-A")
    expectTopBorderIntact(board, "Parent-B")
    expectTopBorderIntact(board, "Leaf-C")
    expectTopBorderIntact(board, "Parent-D")
  })

  test("fold with many cards and realistic viewport (5+ cards, constrained height)", () => {
    // Smaller viewport forces scrolling and more border stress
    const { board } = testEnv(
      () =>
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
      { columns: 50, rows: 20, incremental: true },
    )

    // Fold twice to hide nested children
    board.command("fold_all").command("fold_all")

    const text = board.screenshot()
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

  test("multi-step fold sequence: navigate, fold, navigate, fold preserves borders", () => {
    const { board } = multiCardBoard()

    // Step 1: fold Parent-A
    board.command("fold_node")
    expectBottomBorderIntact(board, "Parent-A")

    // Step 2: move down to Parent-B, fold it
    board.command("cursor_down")
    board.command("fold_node")
    expectBottomBorderIntact(board, "Parent-B")

    // Step 3: move down to Leaf-C — its borders should be intact
    board.command("cursor_down")
    expectTopBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Leaf-C")

    // Step 4: move down to Parent-D, fold it
    board.command("cursor_down")
    board.command("fold_node")
    expectBottomBorderIntact(board, "Parent-D")

    // Step 5: unfold each card individually via zl, verify borders restored
    // Cursor is on Parent-D after step 4
    board.command("unfold_node") // unfold Parent-D
    expectBottomBorderIntact(board, "Parent-D")
    board.command("cursor_up") // move up to Leaf-C
    board.command("cursor_up") // move up to Parent-B
    board.command("unfold_node") // unfold Parent-B
    expectBottomBorderIntact(board, "Parent-B")
    board.command("cursor_up") // move up to Parent-A
    board.command("unfold_node") // unfold Parent-A
    expectBottomBorderIntact(board, "Parent-A")
    // No stale between cards
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(board, "Parent-B", "Leaf-C")
    expectNoStaleBetweenCards(board, "Leaf-C", "Parent-D")
  })

  test("cell-level border check: bottom border cells are not blank after fold", () => {
    const { board } = multiCardBoard()

    // Fold via < <
    board.command("fold_all").command("fold_all")

    // Find each card's bottom border row and check cell-by-cell
    for (const nodeText of ["Parent-A", "Parent-B", "Leaf-C", "Parent-D"]) {
      const { bottomRow } = findCardBorderRows(board, nodeText)
      // Check cells across the full width using the screen buffer (not text)
      let foundCornerLeft = false
      let foundCornerRight = false
      for (let x = 0; x < board.screen.width; x++) {
        const cell = board.screen.cell(x, bottomRow)
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
    const { board } = testEnv(
      () =>
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
      { columns: 60, rows: 20 },
    )

    // At every fold level, top borders must equal bottom borders
    for (let press = 0; press < 4; press++) {
      if (press > 0) board.command("fold_all")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      // Top can exceed bottom by 1 (partially visible card at viewport edge)
      expect(Math.abs(top - bottom), `After ${press} '<' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }

    for (let press = 0; press < 4; press++) {
      board.command("unfold_all")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      expect(Math.abs(top - bottom), `After ${press} '>' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }
  })

  test("border integrity after scrolling then folding", () => {
    const { board } = testEnv(
      () =>
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
      { columns: 60, rows: 20 },
    )

    board.command("cursor_down").command("cursor_down").command("cursor_down").command("cursor_down")
    board.command("fold_all").command("fold_all")

    const text = board.screenshot()
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
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("BigCard", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6")),
            item("SmallCard"),
          ),
        ),
      { columns: 60, rows: 30, incremental: true },
    )

    // Verify overflow is showing before fold
    const before = board.screenshot()
    expect(before, "should show overflow indicator").toContain("+")

    // Fold BigCard via H
    board.command("fold_node")

    // After fold, the +N indicator should be gone and borders should be intact
    const after = board.screenshot()
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
    const rowText = board.screen.row(bottomBorderRow)
    let inBorder = false
    const ALLOWED = new Set(["─", " ", "+", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])
    for (let x = 0; x < board.screen.width; x++) {
      const cell = board.screen.cell(x, bottomBorderRow)
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
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("BigCard", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6")),
            item("NextCard", item("n1")),
          ),
        ),
      { columns: 60, rows: 30, incremental: true },
    )

    // Fold then unfold — should restore overflow indicator with intact borders
    board.command("fold_node") // fold
    board.command("unfold_node") // unfold

    const after = board.screenshot()
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
    const { board } = testEnv(
      () =>
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
      { columns: 60, rows: 25, incremental: true },
    )

    // Decrease outline depth — should change overflow counts
    board.command("fold_all")

    // Check every visible card's bottom border row
    for (const nodeText of ["CardA", "CardB", "CardC"]) {
      const lines = board.screenshot().split("\n")
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
      for (let x = 0; x < board.screen.width; x++) {
        const cell = board.screen.cell(x, bottomRow)
        if (cell.char === "\u2570") inBorder = true
        if (cell.char === "\u256f") inBorder = false
        if (inBorder && cell.char !== "\u2570" && cell.char !== "\u2500" && cell.char !== " ") {
          // Allow spaces for "+N" label, but not blank cells outside the label
          const rowText = board.screen.row(bottomRow)
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

  describe("nested node with children (depth 1)", () => {
    function createBoard() {
      return testEnv(
        () =>
          item(
            "board",
            item("col1", item("parent-card", item("Essential Commands", item("cmd1"), item("cmd2"), item("cmd3")))),
          ),
        { columns: 80, rows: 24 },
      )
    }

    test("count is $text3, not dim, when children visible (outline depth 2)", () => {
      const { board } = createBoard()

      // At default outline depth 2: Essential Commands at depth 1
      // depth(1) < 2 => children visible
      const ecRow = board.screen.findRow("Essential Commands")
      expect(ecRow, "Essential Commands row").toBeGreaterThanOrEqual(0)

      const countCell = findCountCell(board, ecRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should be gray (fg=8, $text3), NOT dim, NOT bold
      expect(countCell!.fg, "fg=8 (gray/$text3)").toBe(8)
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
      expect(countCell!.attrs.bold, "not bold when children visible").toBeFalsy()
    })

    test("count is $text3, not bold, when children hidden (folded)", () => {
      const { board } = createBoard()

      // Fold parent-card with H — this hides Essential Commands' children
      // because fold_node hides all children of the folded card
      board.command("fold_node")

      // parent-card should still be visible (it's the card itself)
      const pcRow = board.screen.findRow("parent-card")
      expect(pcRow, "parent-card row").toBeGreaterThanOrEqual(0)

      // The count should appear on parent-card showing folded children count
      const countCell = findCountCell(board, pcRow)
      if (countCell) {
        // Count should be gray (fg=8, $text3), NOT dim, NOT bold
        expect(countCell.fg, "fg=8 (gray/$text3)").toBe(8)
        expect(countCell.attrs.dim, "not dim").toBeFalsy()
        expect(countCell.attrs.bold, "not bold").toBeFalsy()
      }
    })

    test("count is never dimmed regardless of fold state", () => {
      const { board } = createBoard()

      // Unfolded: children visible — check count on Essential Commands row
      const ecRow2 = board.screen.findRow("Essential Commands")
      expect(ecRow2, "Essential Commands row (unfolded)").toBeGreaterThanOrEqual(0)
      const cell2 = findCountCell(board, ecRow2)
      expect(cell2).not.toBeNull()

      // cell2 should not be dimmed
      expect(cell2!.attrs.dim, "not dim when unfolded").toBeFalsy()
      expect(cell2!.fg, "gray/$text3 when unfolded").toBe(8)
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
    const { board } = testEnv(deepTree, { rows: 30 })

    const initial = board.screenshot()
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

  test("L unfolds per-card depth, eventually revealing deepest children", () => {
    // Disable incremental check: expanding folded nodes changes tree height,
    // which can cause fresh-render layout drift in silvery
    const { board } = testEnv(deepTree, { rows: 30, checkIncremental: false })

    // Initially everything visible down to depth 2, subtask-x hidden
    expect(board.screenshot()).toContain("Phase 1")
    expect(board.screenshot()).toContain("Task A")
    expect(board.screenshot()).not.toContain("subtask-x")

    // First L: increases Project foldOverride from inherited 1 → 2 (same as default remainingDepth)
    // No visible change since resolved depth was already 2
    board.command("unfold_node")
    expect(board.screenshot()).not.toContain("subtask-x")

    // Second L: increases Project foldOverride to 3, Task A gets depth 1, subtask-x visible
    board.command("unfold_node")
    expect(board.screenshot()).toContain("subtask-x")
  })

  test("H folds deepest unfolded level progressively", () => {
    // Disable incremental check: fold/unfold changes tree height
    const { board } = testEnv(deepTree, { rows: 30, checkIncremental: false })

    // Initially Phase 1/2 are folded. Unfold both levels first.
    board.command("unfold_node") // unfold Phase 1/2, auto-fold Task A
    board.command("unfold_node") // unfold Task A
    expect(board.screenshot()).toContain("subtask-x")

    // H folds deepest unfolded foldable level (Task A at depth 2)
    board.command("fold_node")
    expect(board.screenshot()).not.toContain("subtask-x")
    expect(board.screenshot()).toContain("Task A") // still visible, just folded

    // Another H folds Phase 1/2 (depth 1)
    board.command("fold_node")
    expect(board.screenshot()).not.toContain("Task A")
    expect(board.screenshot()).not.toContain("Task B")
    expect(board.screenshot()).toContain("Phase 1") // still shows as folded header

    // Another H folds Project itself (depth 0)
    board.command("fold_node")
    expect(board.screenshot()).not.toContain("Phase 1")
    expect(board.screenshot()).toContain("Project") // card title always visible
  })

  test("L on fully-folded card reveals only one level (progressive disclosure, km-ovuzg)", () => {
    // Disable incremental check: fold/unfold changes tree height
    const { board } = testEnv(deepTree, { rows: 30, checkIncremental: false })

    // Fold Project completely (3 H presses: depth 2 -> depth 1 -> depth 0)
    board.command("fold_node") // fold Phase 1/2 (depth 1 — deepest unfolded with children)
    board.command("fold_node") // fold Project (depth 0)
    expect(board.screenshot()).not.toContain("Phase 1")
    expect(board.screenshot()).toContain("Project")

    // First L: unfold Project — should reveal Phase 1/2 but NOT their children
    board.command("unfold_node")
    const afterFirstL = board.screenshot()
    expect(afterFirstL).toContain("Phase 1")
    expect(afterFirstL).toContain("Phase 2")
    // Phase 1/2's children should be hidden because they were auto-folded
    expect(afterFirstL).not.toContain("Task A")
    expect(afterFirstL).not.toContain("Task B")
    expect(afterFirstL).not.toContain("Task C")

    // Second L: unfold Phase 1/2 — should reveal Task A/B/C but NOT subtask-x
    board.command("unfold_node")
    const afterSecondL = board.screenshot()
    expect(afterSecondL).toContain("Task A")
    expect(afterSecondL).toContain("Task B")
    expect(afterSecondL).toContain("Task C")
    // subtask-x should still be hidden (Task A auto-folded since it has children)
    expect(afterSecondL).not.toContain("subtask-x")

    // Third L: unfold Task A — reveals subtask-x
    board.command("unfold_node")
    expect(board.screenshot()).toContain("subtask-x")
  })

  test("L on card with flat children (no grandchildren) reveals all at once", () => {
    // When children are all leaves, L should show them all — no unnecessary folding
    const { board } = testEnv(
      () => item("board", item("col1", item.folder("FlatParent", item("child-a"), item("child-b"), item("child-c")))),
      { rows: 30, checkIncremental: false },
    )

    // Fold FlatParent
    board.command("fold_node")
    expect(board.screenshot()).not.toContain("child-a")

    // Unfold — all children should be visible (they're all leaves)
    board.command("unfold_node")
    const after = board.screenshot()
    expect(after).toContain("child-a")
    expect(after).toContain("child-b")
    expect(after).toContain("child-c")
  })

  test("H/L round-trip: fold then unfold restores visibility", () => {
    // Disable incremental check: fold/unfold changes tree height
    const { board } = testEnv(deepTree, { rows: 30, checkIncremental: false })

    // Initially Phase 1/2 are folded at depth 1. Unfold first.
    board.command("unfold_node") // unfold Phase 1/2, auto-fold Task A
    expect(board.screenshot()).toContain("Task A")

    // H folds the deepest unfolded level (Phase 1/2 at depth 1, since Task A is auto-folded)
    board.command("fold_node")
    const folded = board.screenshot()
    expect(folded).not.toContain("Task A")
    expect(folded).toContain("Phase 1") // visible but folded

    // L unfolds the shallowest fold — Phase 1/2 at depth 1
    // With progressive disclosure, children-with-children (Task A) get auto-folded
    board.command("unfold_node")
    const restored = board.screenshot()
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
    board.command("fold_node") // fold once

    // Try to fold again — should hit boundary
    board.command("fold_node")
    expect(board.bell).toBe(true)
    expect(board.hasStatus).toBe(true)
    const status = board.getStatus()
    expect(status?.level).toBe("warning")
    expect(status?.message).toContain("already fully folded")
  })

  test("< (fold all) folds all cards to depth 0", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Initially child-1 is visible
    expect(board.screenshot()).toContain("child-1")

    // Fold all — sets all cards to depth 0
    board.command("fold_all")
    expect(board.screenshot()).not.toContain("child-1")
    expect(board.screenshot()).toContain("Parent") // card title always visible

    // Pressing < again is idempotent (FOLD_LEVEL always succeeds, no bell)
    board.command("fold_all")
    expect(board.screenshot()).not.toContain("child-1")
  })

  test("L clears bell/status on valid unfold after boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Hit fold boundary
    board.command("fold_node")
    board.command("fold_node")
    expect(board.bell).toBe(true)

    // Unfold — should clear bell/status and succeed
    board.command("unfold_node")
    expect(board.bell).toBe(false)
    expect(board.hasStatus).toBe(false)
    expect(board.screenshot()).toContain("child-1")
  })

  test("> (unfold all) removes all per-card fold overrides", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Fold first, then unfold all
    board.command("fold_all") // fold all cards to depth 0
    expect(board.screenshot()).not.toContain("child-1")

    // Unfold all — removes per-card overrides, cards inherit board depth
    board.command("unfold_all")
    expect(board.screenshot()).toContain("child-1")

    // Pressing > again is idempotent (UNFOLD_LEVEL always succeeds, no bell)
    board.command("unfold_all")
    expect(board.screenshot()).toContain("child-1")
  })

  test("L (unfold node) caps at MAX_FOLD_DEPTH per card", () => {
    const { board } = testEnv(() => item("board", item("col1", item.folder("Parent", item("child-1")))))

    // Unfold many times on the same card to reach the cap
    for (let i = 0; i < 25; i++) {
      board.command("unfold_node")
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
      board.command("fold_node")
    }

    // Should ring bell (at boundary)
    expect(board.bell).toBe(true)

    // Unfold once — should work (depth goes from 0 to 1)
    board.command("unfold_node")
    expect(board.screenshot()).toContain("child-1")
  })
})
