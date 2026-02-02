#!/usr/bin/env bun
/**
 * TUI Exploration Testing Script
 *
 * Comprehensive DOM + Buffer verification for km view TUI.
 * Used by /explore skill for automated bug hunting.
 *
 * Usage:
 *   bun scripts/explore-tui.ts [options]
 *
 * Options:
 *   --iterations <n>  Number of random iterations (default: 100)
 *   --seed <n>        Fixed seed for reproducibility
 *   --path <vault>    Use real vault instead of fixtures
 *   --verbose         Show every action
 *   --quiet           Only output issues (for CI)
 *   --json            Output results as JSON
 *
 * Exit codes:
 *   0 - No issues found
 *   1 - Issues found (bugs or errors)
 */

import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test"
import { testBoard } from "../apps/km-tui/tests/helpers/real-board"

// =============================================================================
// Seeded Random
// =============================================================================

class SeededRandom {
  private seed: number
  constructor(seed: number) {
    this.seed = seed
  }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }
  weighted<T>(items: { weight: number; value: T }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let r = this.next() * total
    for (const item of items) {
      r -= item.weight
      if (r <= 0) return item.value
    }
    return items[items.length - 1].value
  }
}

// =============================================================================
// Types
// =============================================================================

interface Issue {
  iteration: number
  action: string
  type: string
  expected?: string
  actual?: string
  detail?: string
}

interface State {
  cursorCount: number
  cursorText: string | null
  viewMode: string | null
  breadcrumb: string | null
  bell: boolean
  text: string
  inDialog: boolean
}

interface Board {
  press: (key: string) => Board
  q: (selector: string) => { count: () => number; textContent: () => string }
  screenshot: () => string
  bell: boolean
}

// =============================================================================
// State Extraction
// =============================================================================

function getState(board: Board): State {
  const text = board.screenshot()
  const cursor = board.q("[data-cursor]")
  const viewMatch = text.match(/(CARDS|LIST|COLUMNS|TABS) VIEW/)
  const breadcrumbMatch = text.match(/📁 \/ ([^\n]+)/)
  // Check for dialogs via DOM attribute (search, help, new-item, project-picker)
  const inDialog = board.q("[data-dialog]").count() > 0

  return {
    cursorCount: cursor.count(),
    cursorText: cursor.count() > 0 ? cursor.textContent().trim().slice(0, 40) : null,
    viewMode: viewMatch ? viewMatch[1] : null,
    breadcrumb: breadcrumbMatch ? breadcrumbMatch[1].trim() : null,
    bell: board.bell,
    text,
    inDialog,
  }
}

// =============================================================================
// Verification
// =============================================================================

function verifyDomInvariants(
  iteration: number,
  action: string,
  state: State,
  issues: Issue[]
): void {
  // Check cursor count (should be exactly 1, except in dialogs)
  if (!state.inDialog) {
    if (state.cursorCount === 0) {
      issues.push({
        iteration,
        action,
        type: "missing-cursor",
        detail: "No [data-cursor] element found",
      })
    } else if (state.cursorCount > 1) {
      issues.push({
        iteration,
        action,
        type: "multiple-cursors",
        expected: "1",
        actual: String(state.cursorCount),
      })
    }
  }

  // Check view mode indicator exists
  if (!state.viewMode) {
    issues.push({
      iteration,
      action,
      type: "missing-view-mode",
      detail: "No view mode indicator in output",
    })
  }
}

function verifyBufferInvariants(
  iteration: number,
  action: string,
  state: State,
  issues: Issue[]
): void {
  // Non-empty output
  if (state.text.length === 0) {
    issues.push({ iteration, action, type: "empty-buffer" })
  }

  // No error strings
  if (state.text.includes("[object Object]")) {
    issues.push({ iteration, action, type: "object-object-in-buffer" })
  }
  if (/TypeError:|ReferenceError:|Error:/.test(state.text)) {
    issues.push({
      iteration,
      action,
      type: "error-in-buffer",
      detail: state.text.slice(0, 100),
    })
  }
}

function verifyExpectedOutcome(
  iteration: number,
  action: string,
  before: State,
  after: State,
  issues: Issue[]
): void {
  // Skip if bell rang (boundary condition)
  if (after.bell) return

  // Skip outcome checks when in a dialog (keys go to dialog, not board)
  if (after.inDialog) return

  switch (action) {
    case "j":
    case "k":
      // Cursor should move (text changes)
      if (before.cursorText === after.cursorText && before.cursorText !== null) {
        // Could be at boundary - check if we're at top/bottom
        // For now, just note it
      }
      break

    case "h":
    case "l":
      // Cursor should move to different column
      if (before.cursorText === after.cursorText && before.cursorText !== null) {
        // Could be at boundary
      }
      break

    case "v":
      // View mode MUST change (unless we were in a dialog before)
      if (!before.inDialog && before.viewMode === after.viewMode) {
        issues.push({
          iteration,
          action,
          type: "view-mode-unchanged",
          expected: "changed",
          actual: after.viewMode ?? "null",
        })
      }
      break

    case "o":
      // Breadcrumb should change (zoom in)
      // Only if cursor is on a folder
      break

    case "u":
      // Breadcrumb should change (zoom out)
      // Only if not at root
      break
  }
}

// =============================================================================
// Actions
// =============================================================================

const ACTIONS = [
  // Navigation (40%)
  { weight: 12, value: "j" },
  { weight: 12, value: "k" },
  { weight: 8, value: "h" },
  { weight: 8, value: "l" },
  { weight: 2, value: "g" },
  { weight: 2, value: "G" },
  // View modes (15%)
  { weight: 10, value: "v" },
  { weight: 3, value: "+" },
  { weight: 2, value: "-" },
  // Zoom/fold (15%)
  { weight: 8, value: "o" },
  { weight: 6, value: "u" },
  { weight: 1, value: "z" },
  // Dialogs/escape (15%)
  { weight: 5, value: "/" },
  { weight: 3, value: "?" },
  { weight: 7, value: "Escape" },
  // Selection (5%)
  { weight: 3, value: "A" },
  { weight: 2, value: "Space" },
]

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const iterations = parseInt(args.find((a, i) => args[i - 1] === "--iterations") ?? "100")
  const seedArg = args.find((a, i) => args[i - 1] === "--seed")
  const seed = seedArg ? parseInt(seedArg) : Date.now() % 100000
  const vaultPath = args.find((a, i) => args[i - 1] === "--path")
  const verbose = args.includes("--verbose")
  const quiet = args.includes("--quiet")
  const jsonOutput = args.includes("--json")

  const startTime = performance.now()

  if (!quiet && !jsonOutput) {
    console.log("=".repeat(60))
    console.log("TUI EXPLORATION TEST")
    console.log("=".repeat(60))
    console.log(`Seed: ${seed}`)
    console.log(`Iterations: ${iterations}`)
    console.log(`Vault: ${vaultPath ?? "(fixtures)"}`)
    console.log()
  }

  const rng = new SeededRandom(seed)
  const issues: Issue[] = []
  const actionCounts: Record<string, number> = {}
  const viewModes = new Set<string>()

  // Create board
  let board: Board
  if (vaultPath) {
    board = await testBoard(vaultPath, { rows: 24, columns: 80 })
  } else {
    const env = testEnv(
      () =>
        item.root(
          "board",
          item("Inbox", item("Task 1"), item("Task 2"), item("Task 3"), item("Task 4")),
          item(
            "Projects",
            item.folder("Alpha", item("Alpha 1"), item("Alpha 2")),
            item.folder("Beta", item("Beta 1"))
          ),
          item("Areas", item.folder("Health", item("Exercise"), item("Diet")), item.folder("Work", item("Report"))),
          item("Archive", item("Old 1"), item("Old 2"))
        ),
      { rows: 24, columns: 80 }
    )
    board = env.board
  }

  // Run iterations
  if (!quiet && !jsonOutput) {
    console.log(`Running ${iterations} iterations...\n`)
  }

  for (let i = 1; i <= iterations; i++) {
    const action = rng.weighted(ACTIONS)
    actionCounts[action] = (actionCounts[action] ?? 0) + 1

    const before = getState(board)
    board.press(action)
    const after = getState(board)

    if (after.viewMode) viewModes.add(after.viewMode)

    // Verify
    verifyDomInvariants(i, action, after, issues)
    verifyBufferInvariants(i, action, after, issues)
    verifyExpectedOutcome(i, action, before, after, issues)

    if (!quiet && !jsonOutput && (verbose || i % 25 === 0)) {
      const cursor = after.cursorText?.slice(0, 20) ?? "none"
      console.log(`  [${i}] ${action} -> cursor="${cursor}" bell=${after.bell}`)
    }
  }

  const duration = Math.round(performance.now() - startTime)

  // Group issues by type for reporting
  const byType: Record<string, Issue[]> = {}
  for (const issue of issues) {
    byType[issue.type] = byType[issue.type] ?? []
    byType[issue.type].push(issue)
  }

  // JSON output
  if (jsonOutput) {
    const result = {
      seed,
      iterations,
      duration,
      issueCount: issues.length,
      viewModesTested: [...viewModes],
      actionCounts,
      issuesByType: Object.fromEntries(
        Object.entries(byType).map(([type, typeIssues]) => [
          type,
          { count: typeIssues.length, examples: typeIssues.slice(0, 3) },
        ])
      ),
      reproduce: `bun scripts/explore-tui.ts --seed ${seed} --iterations ${iterations}`,
    }
    console.log(JSON.stringify(result, null, 2))
    process.exit(issues.length > 0 ? 1 : 0)
  }

  // Quiet output - just summary line
  if (quiet) {
    if (issues.length > 0) {
      const types = Object.keys(byType).join(", ")
      console.log(`FAIL: ${issues.length} issues (${types}) [seed=${seed}]`)
    } else {
      console.log(`OK: ${iterations} iterations in ${duration}ms [seed=${seed}]`)
    }
    process.exit(issues.length > 0 ? 1 : 0)
  }

  // Full report
  console.log("\n" + "=".repeat(60))
  console.log("RESULTS")
  console.log("=".repeat(60))

  console.log("\n## Summary\n")
  console.log(`| Metric | Value |`)
  console.log(`|--------|-------|`)
  console.log(`| Bugs found | ${issues.length} |`)
  console.log(`| View modes tested | ${viewModes.size}/4 (${[...viewModes].join(", ")}) |`)
  console.log(`| Duration | ${duration}ms |`)
  console.log(`| Seed | ${seed} |`)

  console.log("\n## Action Distribution\n")
  const sorted = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])
  for (const [act, count] of sorted) {
    console.log(`  ${act}: ${count}`)
  }

  if (issues.length > 0) {
    console.log(`\n## Issues Found (${issues.length})\n`)

    for (const [type, typeIssues] of Object.entries(byType)) {
      console.log(`### ${type} (${typeIssues.length} occurrences)`)
      // Show first 3 examples
      for (const issue of typeIssues.slice(0, 3)) {
        console.log(`  - iteration ${issue.iteration}, action="${issue.action}"`)
        if (issue.expected) console.log(`    expected: ${issue.expected}, actual: ${issue.actual}`)
        if (issue.detail) console.log(`    detail: ${issue.detail}`)
      }
      if (typeIssues.length > 3) {
        console.log(`  ... and ${typeIssues.length - 3} more`)
      }
      console.log()
    }

    console.log("## Reproduce")
    console.log(`bun scripts/explore-tui.ts --seed ${seed} --iterations ${iterations}`)
  } else {
    console.log("\n✅ No issues found!")
  }

  // Exit with error if issues found
  process.exit(issues.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
