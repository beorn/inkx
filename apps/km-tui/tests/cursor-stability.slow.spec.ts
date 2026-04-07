/**
 * Cursor Stability Invariant
 *
 * Moving the cursor should only change ANSI styling (cursor highlight),
 * not the underlying text content - unless scrolling happens.
 *
 * This catches cache invalidation bugs where content disappears.
 */
import { test, expect, describe } from "vitest"
import { createTestBoard, check } from "@km/tui/test"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "@silvery/test"
import { existsSync } from "fs"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"

/**
 * Extract board content (everything except breadcrumb and status bar),
 * with border characters replaced by spaces.
 *
 * Body cards use border when selected, padding otherwise — both occupy
 * the same space so text positions are stable. Replacing borders with
 * spaces lets us compare positional stability, not decoration.
 */
function getBoardContent(text: string): string {
  const lines = stripAnsi(text).split("\n")
  return lines
    .slice(1, -1)
    .map((line) => line.replace(/[╭╮╰╯│─]/g, " ").trimEnd())
    .join("\n")
}

/**
 * Check that board content is stable after cursor movement.
 * The breadcrumb and status bar can change, but columns/cards should not.
 */
function expectBoardContentStable(before: string, after: string, action: string) {
  const contentBefore = getBoardContent(before)
  const contentAfter = getBoardContent(after)

  // If scrolling happened, content can legitimately change
  const scrolled =
    contentAfter.includes("▲") !== contentBefore.includes("▲") ||
    contentAfter.includes("▼") !== contentBefore.includes("▼") ||
    contentAfter.includes("+") !== contentBefore.includes("+") // "+N more" indicator

  if (!scrolled) {
    expect(contentAfter, `Board content changed after ${action} (no scroll)`).toBe(contentBefore)
  }
}

describe("Cursor movement preserves text content", () => {
  test("synthetic: j/k movement preserves text", () => {
    const board = createTestBoard(["Col > Task A", "Col > Task B", "Col > Task C"])

    const initial = board.text

    board.press("j")
    expectBoardContentStable(initial, board.text, "j")

    board.press("k")
    expectBoardContentStable(initial, board.text, "k (back)")

    check.all(board)
  })

  test("synthetic: level changes preserve text", () => {
    const board = createTestBoard(["Projects > Task A", "Projects > Task B"])

    const initial = board.text

    // Up to column level
    board.press("k")
    expectBoardContentStable(initial, board.text, "k to column")

    // Up to board level
    board.press("k")
    expectBoardContentStable(initial, board.text, "k to board")

    // Back down
    board.press("j")
    expectBoardContentStable(initial, board.text, "j to column")

    board.press("j")
    expectBoardContentStable(initial, board.text, "j to card")
  })
})

// =============================================================================
// Stable visual classification (km-tui.stable-visual-classification)
//
// Node visual identity (body vs structural, bullet/checkbox presence) must be
// determined by DATA, not by cursor position. Moving the cursor expands a card
// (bypassing maxContentLines), which changes which children are visible — but
// it must NOT reclassify any child that was visible before the expansion.
//
// Regression: extractBody was called on the sliced visibleChildren instead of
// the full children list, so growing the slice could flip earlier non-outline
// children from "normal" to "body" (losing their bullet/checkbox) when an
// outline sibling became visible for the first time.
// =============================================================================

describe("stable visual classification under cursor movement", () => {
  test("card with body+structural mix: cursor expand does not reclassify siblings", () => {
    // Card "parent" has tasks (non-outline) followed by a heading section (outline).
    // With maxContentLines=3, only the first 3 children fit; the slice contains
    // no outline node → extractBody says items=all, body=[] → tasks get bullets.
    //
    // Cursor expansion (via J/block_nav_down) bumps maxChildren to 20, revealing
    // the outline "sec" item. If extractBody is recomputed on the larger slice,
    // t1/t2/t3 get reclassified as body (they are now BEFORE an outline item),
    // stripping their bullets. The fix uses a stable bodyIdSet computed from the
    // FULL children array so classification is data-derived, not slice-derived.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col", item("parent", item("t1"), item("t2"), item("t3"), item("t4"), item.file("sec", item("s1")))),
        ),
      { columns: 100, rows: 30 },
    )

    // Cursor starts on "parent" card. Card is not expanded: maxContentLines=3
    // slice contains [t1, t2, t3] only.
    const initialContent = getBoardContent(board.screenshot())

    // Descend into the card via J (block_nav_down) — cursor lands on t1.
    // Now cursorInDescendant=true, shouldExpand fires, maxChildren jumps to 20.
    board.command("block_nav_down")
    const afterDescend = getBoardContent(board.screenshot())

    // Return to the card level — cursor back on "parent".
    board.command("block_nav_up")
    const backOnCard = getBoardContent(board.screenshot())

    // Extract the leading characters before each task title — this captures
    // the bullet/checkbox glyph (or its absence if reclassified as body).
    const taskPrefix = (content: string, id: string): string | null => {
      for (const line of content.split("\n")) {
        const idx = line.indexOf(id)
        if (idx > 0) return line.slice(0, idx)
      }
      return null
    }

    // All three tasks must be visible initially and have a prefix.
    const initialPrefixes = {
      t1: taskPrefix(initialContent, "t1"),
      t2: taskPrefix(initialContent, "t2"),
      t3: taskPrefix(initialContent, "t3"),
    }
    expect(initialPrefixes.t1, "t1 visible before expansion").not.toBeNull()
    expect(initialPrefixes.t2, "t2 visible before expansion").not.toBeNull()
    expect(initialPrefixes.t3, "t3 visible before expansion").not.toBeNull()

    // After expansion, t1/t2/t3 must still have the SAME prefix.
    // With the bug: they lose their "□ " checkbox and reclassify as body (dim,
    // no marker). With the fix: prefix is data-derived and stays stable.
    const expandedPrefixes = {
      t1: taskPrefix(afterDescend, "t1"),
      t2: taskPrefix(afterDescend, "t2"),
      t3: taskPrefix(afterDescend, "t3"),
    }
    expect(expandedPrefixes.t1, "t1 prefix stable on expand").toBe(initialPrefixes.t1)
    expect(expandedPrefixes.t2, "t2 prefix stable on expand").toBe(initialPrefixes.t2)
    expect(expandedPrefixes.t3, "t3 prefix stable on expand").toBe(initialPrefixes.t3)

    // Round trip: returning to the original cursor position must produce
    // byte-identical output (no lingering classification flicker).
    expect(backOnCard, "returning cursor restores initial rendering").toBe(initialContent)
  })
})

// =============================================================================
// Cursor stability after property mutations (km-tui.td-cursor-jump)
//
// After setting date/priority/status, cursor must remain on the same card.
// Bug: column derivation mismatch caused index drift when virtual body columns
// or li-type root children shifted column indices. Fixed by nodeId-based cursor.
// =============================================================================

describe("cursor stability after property set (km-tui.td-cursor-jump)", () => {
  test("sp (priority) preserves cursor on same card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"), item.task("tD"))),
    )

    // Navigate to tB (col1, card index 1)
    board.command("cursor_down")
    board.expect("#tB[data-cursor]").toExist()

    // Set priority
    board.command("set_priority")

    // Cursor should still be on tB
    board.expect("#tB[data-cursor]").toExist()
  })

  test("sp preserves cursor when board has body content (virtual body column)", () => {
    const { board } = testEnv(() =>
      item.file(
        "myboard",
        item.p("description"),
        item.section("Todo", item.task("tA"), item.task("tB")),
        item.section("Done", item.task("tC")),
      ),
    )

    // Navigate past virtual body column to Todo column, then to tB
    board.command("cursor_right") // Move to Todo column
    board.command("cursor_down") // Move to tB (second card in Todo)
    board.expect("#tB[data-cursor]").toExist()

    // Set priority — triggers SELECT to re-resolve cursor position
    board.command("set_priority")

    // Cursor must still be on tB — NOT jumped to a different card
    board.expect("#tB[data-cursor]").toExist()
  })

  test("x (task status toggle) preserves cursor on same card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
    )

    // Navigate to second column, first card (tC)
    board.command("cursor_right")
    board.expect("#tC[data-cursor]").toExist()

    // Toggle task status
    board.command("toggle_task_done")

    // Cursor should still be on tC
    board.expect("#tC[data-cursor]").toExist()
  })

  test("x preserves cursor when board has body content", () => {
    const { board } = testEnv(() =>
      item.file(
        "myboard",
        item.p("intro"),
        item.section("Active", item.task("tA"), item.task("tB")),
        item.section("Done", item.task("tC")),
      ),
    )

    // Navigate to Active column (past body), then to tB
    board.command("cursor_right") // Past body column to Active
    board.command("cursor_down") // tB
    board.expect("#tB[data-cursor]").toExist()

    // Toggle task status
    board.command("toggle_task_done")

    // Cursor must still be on tB
    board.expect("#tB[data-cursor]").toExist()
  })

  test("undo/redo preserves cursor position", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
      { incremental: false }, // toast overlay causes STRICT style mismatch (pre-existing)
    )

    // Navigate to tB
    board.command("cursor_down")
    board.expect("#tB[data-cursor]").toExist()

    // Set priority (creates undo entry)
    board.command("set_priority")
    board.expect("#tB[data-cursor]").toExist()

    // Undo (Ctrl-z)
    board.press("Control-z")
    board.expect("#tB[data-cursor]").toExist()

    // Redo (Ctrl-y)
    board.press("Control-y")
    board.expect("#tB[data-cursor]").toExist()
  })
})

// =============================================================================
// Card borders after cursor navigation (cursor-border-overflow)
//
// Guards against moving cursor right to the next column causing the previous
// column's cards to render incorrectly with text overflowing borders.
// =============================================================================

function findCardBorderProblems(text: string): string[] {
  const lines = text.split("\n")
  const problems: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Check: text bleeding into a card border line
    // A border line (╰───╯ or ╭───╮) should only contain ─ and scroll indicators between corners.
    // Scroll indicators like "⋯ +8 ⋯" are legitimate content on borders.
    // If non-indicator alphanumeric text appears, it's a bug.
    const borderMatches = line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)
    for (const match of borderMatches) {
      const content = match[1]!
      // Remove scroll indicators (⋯ +N ⋯, ▲N, ▼N) before checking
      const withoutIndicators = content.replace(/[⋯▲▼]\s*\+?\d+\s*[⋯]?/g, "").replace(/[─━═\s]/g, "")
      if (/[a-zA-Z]/.test(withoutIndicators)) {
        problems.push(`line ${i}: text in border line: ${match[0].substring(0, 60)}`)
      }
    }
  }
  return problems
}

function assertCardBordersClean(text: string, label: string) {
  const problems = findCardBorderProblems(text)
  if (problems.length > 0) {
    throw new Error(`[${label}] Card border overflow:\n${problems.join("\n")}\n\nFull output:\n${text}`)
  }
}

function findBoardRoot(repo: Repo): string {
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.data?.is_repo_root) return node.id
  }
  for (const node of nodes) {
    const children = getChildren(repo.database, node.id)
    if (children.length > 0) return node.id
  }
  throw new Error("No suitable board root found in vault")
}

describe("card borders after cursor navigation (synthetic)", () => {
  for (const cols of [40, 60, 80, 100]) {
    test(`${cols}-col: borders clean after cursor right/left`, () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item("AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL"),
              item("example.com/path/to/some/resource/that/is/quite/long"),
              item("Short task 1"),
              item("Another medium-length task description here"),
            ),
            item("col2", item("Task in col2"), item("Second task in col2 with more detail")),
            item("col3", item("Col3 task with enough text to potentially cause issues"), item("Another col3 item")),
          ),
        { columns: cols, rows: 24 },
      )

      // Initial
      assertCardBordersClean(board.screenshot(), `${cols} initial`)

      // Navigate between columns
      board.command("cursor_right")
      assertCardBordersClean(board.screenshot(), `${cols} right(1)`)

      board.command("cursor_right")
      assertCardBordersClean(board.screenshot(), `${cols} right(2)`)

      board.command("cursor_left")
      assertCardBordersClean(board.screenshot(), `${cols} left(1)`)

      board.command("cursor_left")
      assertCardBordersClean(board.screenshot(), `${cols} left(2)`)

      // Down then right (different scroll positions)
      board.command("cursor_down")
      board.command("cursor_right")
      assertCardBordersClean(board.screenshot(), `${cols} down+right`)

      board.command("cursor_down")
      board.command("cursor_left")
      assertCardBordersClean(board.screenshot(), `${cols} down+left`)
    })
  }

  test("cursor right with deep card content at 80 cols", () => {
    // Match real vault pattern: cards with many children (deep outline)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "ref",
            item(
              "Health & Fitness",
              item("Runners World Heart Rate Training"),
              item("runnersworld.com/beginner/a208-12270/should-i-do-heart-rate-training"),
              item("The key is that you should be training in all of these zones at different intensities"),
              item("Zone 1"),
              item("Zone 2"),
              item("Zone 3"),
              item("Zone 4"),
              item("Zone 5"),
              item("Stretching"),
              item("Recommended"),
              item("Static stretch 3x30s 6 days per week"),
            ),
          ),
          item(
            "TaskNotes",
            item(
              "Tasks",
              item("T003: Arthur SSN Application"),
              item("T001: Guardianship for Arthur"),
              item("T005: HSA Setup"),
              item("T009: BMW DMV Issues"),
            ),
          ),
        ),
      { columns: 80, rows: 30 },
    )

    assertCardBordersClean(board.screenshot(), "deep initial")

    // Move right — this is where the bug manifests
    board.command("cursor_right")
    assertCardBordersClean(board.screenshot(), "deep right(1)")

    board.command("cursor_right")
    assertCardBordersClean(board.screenshot(), "deep right(2)")

    board.command("cursor_right")
    assertCardBordersClean(board.screenshot(), "deep right(3)")
  })
})

describe.skipIf(!process.env.TEST_VAULT)("card borders after cursor right (real vault)", () => {
  for (const cols of [40, 60, 80, 100, 120]) {
    test(`${cols}-col: borders clean after cursor right/left`, async () => {
      const vaultPath = process.env.TEST_VAULT!
      const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
      const rootId = findBoardRoot(repo)

      const baseDriver = createBoardDriver(repo, rootId, {
        columns: cols,
        rows: 30,
      })

      // Wrap with diagnostics to also catch incremental rendering mismatches
      const driver = withDiagnostics(baseDriver, {
        checkIncremental: true,
        checkStability: false, // cursor moves change content
        skipLines: [0, -1],
      })

      // Initial
      assertCardBordersClean(driver.text, `${cols} initial`)

      // Go up to card level with bordered cards
      await driver.cmd.up!()
      await driver.cmd.up!()
      assertCardBordersClean(driver.text, `${cols} at board level`)

      // Move right — the bug manifests here
      await driver.cmd.right!()
      assertCardBordersClean(driver.text, `${cols} right(1)`)

      await driver.cmd.right!()
      assertCardBordersClean(driver.text, `${cols} right(2)`)

      await driver.cmd.right!()
      assertCardBordersClean(driver.text, `${cols} right(3)`)

      // Move back left
      await driver.cmd.left!()
      assertCardBordersClean(driver.text, `${cols} left(1)`)

      await driver.cmd.left!()
      assertCardBordersClean(driver.text, `${cols} left(2)`)

      // Navigate down then right
      await driver.cmd.down!()
      await driver.cmd.down!()
      await driver.cmd.right!()
      assertCardBordersClean(driver.text, `${cols} down+right`)
    })
  }
})

// =============================================================================
// Cursor lost after j from column header with flat file items (km-3wk32)
//
// When at column header level, pressing `j` to enter a column with flat file
// items causes the cursor to jump to the root "/" instead of selecting the
// first card. This does NOT happen with columns containing subfolder items.
// =============================================================================

describe("cursor-lost-col-header-j (km-3wk32)", () => {
  test("j from column header selects first card (folder children - control)", () => {
    // Control case: columns with folder-type children work correctly
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a"))),
        item("col-tasks", item("task-1"), item("task-2")),
      ),
    )

    // Navigate to board level
    board.command("cursor_up").command("cursor_up")
    // Board -> first column header
    board.command("cursor_down")
    // Column header -> first card
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on sub-a (first card in first column)
    expect(cursor.textContent()).toContain("sub-a")
  })

  test("j from column header selects first card (file children)", () => {
    // Bug case: columns with file-type children
    const { board } = testEnv(() => item.root("board", item("col-with-files", item.file("file1"), item.file("file2"))))

    // Navigate up to board level
    board.command("cursor_up").command("cursor_up")
    // Board -> column header
    board.command("cursor_down")
    // Column header -> first card (should be file1)
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file1")
  })

  test("j from second column header selects first card (file children)", () => {
    // Test entering the second column specifically
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a"))),
        item("col-files", item.file("file1"), item.file("file2")),
      ),
    )

    // Navigate up to board level
    board.command("cursor_up").command("cursor_up")
    // Board -> first column header (col-folders)
    board.command("cursor_down")
    // Move right to second column header (col-files)
    board.command("cursor_right")
    // Column header -> first card (should be file1)
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file1")
  })

  test("j from column header with mixed file/folder children", () => {
    const { board } = testEnv(() => item.root("board", item("col-mixed", item.file("file-a"), item.folder("folder-b"))))

    // Navigate to board level
    board.command("cursor_up").command("cursor_up")
    // j -> column header
    board.command("cursor_down")
    // j -> first card (should be file-a)
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("file-a")
  })

  test("j from column header with paragraph body content", () => {
    // Edge case: column has only paragraph children (body content, no structural items)
    // This tests the extractBody filtering scenario
    const { board } = testEnv(() => item.root("board", item("col-body", item.p("para-1"), item.p("para-2"))))

    // Navigate up to board level
    board.command("cursor_up").command("cursor_up")
    // Board -> column header
    board.command("cursor_down")
    // Column header -> first card (should be para-1)
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("para-1")
  })

  test("j from board level with body content lands on first body card", () => {
    // Body content (paragraphs, code, quotes) before structural children
    // becomes a virtual "Description" column with individually navigable cards.
    // j from board level lands on the first body card directly.
    const { board } = testEnv(() =>
      item.root(
        "board",
        item.p("intro text"),
        item("col1", item.file("file1"), item.file("file2")),
        item("col2", item("task1")),
      ),
    )

    // Navigate up to board level (k from body card goes directly to board)
    board.command("cursor_up")
    // Board -> first body card in virtual Description column
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("intro text")

    // l moves to the first structural column
    board.command("cursor_right")
    const cursor2 = board.q("[data-cursor]")
    expect(cursor2.textContent()).toContain("file1")
  })

  test("j from board level with code block before columns lands on code card", () => {
    const { board } = testEnv(() => item.root("board", item.code("some code"), item("col1", item("task1"))))

    // k from body card goes directly to board level
    board.command("cursor_up")
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Body cards are navigable — lands directly on the code block card
    expect(cursor.textContent()).toContain("some code")
  })

  test("j from board level with quote before columns lands on quote card", () => {
    const { board } = testEnv(() => item.root("board", item.quote("a quote"), item("col1", item("task1"))))

    // k from body card goes directly to board level
    board.command("cursor_up")
    board.command("cursor_down")

    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("a quote")
  })

  test("round-trip navigation preserves cursor for file children columns", () => {
    const { board } = testEnv(() =>
      item.root("board", item("col1", item.file("f1"), item.file("f2")), item("col2", item.file("f3"))),
    )

    // Navigate down through col1
    board.command("cursor_down") // f1 -> f2 (next card)
    expect(board.q("[data-cursor]").textContent()).toContain("f2")

    // Navigate up: f2 -> f1 -> col header -> board (3 presses of k)
    board.command("cursor_up") // f2 -> f1 (prev sibling)
    board.command("cursor_up") // f1 -> column header (first card -> parent)
    board.command("cursor_up") // column header -> board

    // Navigate down: board -> column header -> first card
    board.command("cursor_down") // board -> column header
    board.command("cursor_down") // column header -> first card
    // Should be on f1 (first card in col1)
    expect(board.q("[data-cursor]").textContent()).toContain("f1")
  })
})
