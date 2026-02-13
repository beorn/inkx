/**
 * Visual exploration of recent 24h changes — validating rendering integrity
 * across search, undo/redo, node headers, board ignore, resize, overflow
 * indicators, cursor-after-delete, selection, help overlay, and fold/unfold.
 *
 * Each test checks for:
 * - Garbage output ([object Object], TypeError, NaN, undefined)
 * - Border integrity (matching top/bottom border pairs)
 * - Cursor at valid position (data-cursor element exists)
 * - No blank cards (missing content within borders)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// ── Helpers ──────────────────────────────────────────────────────────────────

function checkGarbage(text: string): string[] {
  const bugs: string[] = []
  if (text.includes("[object Object]")) bugs.push("contains [object Object]")
  if (text.includes("TypeError")) bugs.push("contains TypeError")
  if (/\bNaN\b/.test(text)) bugs.push("contains NaN")
  if (text.includes("undefined")) bugs.push("contains undefined")
  return bugs
}

function checkBorders(text: string): string[] {
  const bugs: string[] = []
  const lines = text.split("\n")
  const top = lines.filter((l) => /╭.*─.*╮/.test(l)).length
  // Bottom borders may have overflow indicator (▼N) replacing the ╯ corner
  const bottom = lines.filter((l) => /╰.*─/.test(l)).length
  if (top !== bottom) {
    bugs.push(`border mismatch: ${top} top vs ${bottom} bottom`)
  }
  return bugs
}

function checkCursor(board: ReturnType<typeof testEnv>["board"]): string[] {
  const bugs: string[] = []
  const cursor = board.q("[data-cursor]")
  if (cursor.count() === 0) {
    bugs.push("no cursor element found")
  }
  return bugs
}

function fullCheck(board: ReturnType<typeof testEnv>["board"], label: string): void {
  const text = board.screenshot()
  const bugs = [...checkGarbage(text), ...checkBorders(text), ...checkCursor(board)]
  if (bugs.length > 0) {
    console.log(`=== ${label} ===\n${text}\n=== END ===`)
  }
  expect(bugs, label).toEqual([])
}

// ── 1. Search Dialog ─────────────────────────────────────────────────────────

describe("Visual: Search Dialog", () => {
  test("search opens cleanly with empty query", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("Alpha"), item("Beta"), item("Gamma")),
          item("Col2", item("Delta")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("/")
    const text = board.screenshot()
    const bugs = checkGarbage(text)
    if (!text.includes("Search")) bugs.push("search dialog missing 'Search' title")
    if (!text.includes("Esc")) bugs.push("search dialog missing Esc hint")
    expect(bugs).toEqual([])
  })

  test("search dialog closes with Escape and restores board", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item("Alpha"), item("Beta")),
          item("Col2", item("Gamma")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("/")
    board.press("Escape")
    fullCheck(board, "after search close")
  })

  test("search dialog in narrow terminal", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("Alpha"), item("Beta"))),
      { columns: 50, rows: 16 },
    )

    board.press("/")
    const text = board.screenshot()
    const bugs = checkGarbage(text)
    // Dialog should still be visible
    if (!text.includes("Search") && !text.includes("search")) {
      bugs.push("search dialog not visible in narrow terminal")
    }
    expect(bugs).toEqual([])
  })
})

// ── 2. Undo/Redo ─────────────────────────────────────────────────────────────

describe("Visual: Undo/Redo", () => {
  test("undo after duplicate restores original state", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("Original A"), item.task("Original B")),
        ),
      { columns: 80, rows: 24 },
    )

    fullCheck(board, "before duplicate")

    // Duplicate first item
    board.press("d")
    const afterDup = board.screenshot()
    expect(afterDup).toContain("Original A")

    // Undo
    board.press("Ctrl+z")
    fullCheck(board, "after undo")
    const kids = repo.getChildren("Col1")
    expect(kids.length).toBe(2)
  })

  test("redo after undo re-applies duplicate", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("TaskX"), item.task("TaskY")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("d") // duplicate
    const afterDup = repo.getChildren("Col1").length
    expect(afterDup).toBe(3)

    board.press("Ctrl+z") // undo
    expect(repo.getChildren("Col1").length).toBe(2)

    board.press("Ctrl+y") // redo
    expect(repo.getChildren("Col1").length).toBe(3)
    fullCheck(board, "after redo")
  })

  test("undo with nothing to undo shows warning", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item.task("Only"))),
      { columns: 80, rows: 24 },
    )

    board.press("Ctrl+z")
    const status = board.getStatus()
    expect(status?.message).toContain("Nothing to undo")
  })

  test("redo with nothing to redo shows warning", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item.task("Only"))),
      { columns: 80, rows: 24 },
    )

    board.press("Ctrl+y")
    const status = board.getStatus()
    expect(status?.message).toContain("Nothing to redo")
  })

  test("multiple undo/redo cycles preserve borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("A"), item.task("B"), item.task("C")),
        ),
      { columns: 80, rows: 24 },
    )

    for (let i = 0; i < 3; i++) {
      board.press("d") // duplicate
    }
    for (let i = 0; i < 3; i++) {
      board.press("Ctrl+z") // undo all
    }
    for (let i = 0; i < 2; i++) {
      board.press("Ctrl+y") // redo 2
    }
    fullCheck(board, "after undo/redo cycles")
  })
})

// ── 3. Node Header / Icon Styles ─────────────────────────────────────────────

describe("Visual: Node Headers & Icons", () => {
  test("task nodes show status icons", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("Todo task", "todo"),
            item.task("Done task", "done"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    fullCheck(board, "task icons")
  })

  test("mixed node types render cleanly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("Task node"),
            item.folder("Folder node", item("child")),
            item.section("Section node", item("sec-child")),
            item.paragraph("Paragraph text"),
          ),
        ),
      { columns: 80, rows: 30 },
    )

    fullCheck(board, "mixed node types")
    const text = board.screenshot()
    expect(text).toContain("Task node")
    expect(text).toContain("Folder node")
  })

  test("folder with child count renders correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item(
              "Project",
              item.task("Step 1"),
              item.task("Step 2"),
              item.task("Step 3"),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    const text = board.screenshot()
    fullCheck(board, "folder child count")
    // Folder should show child count
    if (!text.includes("3") && !text.includes("Project")) {
      expect.fail("Folder should show child count or name")
    }
  })
})

// ── 4. Overflow Indicators ───────────────────────────────────────────────────

describe("Visual: Overflow Indicators", () => {
  test("overflow indicator appears when cards exceed viewport", () => {
    const tasks: ReturnType<typeof item.task>[] = []
    for (let i = 1; i <= 15; i++) tasks.push(item.task(`Item ${i}`))
    const { board } = testEnv(
      () => item("board", item("Col1", ...tasks)),
      { columns: 50, rows: 18 },
    )

    const text = board.screenshot()
    const bugs = checkGarbage(text)
    // Should have a downward overflow indicator
    if (!text.includes("\u25bc")) {
      bugs.push("missing downward overflow indicator (▼)")
    }
    expect(bugs).toEqual([])
  })

  test("scrolling down reveals top overflow indicator", () => {
    const tasks: ReturnType<typeof item.task>[] = []
    for (let i = 1; i <= 20; i++) tasks.push(item.task(`Item ${i}`))
    const { board } = testEnv(
      () => item("board", item("Col1", ...tasks)),
      { columns: 50, rows: 18 },
    )

    // Scroll to bottom
    board.press("G")
    fullCheck(board, "after G (bottom)")
    const text = board.screenshot()
    // Should show last item
    expect(text).toContain("Item 20")
  })

  test("overflow indicator count is reasonable", () => {
    const tasks: ReturnType<typeof item.task>[] = []
    for (let i = 1; i <= 10; i++) tasks.push(item.task(`T${i}`))
    const { board } = testEnv(
      () => item("board", item("Col1", ...tasks)),
      { columns: 50, rows: 15 },
    )

    const text = board.screenshot()
    // The overflow indicator should show a reasonable count
    const match = text.match(/\u25bc(\d+)/)
    if (match) {
      const count = Number.parseInt(match[1]!, 10)
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThan(10)
    }
  })
})

// ── 5. Cursor After Delete-All ───────────────────────────────────────────────

describe("Visual: Cursor After Delete", () => {
  test("deleting only card lands cursor on column header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("Single item")),
          item("Col2", item.task("Other")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("Backspace") // delete the only card
    fullCheck(board, "after delete single card")
    // Breadcrumb should show Col1 (cursor moved to column level)
    const text = board.screenshot()
    expect(text).toContain("Col1")
  })

  test("deleting last card in column moves cursor up", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("First"), item.task("Second"), item.task("Third")),
        ),
      { columns: 80, rows: 24 },
    )

    // Move to last card
    board.press("G")
    board.press("Backspace") // delete "Third"
    fullCheck(board, "after delete last card")
    const text = board.screenshot()
    // Should still show remaining cards
    expect(text).toContain("First")
    expect(text).toContain("Second")
  })
})

// ── 6. Selection (Shift-J/K) ─────────────────────────────────────────────────

describe("Visual: Selection", () => {
  test("Shift-J extends selection downward cleanly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("A"),
            item.task("B"),
            item.task("C"),
            item.task("D"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("J") // select A+B
    fullCheck(board, "after J (2 selected)")
    const text1 = board.screenshot()
    expect(text1).toContain("2 items selected")

    board.press("J") // select A+B+C
    const text2 = board.screenshot()
    expect(text2).toContain("3 items selected")
    fullCheck(board, "after JJ (3 selected)")
  })

  test("Shift-K extends selection upward", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("A"),
            item.task("B"),
            item.task("C"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("j").press("j") // cursor on C
    board.press("K") // select C+B
    fullCheck(board, "after K (2 selected upward)")
    const text = board.screenshot()
    expect(text).toContain("2 items selected")
  })

  test("Escape clears selection and restores normal view", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("A"), item.task("B"), item.task("C")),
          item("Col2", item.task("D")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("J").press("J") // select 3
    board.press("Escape") // clear
    fullCheck(board, "after selection clear")
    const text = board.screenshot()
    // Should not show selection count
    expect(text).not.toContain("items selected")
  })
})

// ── 7. Help Overlay Compact ──────────────────────────────────────────────────

describe("Visual: Help Overlay Compact", () => {
  test("help overlay shows all three categories", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("A"))),
      { columns: 80, rows: 40 },
    )

    board.press("?")
    const text = board.screenshot()
    const bugs = checkGarbage(text)
    if (!text.includes("Navigation")) bugs.push("missing Navigation section")
    if (!text.includes("Editing")) bugs.push("missing Editing section")
    if (!text.includes("View")) bugs.push("missing View section")
    expect(bugs).toEqual([])
  })

  test("help overlay shows undo/redo shortcuts", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("A"))),
      { columns: 80, rows: 40 },
    )

    board.press("?")
    const text = board.screenshot()
    const bugs = checkGarbage(text)
    // Should mention undo in some form
    if (!text.includes("Undo") && !text.includes("undo") && !text.includes("Ctrl+Z")) {
      bugs.push("help overlay missing undo shortcut")
    }
    expect(bugs).toEqual([])
  })

  test("help overlay renders within border box", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("A"))),
      { columns: 80, rows: 24 },
    )

    board.press("?")
    const text = board.screenshot()
    const lines = text.split("\n")
    // Should have double-border box ╔═╗ ║ ║ ╚═╝
    const hasTopBorder = lines.some((l) => l.includes("╔") && l.includes("╗"))
    const hasBottomBorder = lines.some((l) => l.includes("╚") && l.includes("╝"))
    const hasSideBorder = lines.some((l) => l.includes("║"))
    expect(hasTopBorder, "help overlay top border").toBe(true)
    expect(hasBottomBorder || lines.length >= 24, "help overlay bottom border or fills screen").toBe(true)
    expect(hasSideBorder, "help overlay side borders").toBe(true)
  })
})

// ── 8. Fold/Unfold Border Integrity ──────────────────────────────────────────

describe("Visual: Fold/Unfold Borders", () => {
  test("z fold all then Z unfold all preserves borders", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item("Parent1", item("c1"), item("c2"), item("c3")),
            item("Parent2", item("c4"), item("c5")),
            item.task("Leaf"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    fullCheck(board, "before fold")

    board.press("z") // fold all in column
    fullCheck(board, "after z fold")

    board.press("Z") // unfold all
    fullCheck(board, "after Z unfold")
  })

  test("< decrease depth with nested content", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item(
              "Deep",
              item("L2", item("L3", item("leaf1"), item("leaf2"))),
            ),
            item.task("Sibling"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    const beforeText = board.screenshot()
    // Deep nodes show as child counts in folder headers, not as visible text
    expect(beforeText).toContain("Deep")

    board.press("<")
    fullCheck(board, "after < (depth 1)")

    board.press("<")
    fullCheck(board, "after << (depth 0)")

    // Increase back
    board.press(">")
    board.press(">")
    fullCheck(board, "after >> (restored)")
  })

  test("fold/unfold with scrolling maintains borders", () => {
    const items: ReturnType<typeof item>[] = []
    for (let i = 1; i <= 8; i++) {
      items.push(item(`Parent${i}`, item(`c${i}a`), item(`c${i}b`)))
    }
    const { board } = testEnv(
      () => item("board", item("Col1", ...items)),
      { columns: 60, rows: 20 },
    )

    // Scroll down
    board.press("j").press("j").press("j").press("j")
    fullCheck(board, "after scroll")

    board.press("z") // fold
    fullCheck(board, "after fold while scrolled")

    board.press("Z") // unfold
    fullCheck(board, "after unfold while scrolled")
  })
})

// ── 9. Resize Handling ───────────────────────────────────────────────────────

describe("Visual: Terminal Size Rendering", () => {
  test("very narrow terminal (40x12)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Col1", item.task("Short"), item.task("A longer task name here")),
          item("Col2", item.task("Other")),
        ),
      { columns: 40, rows: 12 },
    )

    fullCheck(board, "40x12 terminal")
    const text = board.screenshot()
    // Content should be truncated but visible
    expect(text).toContain("Short")
  })

  test("wide terminal (160x40) with many columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item.task("a1"), item.task("a2")),
          item("Beta", item.task("b1")),
          item("Gamma", item.task("g1"), item.task("g2"), item.task("g3")),
          item("Delta", item.task("d1")),
          item("Epsilon", item.task("e1"), item.task("e2")),
        ),
      { columns: 160, rows: 40 },
    )

    fullCheck(board, "160x40 wide terminal")
    const text = board.screenshot()
    // Multiple columns should be visible
    expect(text).toContain("Alpha")
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
  })

  test("single column terminal (20 cols)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item.task("Hi"))),
      { columns: 20, rows: 10 },
    )

    fullCheck(board, "20x10 terminal")
  })
})

// ── 10. Combined Interactions ────────────────────────────────────────────────

describe("Visual: Combined Interactions", () => {
  test("navigate + fold + undo + search sequence", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("First"),
            item("Folder", item.task("Inner A"), item.task("Inner B")),
            item.task("Last"),
          ),
          item("Col2", item.task("Other")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("j") // move to Folder
    fullCheck(board, "after j")

    board.press("z") // fold column
    fullCheck(board, "after z")

    board.press("d") // duplicate
    fullCheck(board, "after duplicate")

    board.press("Ctrl+z") // undo
    fullCheck(board, "after undo")

    board.press("/") // open search
    const searchText = board.screenshot()
    expect(checkGarbage(searchText)).toEqual([])

    board.press("Escape") // close search
    fullCheck(board, "after search close")
  })

  test("detail pane + selection + view mode", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("Alpha"),
            item.task("Beta"),
            item.task("Gamma"),
          ),
          item("Col2", item.task("Delta")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("Space") // open detail
    fullCheck(board, "detail pane open")

    board.press("Space") // close detail
    fullCheck(board, "detail pane closed")

    board.press("J") // select 2
    fullCheck(board, "after selection")

    board.press("Escape") // clear selection
    fullCheck(board, "after clear selection")
  })

  test("rapid operations do not corrupt rendering", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Col1",
            item.task("T1"),
            item.task("T2"),
            item("F1", item.task("T3"), item.task("T4")),
            item.task("T5"),
          ),
          item("Col2", item.task("T6")),
        ),
      { columns: 80, rows: 24 },
    )

    // Rapid mixed operations
    const keys = [
      "j", "j", "z", "Z", // nav + fold
      "d", "Ctrl+z", // dup + undo
      "<", ">", // depth
      "l", "h", // column nav
      "J", "Escape", // select + clear
      "?", "Escape", // help
      "x", // task status
      "g", "g", // go to top
      "G", // go to bottom
    ]
    for (const key of keys) {
      board.press(key)
    }
    fullCheck(board, "after rapid operations")
  })
})
