/**
 * Regression test: border rendering after closing the detail pane.
 *
 * Bug: After closing the detail pane, section card borders in the right
 * column(s) render inconsistently — missing or broken round border chars.
 * The left column retains proper borders but others lose them.
 *
 * Exact repro: Space (open detail) → h (move column) → Space (close detail)
 * INKX_STRICT=1 crashes with this sequence on the user's real vault.
 *
 * Root cause hypothesis: When the detail pane closes, boardWidth expands
 * from ~60% back to 100%, triggering column width recalculation. The
 * re-render may not correctly restore border characters on all columns,
 * especially in incremental rendering mode.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "inkx"
import { createBoardDriver } from "../src/driver.ts"

/** Check if a character is a round box-drawing border character. */
function isRoundBorderChar(c: string): boolean {
  return "╭╮╯╰│─".includes(c)
}

/**
 * Verify that a node has round border characters on its left side.
 * The nodeBox is the content area — borders are 1 cell outside it.
 */
function expectLeftBorder(board: ReturnType<typeof testEnv>["board"], nodeId: string, label: string) {
  const box = board.screen.nodeBox(nodeId)
  expect(box, `${label}: node "${nodeId}" should be visible`).not.toBeNull()
  if (!box) return

  // Border is 1 cell to the left of the content box
  const leftX = box.x - 1
  if (leftX < 0) return

  const cell = board.screen.cell(leftX, box.y)
  expect(
    isRoundBorderChar(cell.char),
    `${label}: node "${nodeId}" should have round left border at (${leftX},${box.y}), got '${cell.char}'`,
  ).toBe(true)
}

/**
 * Collect border status for all given node IDs.
 * Returns an object mapping nodeId -> whether left border is intact.
 */
function checkBorders(board: ReturnType<typeof testEnv>["board"], nodeIds: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const id of nodeIds) {
    const box = board.screen.nodeBox(id)
    if (!box) {
      result[id] = false
      continue
    }
    const leftX = box.x - 1
    if (leftX < 0) {
      result[id] = false
      continue
    }
    const cell = board.screen.cell(leftX, box.y)
    result[id] = isRoundBorderChar(cell.char)
  }
  return result
}

describe("border rendering after detail pane close", () => {
  test("all columns retain borders after closing detail pane", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("Section A", item("task1"), item("task2"), item("task3"))),
          item("col2", item.section("Section B", item("task4"), item("task5"), item("task6"))),
          item("col3", item.section("Section C", item("task7"), item("task8"))),
        ),
      { columns: 120, rows: 31 },
    )

    const allNodes = [
      "Section A",
      "task1",
      "task2",
      "task3",
      "Section B",
      "task4",
      "task5",
      "task6",
      "Section C",
      "task7",
      "task8",
    ]

    // --- Phase 1: Verify borders are correct initially ---
    const beforeBorders = checkBorders(board, allNodes)
    const visibleBefore = Object.entries(beforeBorders).filter(([, v]) => v)
    expect(
      visibleBefore.length,
      `Initial state: at least some nodes should have borders. Got: ${JSON.stringify(beforeBorders)}`,
    ).toBeGreaterThan(0)

    // Check all visible nodes have borders
    for (const [id, hasBorder] of Object.entries(beforeBorders)) {
      if (board.screen.nodeBox(id)) {
        expect(hasBorder, `Initial: "${id}" should have left border`).toBe(true)
      }
    }

    // --- Phase 2: Open detail pane (Space) ---
    board.press("D")

    // Detail pane should be open — board width shrinks, some nodes may move
    // We don't need to assert borders here, just that the state changed

    // --- Phase 3: Close detail pane (Space again) ---
    board.press("D")

    // --- Phase 4: Verify ALL columns still have proper borders ---
    const afterBorders = checkBorders(board, allNodes)

    // Every node that was visible before should still have its border
    for (const [id, hadBorder] of Object.entries(beforeBorders)) {
      if (!hadBorder) continue // skip nodes that weren't visible initially
      const box = board.screen.nodeBox(id)
      if (!box) continue // skip nodes not visible after (layout may have changed)

      expect(
        afterBorders[id],
        `After detail close: "${id}" lost its left border at col ${box.x - 1}. ` +
          `Cell char: '${board.screen.cell(box.x - 1, box.y).char}'`,
      ).toBe(true)
    }
  })

  test("borders intact after detail pane open + column nav + close (exact repro)", () => {
    // Exact user reproduction: Space (open) → h (move column) → Space (close)
    // This triggers INKX_STRICT crash — incremental vs fresh render mismatch
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("Section A", item("task1"), item("task2"), item("task3"))),
          item("col2", item.section("Section B", item("task4"), item("task5"), item("task6"))),
          item("col3", item.section("Section C", item("task7"), item("task8"))),
        ),
      { columns: 120, rows: 31 },
    )

    const allNodes = [
      "Section A",
      "task1",
      "task2",
      "task3",
      "Section B",
      "task4",
      "task5",
      "task6",
      "Section C",
      "task7",
      "task8",
    ]

    // Verify initial borders
    for (const id of allNodes) {
      if (board.screen.nodeBox(id)) {
        expectLeftBorder(board, id, "Initial")
      }
    }

    // Move to col2 first so h has somewhere to go
    board.press("l") // move to col2

    // Exact repro: open detail pane → navigate column → close detail pane
    board.press("D") // open detail pane
    board.press("h") // move column left (key step that triggers the bug)
    board.press("D") // close detail pane

    // All visible nodes must still have borders
    for (const id of allNodes) {
      const box = board.screen.nodeBox(id)
      if (!box) continue
      expectLeftBorder(board, id, "After Space→h→Space")
    }
  })

  test("borders intact after detail pane open + move right + close", () => {
    // Variant: Space → l → Space (move right instead of left)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("Section A", item("task1"), item("task2"))),
          item("col2", item.section("Section B", item("task3"), item("task4"))),
          item("col3", item.section("Section C", item("task5"), item("task6"))),
        ),
      { columns: 120, rows: 31 },
    )

    const allNodes = ["Section A", "task1", "task2", "Section B", "task3", "task4", "Section C", "task5", "task6"]

    board.press("D") // open detail pane
    board.press("l") // move column right
    board.press("D") // close detail pane

    for (const id of allNodes) {
      const box = board.screen.nodeBox(id)
      if (!box) continue
      expectLeftBorder(board, id, "After Space→l→Space")
    }
  })

  test("borders intact with many columns + detail pane + column nav", () => {
    // Many columns to trigger HorizontalVirtualList virtualization
    // When detail pane is open (40% width), fewer columns visible
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("c1", item.section("S1", item("t1a"), item("t1b"), item("t1c"))),
          item("c2", item.section("S2", item("t2a"), item("t2b"), item("t2c"))),
          item("c3", item.section("S3", item("t3a"), item("t3b"), item("t3c"))),
          item("c4", item.section("S4", item("t4a"), item("t4b"), item("t4c"))),
          item("c5", item.section("S5", item("t5a"), item("t5b"), item("t5c"))),
          item("c6", item.section("S6", item("t6a"), item("t6b"), item("t6c"))),
        ),
      { columns: 120, rows: 31 },
    )

    // Navigate to middle column
    board.press("l") // col2
    board.press("l") // col3

    // Exact repro: Space → h → Space
    board.press("D") // open detail pane (board shrinks to ~60%)
    board.press("h") // move column left
    board.press("D") // close detail pane (board expands back to 100%)

    // Check all visible borders
    const allNodes = [
      "S1",
      "t1a",
      "t1b",
      "t1c",
      "S2",
      "t2a",
      "t2b",
      "t2c",
      "S3",
      "t3a",
      "t3b",
      "t3c",
      "S4",
      "t4a",
      "t4b",
      "t4c",
      "S5",
      "t5a",
      "t5b",
      "t5c",
      "S6",
      "t6a",
      "t6b",
      "t6c",
    ]
    for (const id of allNodes) {
      const box = board.screen.nodeBox(id)
      if (!box) continue
      expectLeftBorder(board, id, "After Space→h→Space (6 cols)")
    }
  })

  test("borders correct after multiple detail pane toggles", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("Alpha", item("a1"), item("a2"))),
          item("col2", item.section("Beta", item("b1"), item("b2"))),
        ),
      { columns: 100, rows: 25 },
    )

    const nodes = ["Alpha", "a1", "a2", "Beta", "b1", "b2"]

    // Toggle detail pane open/close 3 times to stress-test incremental rendering
    for (let cycle = 1; cycle <= 3; cycle++) {
      board.press("D") // open
      board.press("D") // close

      // After each close cycle, verify borders
      for (const id of nodes) {
        const box = board.screen.nodeBox(id)
        if (!box) continue
        expectLeftBorder(board, id, `Cycle ${cycle}`)
      }
    }
  })

  test("right column borders are intact after detail pane close", () => {
    // Specifically targets the reported bug: right column borders break
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("left-col", item("L1"), item("L2"), item("L3")),
          item("right-col", item("R1"), item("R2"), item("R3")),
        ),
      { columns: 120, rows: 25 },
    )

    // Verify right column borders initially
    for (const id of ["R1", "R2", "R3"]) {
      expectLeftBorder(board, id, "Initial")
    }

    // Open then close detail pane
    board.press("D")
    board.press("D")

    // Right column borders must still be intact
    for (const id of ["R1", "R2", "R3"]) {
      expectLeftBorder(board, id, "After detail close")
    }

    // Also check left column for completeness
    for (const id of ["L1", "L2", "L3"]) {
      expectLeftBorder(board, id, "After detail close (left)")
    }
  })
})

/**
 * Real vault test: reproduces the bug with actual imported data.
 * The bug only manifests with real vault data (many columns, sections, content).
 *
 * Uses the asana import vault which has the exact board structure from the user's screenshot.
 */
function findBoardRoot(repo: Repo): string {
  const root = repo.getRepoRootNode()
  if (root) return root.id
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    const children = getChildren(repo.db, node.id)
    if (children.length > 0) return node.id
  }
  throw new Error("No suitable board root found")
}

import { resolve } from "path"
const ASANA_VAULT = resolve(__dirname, "../../../imports/asana")

describe.skipIf(!require("fs").existsSync(ASANA_VAULT + "/.km/state.db"))(
  "real vault: border after detail pane close",
  () => {
    test("Space→h→Space with incremental rendering", { timeout: 30_000 }, async () => {
      const repo = runGenerator(createRepo(ASANA_VAULT, { loadFiles: true }))
      const rootId = findBoardRoot(repo)

      // Navigate into 'stabell' board which has multiple columns
      const children = getChildren(repo.database, rootId)
      const stabell = children.find((c) => c.id === "stabell" || c.id.includes("stabell"))
      const boardRootId = stabell?.id ?? rootId

      const driver = withDiagnostics(
        createBoardDriver(repo, boardRootId, {
          columns: 120,
          rows: 31,
          incremental: true,
        }),
        {
          checkIncremental: true,
          checkStability: false,
          checkLayout: false, // inkx layout overflow bug — not what this test checks
          skipLines: [0, -1],
        },
      )

      // Move right to a non-first column
      await driver.cmd.right!()

      // Exact repro: Space → h → Space
      await driver.press("D") // open detail pane
      await driver.cmd.left!() // move column left (h)
      await driver.press("D") // close detail pane

      // If withDiagnostics didn't throw, incremental matches fresh
    })

    test("Space→l→Space with incremental rendering", { timeout: 30_000 }, async () => {
      const repo = runGenerator(createRepo(ASANA_VAULT, { loadFiles: true }))
      const rootId = findBoardRoot(repo)

      const children = getChildren(repo.database, rootId)
      const stabell = children.find((c) => c.id === "stabell" || c.id.includes("stabell"))
      const boardRootId = stabell?.id ?? rootId

      const driver = withDiagnostics(
        createBoardDriver(repo, boardRootId, {
          columns: 120,
          rows: 31,
          incremental: true,
        }),
        {
          checkIncremental: true,
          checkStability: false,
          checkLayout: false, // inkx layout overflow bug — not what this test checks
          skipLines: [0, -1],
        },
      )

      // Exact repro variant: Space → l → Space
      await driver.press("D") // open detail pane
      await driver.cmd.right!() // move column right (l)
      await driver.press("D") // close detail pane
    })
  },
)
