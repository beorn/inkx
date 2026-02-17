/**
 * Regression: cursor right causes card border overflow
 *
 * Guards against moving cursor right to the next column causing the previous
 * column's cards to render incorrectly with text overflowing borders.
 *
 * Run with real vault:
 *   TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/cursor-border-overflow.test.ts
 */
import { describe, test, expect } from "vitest"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "inkx"
import { createBoardDriver } from "../src/driver.ts"
import { testEnv, item } from "./helpers/board-test.ts"

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    const children = getChildren(repo.db, node.id)
    if (children.length > 0) return node.id
  }
  throw new Error("No suitable board root found in vault")
}

// ─── Synthetic test (always runs) ───────────────────────────────────────────

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
      board.press("l")
      assertCardBordersClean(board.screenshot(), `${cols} right(1)`)

      board.press("l")
      assertCardBordersClean(board.screenshot(), `${cols} right(2)`)

      board.press("h")
      assertCardBordersClean(board.screenshot(), `${cols} left(1)`)

      board.press("h")
      assertCardBordersClean(board.screenshot(), `${cols} left(2)`)

      // Down then right (different scroll positions)
      board.press("j")
      board.press("l")
      assertCardBordersClean(board.screenshot(), `${cols} down+right`)

      board.press("j")
      board.press("h")
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
    board.press("l")
    assertCardBordersClean(board.screenshot(), "deep right(1)")

    board.press("l")
    assertCardBordersClean(board.screenshot(), "deep right(2)")

    board.press("l")
    assertCardBordersClean(board.screenshot(), "deep right(3)")
  })
})

// ─── Real vault test with withDiagnostics ───────────────────────────────────

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
