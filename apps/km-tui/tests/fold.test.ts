/**
 * Fold operation tests.
 *
 * Tests fold/unfold behavior, border integrity through fold operations,
 * ANSI diff replay correctness, and fold count color consistency.
 *
 * Covers:
 * - z-prefix chord fold operations (zM, zc, zo, za) and Z (unfold all)
 * - Border integrity after fold/unfold and outline depth changes
 * - ANSI diff replay correctness after fold operations
 * - Incremental vs fresh buffer comparison after fold
 * - Fold count color (gray, not dim, not bold) across outline depths
 * - Column header count color with ownColor
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { VirtualTerminal, outputPhase } from "inkx/toolbelt"

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
    board.press("z").press("M")

    expect(board.screenshot()).not.toContain("child-1")
    expect(board.screenshot()).not.toContain("child-2")
    // Parent title should still be readable
    expect(board.screenshot()).toContain("Parent")
  })

  test("zc folds a card, Z should unfold it", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Fold via zc chord
    board.press("z").press("c")

    // Children should be hidden
    expect(board.screenshot()).not.toContain("child-1")

    // Z (unfold all) should restore children
    board.press("Z")

    expect(board.screenshot()).toContain("child-1")
    expect(board.screenshot()).toContain("child-2")
  })

  test("za (toggle fold chord) folds current card and hides children", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    expect(board.screenshot()).toContain("child-1")

    // za chord → toggle_fold
    board.press("z").press("a")

    const folded = board.screenshot()
    expect(folded).not.toContain("child-1")
    expect(folded).not.toContain("child-2")
    expect(folded).toContain("Parent")
  })

  test("zo (unfold node chord) restores children after fold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")))),
    )

    // Fold with zc
    board.press("z").press("c")
    expect(board.screenshot()).not.toContain("child-1")

    // Unfold with zo
    board.press("z").press("o")

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

    // Fold both cards individually with zc
    board.press("z").press("c") // fold Processing
    board.press("j") // move to Review
    board.press("z").press("c") // fold Review

    expect(board.screenshot()).not.toContain("sub-a")
    expect(board.screenshot()).not.toContain("sub-c")

    // Z should unfold all
    board.press("Z")

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

// =============================================================================
// Fold border blank — buffer-level border assertions (km-tui.fold-border-blank)
// =============================================================================

describe("fold border blank — buffer-level assertions", () => {
  /**
   * Board with 4 cards in a single column — some with children, some without.
   * Tests that folding (via < or zc) preserves bottom borders of folded cards
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
      expect(
        between[i],
        `"${nodeText}" top border at col ${leftIdx + 1 + i} should be ─ but got "${between[i]}"`,
      ).toBe("\u2500")
    }
  }

  /**
   * Assert no stale content between two cards (no orphaned border chars or content
   * between one card's bottom border and the next card's top border).
   */
  function expectNoStaleBetweenCards(
    board: ReturnType<typeof testEnv>["board"],
    upperNode: string,
    lowerNode: string,
  ) {
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
    board.press("<").press("<")

    // After folding: all cards should have intact bottom borders
    expectBottomBorderIntact(board, "Parent-A")
    expectBottomBorderIntact(board, "Parent-B")
    expectTopBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Leaf-C")
  })

  test("decrease outline depth preserves borders between adjacent cards", () => {
    const { board } = multiCardBoard()

    // Fold once
    board.press("<")
    expectBottomBorderIntact(board, "Parent-A")
    expectTopBorderIntact(board, "Parent-B")

    // Fold again
    board.press("<")
    expectBottomBorderIntact(board, "Parent-A")
    expectTopBorderIntact(board, "Parent-B")
    expectBottomBorderIntact(board, "Leaf-C")
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(board, "Parent-B", "Leaf-C")
  })

  test("individual fold (zc) preserves border of card below", () => {
    const { board } = multiCardBoard()

    // Fold Parent-A via zc chord
    board.press("z").press("c")

    // Parent-A bottom border should be intact
    expectBottomBorderIntact(board, "Parent-A")
    // Parent-B top border should be intact (card below the folded one)
    expectTopBorderIntact(board, "Parent-B")
    // No stale content between Parent-A and Parent-B
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
  })

  test("toggle fold (za) preserves borders of folded card and neighbors", () => {
    const { board } = multiCardBoard()

    // Navigate to Parent-B then toggle fold
    board.press("j")
    board.press("z").press("a")

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

    // Fold all children via < < then restore via > >
    board.press("<").press("<")
    board.press(">").press(">")

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
    board.press("<").press("<")

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
    board.press("z").press("c")
    expectBottomBorderIntact(board, "Parent-A")

    // Step 2: move down to Parent-B, fold it
    board.press("j")
    board.press("z").press("c")
    expectBottomBorderIntact(board, "Parent-B")

    // Step 3: move down to Leaf-C — its borders should be intact
    board.press("j")
    expectTopBorderIntact(board, "Leaf-C")
    expectBottomBorderIntact(board, "Leaf-C")

    // Step 4: move down to Parent-D, fold it
    board.press("j")
    board.press("z").press("c")
    expectBottomBorderIntact(board, "Parent-D")

    // Step 5: unfold all (Z), verify everything is restored
    board.press("Z")
    expectBottomBorderIntact(board, "Parent-A")
    expectBottomBorderIntact(board, "Parent-B")
    expectBottomBorderIntact(board, "Parent-D")
    // No stale between cards
    expectNoStaleBetweenCards(board, "Parent-A", "Parent-B")
    expectNoStaleBetweenCards(board, "Parent-B", "Leaf-C")
    expectNoStaleBetweenCards(board, "Leaf-C", "Parent-D")
  })

  test("cell-level border check: bottom border cells are not blank after fold", () => {
    const { board } = multiCardBoard()

    // Fold via < <
    board.press("<").press("<")

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
    // Cards with children overflow a 20-row viewport at maxOutlineDepth=2.
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
      if (press > 0) board.press("<")
      const text = board.screenshot()
      const top = countTopBorders(text)
      const bottom = countBottomBorders(text)
      // Top can exceed bottom by 1 (partially visible card at viewport edge)
      expect(Math.abs(top - bottom), `After ${press} '<' presses: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
    }

    for (let press = 0; press < 4; press++) {
      board.press(">")
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

    board.press("j").press("j").press("j").press("j")
    board.press("<").press("<")

    const text = board.screenshot()
    const top = countTopBorders(text)
    const bottom = countBottomBorders(text)
    expect(Math.abs(top - bottom), `scrolled + folded: top=${top} bottom=${bottom}`).toBeLessThanOrEqual(1)
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
    return { x: countX, y: row, char: cell.char, fg: cell.fg, bg: cell.bg, attrs: cell.attrs as Record<string, unknown> }
  }

  describe("nested node with children (depth 1)", () => {
    function createBoard() {
      return testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item(
                "parent-card",
                item("Essential Commands", item("cmd1"), item("cmd2"), item("cmd3")),
              ),
            ),
          ),
        { columns: 80, rows: 24 },
      )
    }

    test("count is gray, not dim, when children visible (outline depth 2)", () => {
      const { board } = createBoard()

      // At default outline depth 2: Essential Commands at depth 1
      // depth(1) < 2 => children visible
      const ecRow = board.screen.findRow("Essential Commands")
      expect(ecRow, "Essential Commands row").toBeGreaterThanOrEqual(0)

      const countCell = findCountCell(board, ecRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should be gray (fg=8), NOT dim, NOT bold
      expect(countCell!.fg, "fg=8 (gray)").toBe(8)
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
      expect(countCell!.attrs.bold, "not bold when children visible").toBeFalsy()
    })

    test("count is gray, not bold, when children hidden (outline depth 1)", () => {
      const { board } = createBoard()
      board.press("<") // decrease to depth 1

      // At outline depth 1: Essential Commands at depth 1
      // depth(1) < 1 is FALSE => children hidden
      const ecRow = board.screen.findRow("Essential Commands")
      expect(ecRow, "Essential Commands row").toBeGreaterThanOrEqual(0)

      const countCell = findCountCell(board, ecRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should be gray (fg=8), NOT dim, NOT bold (bold gray = white)
      expect(countCell!.fg, "fg=8 (gray)").toBe(8)
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
      expect(countCell!.attrs.bold, "not bold (bold gray = white)").toBeFalsy()
    })

    test("count is never dimmed regardless of outline depth", () => {
      const { board } = createBoard()

      // Depth 2: children visible
      const ecRow2 = board.screen.findRow("Essential Commands")
      const cell2 = findCountCell(board, ecRow2)
      expect(cell2).not.toBeNull()

      // Depth 1: children hidden
      board.press("<")
      const ecRow1 = board.screen.findRow("Essential Commands")
      const cell1 = findCountCell(board, ecRow1)
      expect(cell1).not.toBeNull()

      // Neither state should be dimmed
      expect(cell1!.attrs.dim, "not dim at depth 1").toBeFalsy()
      expect(cell2!.attrs.dim, "not dim at depth 2").toBeFalsy()

      // Both should have gray fg
      expect(cell1!.fg, "gray at depth 1").toBe(8)
      expect(cell2!.fg, "gray at depth 2").toBe(8)

      // Never bold (bold gray = bright white on terminals)
      expect(cell1!.attrs.bold, "not bold at depth 1").toBeFalsy()
      expect(cell2!.attrs.bold, "not bold at depth 2").toBeFalsy()
    })
  })

  describe("column header count with ownColor", () => {
    function createColorBoard() {
      // Two columns: col-colored (cyan) and col-other.
      // Navigate cursor to col-other so col-colored is unselected.
      const nodes = item(
        "board",
        item("col-colored", item("c1"), item("c2"), item("c3")),
        item("col-other", item("other-task")),
      )
      // Set color on the column node
      nodes.find((n) => n.id === "col-colored")!.rules = { color: "cyan" } as any
      return testEnv(() => nodes, { columns: 80, rows: 24 })
    }

    test("column header count is gray, not ownColor, when column unselected", () => {
      const { board } = createColorBoard()

      // Move cursor to col-other so col-colored is unselected
      board.press("l")

      // Find the header row containing "col-colored"
      const headerRow = board.screen.findRow("col-colored")
      expect(headerRow, "header row found").toBeGreaterThanOrEqual(0)

      // Find the "3" count in the first column (left half of screen).
      // With 80 cols and 2 columns, col-colored is in the first ~40 chars.
      const rowText = board.screen.row(headerRow)
      const halfWidth = Math.floor(80 / 2)
      const leftHalf = rowText.slice(0, halfWidth)
      const countMatch = leftHalf.match(/(\d+)\s*$/)
      expect(countMatch, "count digit found in col-colored header").not.toBeNull()
      const countX = countMatch!.index!

      const cell = board.screen.cell(countX, headerRow)
      expect(cell.char).toBe("3")

      // Count should be gray (fg=8), not cyan (ownColor)
      expect(cell.fg, "fg=8 (gray), not ownColor").toBe(8)
      expect(cell.attrs.dim, "not dim").toBeFalsy()
    })
  })
})
