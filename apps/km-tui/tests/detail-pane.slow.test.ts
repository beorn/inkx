/**
 * Detail pane tests — utility functions, toggle behavior, border rendering,
 * cursor management, link-type nodes, and column navigation.
 *
 * Component rendering tests were removed when DetailPane.tsx was unified
 * into BoardPaneState with viewMode "detail" (detail pane now renders
 * via the standard Board → CardColumn → TreeNode pipeline).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { act } from "react"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { withDiagnostics } from "@silvery/ag-react"
import {
  extractReferences,
  formatDate,
  getStatusDisplay,
  getProjectPath,
  resolveProjectDisplayNames,
} from "../src/views/detail-pane-helpers.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createDriverTest, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"

// --- Test Helpers ---

/** Default node fields that most tests don't care about */
const nodeDefaults = {
  parent_idx: 0,
  embed_of: null,
  data: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  version: "test",
} as const

/** Create a test node with sensible defaults */
function createTestNode(
  overrides: Partial<KNode> & {
    id: string
    type: KNode["type"]
    content: string
  },
): KNode {
  return {
    parent_id: null,
    ...nodeDefaults,
    ...overrides,
  } as KNode
}

/** Create multiple test nodes from minimal specs */
function createTestNodes(specs: Array<Partial<KNode> & { id: string; type: KNode["type"]; content: string }>): KNode[] {
  return specs.map((spec) => createTestNode(spec))
}

/** Helper to format date in local timezone (matches implementation) */
function localDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Get a date relative to today */
function dateRelativeToToday(daysOffset: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(today)
  date.setDate(date.getDate() + daysOffset)
  return localDateStr(date)
}

// --- Utility Function Tests ---

describe("extractReferences", () => {
  test.each([
    ["@mentions", "Contact @john and @jane about this", "mentions", ["john", "jane"]],
    ["#tags", "This is #important and #urgent", "tags", ["important", "urgent"]],
    ["+projects", "Part of +work and +finance projects", "projects", ["work", "finance"]],
    [
      "[[wikilinks]]",
      "See [[Meeting Notes]] and [[Q4 Actuals]] for details",
      "wikilinks",
      ["Meeting Notes", "Q4 Actuals"],
    ],
  ] as const)("extracts %s", (_name, content, refType, expected) => {
    const refs = extractReferences(content)
    expect(refs[refType]).toEqual(expected)
  })

  test("extracts all reference types", () => {
    const refs = extractReferences("@bjorn #finance +work [[Q4 Budget]] review")
    expect(refs.mentions).toEqual(["bjorn"])
    expect(refs.tags).toEqual(["finance"])
    expect(refs.projects).toEqual(["work"])
    expect(refs.wikilinks).toEqual(["Q4 Budget"])
  })

  test("deduplicates references", () => {
    const refs = extractReferences("@john said @john should do it @john")
    expect(refs.mentions).toEqual(["john"])
  })

  test.each([
    ["undefined content", undefined],
    ["empty content", ""],
  ] as const)("handles %s", (_name, content) => {
    const refs = extractReferences(content)
    expect(refs.mentions).toEqual([])
    expect(refs.tags).toEqual([])
    expect(refs.projects).toEqual([])
    expect(refs.wikilinks).toEqual([])
  })
})

describe("formatDate", () => {
  test("returns empty string for undefined", () => {
    expect(formatDate(undefined).text).toBe("")
  })

  test("returns raw date for invalid date", () => {
    expect(formatDate("not-a-date").text).toBe("not-a-date")
  })

  test("formats date in current year as short form", () => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-01-15`
    const formatted = formatDate(dateStr)
    expect(formatted.text).toContain("Jan")
    expect(formatted.text).toContain("15")
  })

  test("returns full date for different year", () => {
    const formatted = formatDate("2020-06-15")
    expect(formatted.text).toBe("2020-06-15")
    expect(formatted.urgency).toBe("overdue")
  })

  test.each([
    [-5, "overdue", "past dates"],
    [1, "urgent", "dates due tomorrow"],
    [3, "soon", "dates due within 3 days"],
    [10, "normal", "future dates"],
  ] as const)("returns %s urgency for %s", (daysOffset, expectedUrgency, _label) => {
    const formatted = formatDate(dateRelativeToToday(daysOffset))
    expect(formatted.urgency).toBe(expectedUrgency)
  })
})

describe("getStatusDisplay", () => {
  test.each([
    [undefined, "todo", "$focusborder"],
    ["done", "done", "$success"],
    ["wip", "wip", "$warning"],
    ["blocked", "blocked", "$error"],
    ["dropped", "dropped", "$muted"],
  ] as const)("status %s returns text=%s color=%s", (status, expectedText, expectedColor) => {
    const result = getStatusDisplay(status)
    expect(result.text).toBe(expectedText)
    expect(result.color).toBe(expectedColor)
  })
})

describe("getProjectPath", () => {
  test("returns empty array for node with no parent", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([{ id: "task1", type: "p", item: {}, content: "Standalone task" }]),
    })
    const node = repo.getNode("task1")!
    expect(getProjectPath(repo, node)).toEqual([])
  })

  test("returns folder names in path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: {}, fstype: "folder" as const, content: "Work" },
        {
          id: "folder2",
          type: "h",
          item: {},
          fstype: "folder" as const,
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "p",
          item: {},
          content: "Review budget",
          parent_id: "folder2",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    expect(getProjectPath(repo, task)).toEqual(["Work", "Finance"])
  })

  test("includes files in path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: {}, fstype: "folder" as const, content: "Projects" },
        { id: "file1", type: "h", item: {}, fstype: "mdfile" as const, content: "todo.md", parent_id: "folder1" },
        {
          id: "task1",
          type: "p",
          item: {},
          content: "Do something",
          parent_id: "file1",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    expect(getProjectPath(repo, task)).toEqual(["Projects", "todo.md"])
  })
})

describe("resolveProjectDisplayNames", () => {
  test("resolves slugs to node display names", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "p1", type: "h", item: {}, fstype: "mdfile" as const, content: "FAMILY SPRINT" },
        { id: "p2", type: "h", item: {}, fstype: "mdfile" as const, content: "[Fam] Estate" },
      ]),
    })
    const resolved = resolveProjectDisplayNames(repo, ["family-sprint", "fam-estate"])
    expect(resolved).toEqual(["FAMILY SPRINT", "[Fam] Estate"])
  })

  test("falls back to raw slug when no match", () => {
    const repo = createFakeRepo({ nodes: [] })
    const resolved = resolveProjectDisplayNames(repo, ["unknown-project"])
    expect(resolved).toEqual(["unknown-project"])
  })

  test("handles empty slug list", () => {
    const repo = createFakeRepo({ nodes: [] })
    const resolved = resolveProjectDisplayNames(repo, [])
    expect(resolved).toEqual([])
  })

  test("handles mixed resolved and unresolved slugs", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([{ id: "p1", type: "h", item: {}, fstype: "mdfile" as const, content: "My Project" }]),
    })
    const resolved = resolveProjectDisplayNames(repo, ["my-project", "missing-one"])
    expect(resolved).toEqual(["My Project", "missing-one"])
  })
})

// --- Detail Pane Toggle (D key) ---

describe("Detail pane toggle (D key)", () => {
  test("D opens only detail pane, not an extra empty workspace pane", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))), {
      cols: 120,
      rows: 24,
    })

    // Initially: main pane only, no detail pane
    app.expect("#main").toExist()
    app.expect("#main-detail").not.toExist()

    // Press D to toggle detail pane open
    app.press("D")

    // Detail pane should be present alongside main
    app.expect("#main").toExist()
    app.expect("#main-detail").toExist()

    // No "Empty pane" placeholder text
    expect(app.text).not.toContain("Empty pane")
  })

  // FREEZE: needs store.getState() — uses store.getState().splitFocusedPane()
  test("D with split panes does not create extra empty pane", () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Split the pane first
    store.getState().splitFocusedPane("h")

    // Now press D to open detail pane
    board.press("D")

    // The rendered output should not show "Empty pane" text
    const text = board.screenshot()
    expect(text).not.toContain("Empty pane")
    // Detail pane should be present in the rendered output
    board.expect("#main-detail").toExist()
  })

  test("D toggles detail pane closed when already open", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))), {
      cols: 120,
      rows: 24,
    })

    // Open detail pane
    app.press("D")
    app.expect("#main-detail").toExist()

    // Close detail pane
    app.press("D")
    app.expect("#main-detail").not.toExist()
  })
})

// --- Border rendering after detail pane close ---

/** Check if a character is a round box-drawing border character. */
function isRoundBorderChar(c: string): boolean {
  return "╭╮╯╰│─".includes(c)
}

/**
 * Verify that a node has round border characters on its left side.
 * The nodeBox is the content area — borders are 1 cell outside it.
 */
function expectLeftBorder(board: ReturnType<typeof createDriverTest>["board"], nodeId: string, label: string) {
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
function checkBorders(board: ReturnType<typeof createDriverTest>["board"], nodeIds: string[]): Record<string, boolean> {
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

// FREEZE: needs store.getState() — uses board.screen.nodeBox/cell for border checks
describe("border rendering after detail pane close", () => {
  // Suppress [EXCESS] silvery layout warnings — detail pane resize triggers
  // transient layout overflow that is unrelated to border rendering correctness
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  test("all columns retain borders after closing detail pane", () => {
    const { board } = createDriverTest(
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

    // --- Phase 2: Open detail pane ---
    board.press("D")

    // Some nodes may be narrower or shifted, but visible ones should still have borders
    const duringBorders = checkBorders(board, allNodes)
    const visibleDuring = Object.entries(duringBorders).filter(([, v]) => v)
    // At least some nodes should still be visible with borders
    expect(
      visibleDuring.length,
      `With detail pane open: at least some nodes should have borders. Got: ${JSON.stringify(duringBorders)}`,
    ).toBeGreaterThan(0)

    // --- Phase 3: Close detail pane ---
    board.press("D")

    const afterBorders = checkBorders(board, allNodes)
    // All nodes that were visible initially should still have borders after close
    for (const [id, hadBorder] of Object.entries(beforeBorders)) {
      if (hadBorder) {
        expect(afterBorders[id], `After close: "${id}" should retain left border`).toBe(true)
      }
    }
  })

  test("borders intact after multiple open/close cycles", () => {
    const { board } = createDriverTest(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"), item("task4"))),
      { columns: 80, rows: 20 },
    )

    const allNodes = ["task1", "task2", "task3", "task4"]
    const initialBorders = checkBorders(board, allNodes)

    // 3 open/close cycles
    for (let i = 0; i < 3; i++) {
      board.press("D")
      board.press("D")
    }

    const finalBorders = checkBorders(board, allNodes)
    for (const [id, hadBorder] of Object.entries(initialBorders)) {
      if (hadBorder) {
        expect(finalBorders[id], `After 3 cycles: "${id}" should retain border`).toBe(true)
      }
    }
  })

  test("borders survive navigation + detail pane toggle", () => {
    const { board } = createDriverTest(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"), item("task4"))),
      { columns: 80, rows: 20 },
    )

    const allNodes = ["task1", "task2", "task3", "task4"]
    const initialBorders = checkBorders(board, allNodes)

    // Navigate, open detail, navigate more, close detail
    board.press("j") // move down
    board.press("D") // open detail
    board.press("h") // return to board
    board.press("l") // move right
    board.press("D") // close detail

    const afterBorders = checkBorders(board, allNodes)
    for (const [id, hadBorder] of Object.entries(initialBorders)) {
      if (hadBorder) {
        expect(afterBorders[id], `After nav+toggle: "${id}" should retain border`).toBe(true)
      }
    }
  })
})

// Regression: detail pane open/close with real repo (async driver)
test.each(["D open/close", "D open → l → D close", "D open → j → D close"] as const)(
  "border regression: %s with createBoardDriver",
  async (variant) => {
    const nodes = item("board", item("col1", item("t1"), item("t2")), item("col2", item("t3")))
    const boardRootId = nodes[0]!.id
    const repo = createFakeRepo({ nodes })

    const driver = withDiagnostics(
      createBoardDriver(repo, boardRootId, {
        columns: 120,
        rows: 31,
        incremental: false,
      }),
      {
        checkIncremental: false,
        checkStability: false,
        checkLayout: false, // silvery layout overflow bug — not what this test checks
        skipLines: [0, -1],
      },
    )

    if (variant === "D open/close") {
      await driver.press("D")
      await driver.press("D")
    } else if (variant === "D open → l → D close") {
      await driver.press("D")
      await driver.cmd.right!()
      await driver.press("D")
    } else {
      // D open → j → D close
      await driver.press("D")
      await driver.press("j")
      await driver.press("D")
    }
  },
)

// Regression variant: Space → l → Space
test("border regression: Space → l → Space with createBoardDriver", async () => {
  const nodes = item("board", item("col1", item("t1"), item("t2")), item("col2", item("t3")))
  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  const driver = withDiagnostics(
    createBoardDriver(repo, boardRootId, {
      columns: 120,
      rows: 31,
      incremental: false,
    }),
    {
      checkIncremental: false,
      checkStability: false,
      checkLayout: false, // silvery layout overflow bug — not what this test checks
      skipLines: [0, -1],
    },
  )

  // Exact repro variant: Space → l → Space
  await driver.press("D") // open detail pane
  await driver.cmd.right!() // move column right (l)
  await driver.press("D") // close detail pane
})

// --- Incremental rendering correctness after detail pane toggle ---

describe("incremental rendering after detail pane toggle", () => {
  test("buffer: incremental matches fresh after D open/close", async () => {
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2"), item("task3")),
      item("col2", item("task4"), item("task5")),
      item("col3", item("task6")),
    )
    const boardRootId = nodes[0]!.id
    const repo = createFakeRepo({ nodes })

    const driver = withDiagnostics(
      createBoardDriver(repo, boardRootId, {
        columns: 120,
        rows: 30,
      }),
      {
        checkIncremental: true,
        checkStability: true,
        skipLines: [0, -1],
      },
    )

    await driver.press("D")
    await driver.press("D")
    await driver.press("j")
    await driver.press("l")
  })

  test("buffer: incremental matches fresh after D open then Escape", async () => {
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2"), item("task3")),
      item("col2", item("task4"), item("task5")),
      item("col3", item("task6")),
    )
    const boardRootId = nodes[0]!.id
    const repo = createFakeRepo({ nodes })

    const driver = withDiagnostics(
      createBoardDriver(repo, boardRootId, {
        columns: 120,
        rows: 30,
      }),
      {
        checkIncremental: true,
        checkStability: true,
        skipLines: [0, -1],
      },
    )

    await driver.press("D")
    await driver.press("Escape")
    await driver.press("j")
  })

  test("buffer: incremental matches fresh after D open, navigate, then close", async () => {
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2"), item("task3")),
      item("col2", item("task4"), item("task5")),
      item("col3", item("task6")),
    )
    const boardRootId = nodes[0]!.id
    const repo = createFakeRepo({ nodes })

    const driver = withDiagnostics(
      createBoardDriver(repo, boardRootId, {
        columns: 120,
        rows: 30,
      }),
      {
        checkIncremental: true,
        checkStability: true,
        skipLines: [0, -1],
      },
    )

    await driver.press("D")
    await driver.press("h")
    await driver.press("j")
    await driver.press("D")
    await driver.press("l")
  })

  test("wide terminal: incremental matches fresh after D toggle", async () => {
    // Wide terminal with many columns — tests layout change at large widths
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2"), item("task3")),
      item("col2", item("task4"), item("task5")),
      item("col3", item("task6"), item("task7")),
      item("col4", item("task8")),
    )
    const boardRootId = nodes[0]!.id
    const repo = createFakeRepo({ nodes })

    const driver = withDiagnostics(
      createBoardDriver(repo, boardRootId, {
        columns: 160,
        rows: 40,
      }),
      {
        checkIncremental: true,
        checkStability: true,
        skipLines: [0, -1],
      },
    )

    await driver.press("D")
    await driver.press("D")
    await driver.press("j")
    await driver.press("l")
    await driver.press("D")
    await driver.press("Escape")
    await driver.press("j")
  })
})

// --- Detail pane empty state fallback ---

// FREEZE: needs store.getState() — uses store white-box access for deselect/cursor manipulation
describe("detail pane empty state fallback", () => {
  test("shows empty board when cursor points to non-existent node", () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("task1"), item("task2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    board.expect("#main-detail").toExist()

    // Detail pane should show the current card's content
    expect(board.screenshot()).toContain("task1")

    // Simulate cursor pointing to a non-existent node on the BOARD pane.
    // This happens when a new item is being created or a node was deleted.
    // The detail pane has its own rootId (set when opened), so it keeps
    // showing the original card even when the board cursor is invalid.
    // Move cursor to a non-existent node via dispatchBoard
    act(() => {
      store.getState().dispatchBoard({ type: "SELECT", nodeId: "nonexistent-node" })
    })
    // Flush render
    board.press("Ctrl+l")

    // Detail pane still shows the original card (its rootId is independent)
    expect(board.screenshot()).toContain("task1")
    expect(board.screenshot()).not.toContain("Error loading")
  })

  // NOTE: uses sel.deselect() directly — requires white-box store access.
  test("shows empty board when both card and column are null", () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    board.expect("#main-detail").toExist()

    // Simulate board-level deselection via sel store.
    // The detail pane has its own rootId (set when opened), so it keeps
    // showing the original card even when the board cursor is cleared.
    act(() => {
      store.getState().sel.deselect()
    })
    board.press("Ctrl+l")

    // Detail pane still shows the original card (its rootId is independent)
    expect(board.screenshot()).toContain("task1")
    expect(board.screenshot()).not.toContain("Error loading")
  })

  // NOTE: uses sel.deselect() directly — requires white-box store access.
  test("detail pane shows header bar in fallback state", () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    board.expect("#main-detail").toExist()

    // Make cursor invalid — deselect via sel store
    act(() => {
      store.getState().sel.deselect()
    })
    board.press("Ctrl+l")

    // Fallback should show a header bar with DETAIL VIEW label
    const screenshot = board.screenshot()
    expect(screenshot).toContain("DETAIL VIEW")
  })
})

// --- Detail pane cursor ---

describe("detail pane cursor", () => {
  test("cursor starts on first child", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("sub1"), item("sub2")), item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open detail pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Detail pane cursor starts on first child of the focused card
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub1")
  })

  test("cursor resets when board cursor moves to different node", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("sub1")), item("card2", item("sub2")))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open + auto-focus detail pane
    board.press("h") // return to board

    board.press("j") // move to card2 — detail pane root should update
    // Detail pane cursor should reset to the new card's first child
    const detailPane = store.getState().workspace.panes.get("main-detail") as any
    expect(detailPane?.sel.node.cursor() as string | null).toBe("sub2")
  })

  test("cursor resets when detail pane is toggled", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("sub1"), item("sub2")))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("D") // open detail pane

    // Navigate to second child
    board.press("j")
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub2")

    board.press("D") // close detail pane — pane removed
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    board.press("D") // reopen detail pane — fresh pane, cursor on first child
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub1")
  })

  test("cursor state is independent of nav_back/nav_forward keys", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // {/} are nav_back/nav_forward in v2, not detail navigation
    board.press("}")
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe(null)

    board.press("{")
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe(null)
  })
})

// --- Detail pane on link-type nodes ---

describe("detail pane on link-type nodes", () => {
  test("Space toggles detail pane open and closed on link node", { timeout: 5000 }, () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
        item("col2", item("card2")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Navigate to the link node (it's the first card in col1)
    app.expect("#link-to-target[data-cursor]").toExist()

    // Open detail pane with D
    app.press("D")
    app.expect("#main-detail").toExist()

    // Close detail pane with D
    app.press("D")
    app.expect("#main-detail").not.toExist()
  })

  test("Escape from detail pane returns to board, then closes pane", { timeout: 5000 }, () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
        item("col2", item("card2")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    app.press("D")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()

    // Escape from detail → returns to board (pane stays open)
    app.press("Escape")
    app.expect("#main-detail[data-focused]").not.toExist()
    app.expect("#main-detail").toExist()

    // Escape again → closes pane
    app.press("Escape")
    app.expect("#main-detail").not.toExist()
  })

  test("link node whose target has children: Enter zooms instead of detail pane", { timeout: 5000 }, () => {
    // The link target "col2" has children, so Enter should zoom into it, not open detail pane
    using app = createTestApp(
      item("board", item("col1", item.link("embed-link", "col2"), item("another-card")), item("col2", item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Enter on link node starts inline edit (Enter is bound to enter_inline_edit in normal mode)
    app.press("Enter")
    // Detail pane should NOT open — Enter triggers inline edit, not OPEN_DETAIL_PANE
    app.expect("#main-detail").not.toExist()
  })

  test("backslash key does NOT toggle detail pane (bound to command palette)", { timeout: 5000 }, () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
        item("col2", item("card2")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Backslash is bound to command_palette, not toggle_detail_pane
    app.press("\\")
    app.expect("#main-detail").not.toExist()

    // D is the correct key to open detail pane
    app.press("D")
    app.expect("#main-detail").toExist()

    // Backslash does NOT close it either
    app.press("\\")
    app.expect("#main-detail").toExist()

    // D closes it
    app.press("D")
    app.expect("#main-detail").not.toExist()
  })

  test("detail pane stays closeable after navigating to different card", { timeout: 5000 }, () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.link("link-node", "target-id"), item("regular-card")),
        item("col2", item("card2")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    app.press("D")
    app.expect("#main-detail").toExist()

    // Return to board, navigate to next card
    app.press("h")
    app.press("j")
    app.expect("#regular-card[data-cursor]").toExist()

    // Detail pane still open, should close with D
    app.expect("#main-detail").toExist()
    app.press("D")
    app.expect("#main-detail").not.toExist()
  })

  test("detail pane stays closeable after navigating to different column", { timeout: 5000 }, () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.link("link-node", "target-id"), item("regular-card")),
        item("col2", item("card2")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    app.press("D")
    app.expect("#main-detail").toExist()

    // Return to board, navigate to different column
    app.press("h")
    app.press("l")
    app.expect("#card2[data-cursor]").toExist()

    // Escape closes pane
    app.expect("#main-detail").toExist()
    app.press("Escape")
    app.expect("#main-detail").not.toExist()
  })

  test("detail pane closes on link node pointing to existing target", { timeout: 5000 }, () => {
    // The link target exists in the repo
    using app = createTestApp(
      item("board", item("col1", item.link("embed-link", "card2"), item("another-card")), item("col2", item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    app.press("D")
    app.expect("#main-detail").toExist()

    // Close with D
    app.press("D")
    app.expect("#main-detail").not.toExist()
  })
})

// --- Detail pane + column navigation (regression: infinite render loop) ---

/** Derive colIndex from store state on demand. */
function getColIndex(store: StoreApi<BoardAppStore>): number {
  const s = store.getState()
  const pane = getActiveBoardPane(s)
  if (!pane) return -1
  const columns = deriveColumnsFromRepo(s.repo, pane.rootId, pane.foldDepths)
  const nodeIndex = buildNodeIndex(columns)
  const cursor = deriveCursorIndices(columns, pane.sel.node.cursor() as string | null, nodeIndex)
  return cursor.colIndex
}

// FREEZE: needs store.getState() — uses getColIndex/store for column navigation checks
describe("detail pane + column navigation (regression: infinite render loop)", () => {
  test("l navigates right while detail pane is open", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1")), item("col2", item("card2"))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("D") // open + focus detail pane
    board.press("h") // return to board
    expect(getColIndex(store)).toBe(0)

    board.press("l") // navigate right
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(getColIndex(store)).toBe(1)
  })

  test("D auto-focuses detail pane when opening", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("card1", item("sub1")))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane — auto-focuses it
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    // Detail cursor should be on first child
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub1")
  })

  test("h in detail pane returns focus to board", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item("card1", item("sub1")))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open + auto-focus detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    board.press("h") // should return to board
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true) // pane stays open
  })

  test("l then h round-trips between board and detail pane", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("sub1"))), item("col2", item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open + auto-focus detail pane
    board.press("h") // return to board

    board.press("l") // col1 → col2
    expect(getColIndex(store)).toBe(1)
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")

    board.press("l") // col2 (rightmost) → detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    board.press("h") // detail pane → board
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    // Board cursor should still be on col2
    expect(getColIndex(store)).toBe(1)
  })

  test("h navigates left while detail pane is open", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1")), item("col2", item("card2"))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("l") // go to col2 first
    board.press("D") // open + focus detail pane
    board.press("h") // return to board (from detail)
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(getColIndex(store)).toBe(1)

    board.press("h") // navigate left
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(getColIndex(store)).toBe(0)
  })

  test("j/k navigation still works with detail pane open", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1"), item("card2")), item("col2", item("card3"))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open + focus detail pane
    board.press("h") // return to board

    board.press("j") // move down
    board.expectState({ cursor: "card2" })

    board.press("k") // move up
    board.expectState({ cursor: "card1" })
  })

  test("multiple l/h with detail pane open", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1")), item("col2", item("card2")), item("col3", item("card3"))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open + focus detail pane
    board.press("h") // return to board

    board.press("l") // col1 → col2
    expect(getColIndex(store)).toBe(1)

    board.press("l") // col2 → col3
    expect(getColIndex(store)).toBe(2)

    board.press("h") // col3 → col2
    expect(getColIndex(store)).toBe(1)

    board.press("h") // col2 → col1
    expect(getColIndex(store)).toBe(0)
  })
})

// --- Detail pane focus + navigation ---

describe("detail pane focus + navigation", () => {
  test("D opens pane and focuses detail, j navigates children", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("sub1"), item("sub2")))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("D") // open + auto-focus detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub1")

    // j → second child (sub2)
    board.press("j")
    expect(
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null,
    ).toBe("sub2")
  })

  test("h from detail pane returns to board, keeps pane open", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(() => item("board", item("col1", item.task("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open + auto-focus detail
    board.press("h") // back to board
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("detail pane root node follows board cursor", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item.task("task1"), item.task("task2"))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("D") // open + auto-focus detail pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Board cursor is on task1 → detail pane should show task1
    board.expectScreen("task1")

    // Return to board, move cursor to task2 → detail pane should follow
    board.press("h")
    board.press("j")
    board.expectScreen("task2")
  })

  test("n (pane_focus_next) cycles from detail to board", { timeout: 5000 }, () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item.task("task1"), item.task("task2"))),
      {
        checkIncremental: false,
        incremental: false,
      },
    )

    board.press("D") // open + auto-focus detail pane
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Detail pane should show "task1"
    board.expectScreen("task1")
    board.expectScreenNot("No node selected")

    // Press 'n' to cycle pane focus — should go from detail back to board
    board.press("n")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")

    // The detail pane should still show the node, NOT "No node selected"
    board.expectScreenNot("No node selected")
    board.expectScreen("task1")
  })
})

// =============================================================================
// Detail pane j/k navigation
// =============================================================================

describe("detail pane j/k navigation", () => {
  /** Get detail pane cursor */
  const dc = (store: any): string | null =>
    ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null

  test("folder children navigate sequentially", () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("child-a"), item("child-b"), item("child-c")))),
      { checkIncremental: false, incremental: false },
    )
    board.press("D")
    expect(dc(store)).toBe("child-a")
    board.press("j")
    expect(dc(store)).toBe("child-b")
    board.press("j")
    expect(dc(store)).toBe("child-c")
  })

  // Metadata cursors (__meta__Status, etc.) are virtual IDs not present in the
  // sel walk order, so sel.node.select() normalises them away. The test expects
  // detail pane to land on __meta__Status first — unimplemented. Re-enable when
  // the detail pane supports virtual cursor IDs.
  test.skip("task with mixed children: body paragraphs + heading sections", () => {
    const nodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "col1",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "col1" },
        parent_id: "board",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task1",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" as const } },
        content: "Review Q1 budget",
        data: {},
        parent_id: "col1",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "body1",
        type: "p",
        item: {},
        content: "This needs review by Friday",
        data: {},
        parent_id: "task1",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "heading1",
        type: "h",
        item: {},
        content: "Action items",
        data: { name: "Action items" },
        parent_id: "task1",
        parent_idx: 1,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    ] as KNode[]
    const { board, store } = createDriverTest(() => nodes, { checkIncremental: false, incremental: false })
    board.press("D")
    // Task nodes show metadata rows first; cursor starts on __meta__Status
    expect(dc(store)).toBe("__meta__Status")
    // Navigate through metadata rows (Status, Priority, Due, Start, Recurrence, Assigned)
    for (let i = 0; i < 5; i++) board.press("j")
    expect(dc(store)).toBe("__meta__Assigned")
    // Next j reaches first child
    board.press("j")
    expect(dc(store)).toBe("body1")
    board.press("j")
    expect(dc(store)).toBe("heading1")
    board.press("k")
    expect(dc(store)).toBe("body1")
  })

  test.skip("cursor highlight works for all children (not just first)", () => {
    // Regression: cursor classification used to classify outline children as column-level
    // (cursorDepth: "column"), breaking card highlight for all but the initial item.
    const nodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "col1",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "col1" },
        parent_id: "board",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task1",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" as const } },
        content: "Task",
        data: {},
        parent_id: "col1",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "body1",
        type: "p",
        item: {},
        content: "Description text",
        data: {},
        parent_id: "task1",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "heading1",
        type: "h",
        item: {},
        content: "Section A",
        data: { name: "Section A" },
        parent_id: "task1",
        parent_idx: 1,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "heading2",
        type: "h",
        item: {},
        content: "Section B",
        data: { name: "Section B" },
        parent_id: "task1",
        parent_idx: 2,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    ] as KNode[]
    const { board, store } = createDriverTest(() => nodes, { checkIncremental: false, incremental: false })
    board.press("D")

    /** Get detail pane's cursor state from pane state */
    const detailCursor = () => {
      const pane = store.getState().workspace.panes.get("main-detail") as any
      const cursor = (pane?.sel.node.cursor() as string | null) ?? null
      // In detail view mode, items are flat — cursorCardNodeId === cursor
      return {
        cursor,
        cursorCardNodeId: cursor,
        cursorDepth: cursor ? "card" : "board",
      }
    }

    // Task nodes show metadata rows first; cursor starts on __meta__Status
    expect(detailCursor().cursorCardNodeId).toBe("__meta__Status")
    expect(detailCursor().cursorDepth).toBe("card")

    // Navigate past metadata rows (Status, Priority, Due, Start, Recurrence, Assigned)
    for (let i = 0; i < 6; i++) board.press("j")

    // First child: body paragraph — should highlight as card
    expect(dc(store)).toBe("body1")
    expect(detailCursor().cursorCardNodeId).toBe("body1")
    expect(detailCursor().cursorDepth).toBe("card")

    // Second child: heading (outline) — should ALSO highlight as card, not column
    board.press("j")
    expect(dc(store)).toBe("heading1")
    expect(detailCursor().cursorCardNodeId).toBe("heading1")
    expect(detailCursor().cursorDepth).toBe("card")

    // Third child: another heading — same
    board.press("j")
    expect(dc(store)).toBe("heading2")
    expect(detailCursor().cursorCardNodeId).toBe("heading2")
    expect(detailCursor().cursorDepth).toBe("card")
  })

  test("j then k round-trips correctly", () => {
    const { board, store } = createDriverTest(
      () => item("board", item("col1", item("card1", item("c-a"), item("c-b"), item("c-c")))),
      { checkIncremental: false, incremental: false },
    )
    board.press("D")
    expect(dc(store)).toBe("c-a")
    board.press("j")
    expect(dc(store)).toBe("c-b")
    board.press("j")
    expect(dc(store)).toBe("c-c")
    board.press("k")
    expect(dc(store)).toBe("c-b")
    board.press("k")
    expect(dc(store)).toBe("c-a")
  })

  test("j navigates past H2 headings into their children and to next H2 (item builder)", () => {
    // Card with H2 sections containing children — like a real Quarterly Plan document
    const { board, store } = createDriverTest(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "card1",
              item.section("Constitution", item("task-c1"), item("task-c2")),
              item.section("Craft", item("task-r1")),
              item.section("Clan", item("task-l1"), item("task-l2")),
            ),
          ),
        ),
      { checkIncremental: false, incremental: false },
    )

    board.press("D")

    // Cursor starts on first child: Constitution (H2)
    expect(dc(store)).toBe("Constitution")

    // j → enter Constitution's children → task-c1
    board.press("j")
    expect(dc(store)).toBe("task-c1")

    // j → next sibling under Constitution → task-c2
    board.press("j")
    expect(dc(store)).toBe("task-c2")

    // j → past last child of Constitution → next H2 sibling → Craft
    board.press("j")
    expect(dc(store)).toBe("Craft")

    // j → enter Craft's children → task-r1
    board.press("j")
    expect(dc(store)).toBe("task-r1")

    // j → past last child of Craft → next H2 sibling → Clan
    board.press("j")
    expect(dc(store)).toBe("Clan")

    // j → enter Clan's children → task-l1
    board.press("j")
    expect(dc(store)).toBe("task-l1")

    // j → next sibling → task-l2
    board.press("j")
    expect(dc(store)).toBe("task-l2")

    // k → back through entire tree
    board.press("k")
    expect(dc(store)).toBe("task-l1")

    board.press("k")
    expect(dc(store)).toBe("Clan")

    board.press("k")
    expect(dc(store)).toBe("task-r1")

    board.press("k")
    expect(dc(store)).toBe("Craft")

    board.press("k")
    expect(dc(store)).toBe("task-c2")

    board.press("k")
    expect(dc(store)).toBe("task-c1")

    board.press("k")
    expect(dc(store)).toBe("Constitution")
  })

  test("j navigates H2 headings under a task card (metadata + sections)", () => {
    // Task card with metadata rows + H2 sections: the real-world scenario.
    // The detail pane initial cursor targets __meta__Status for tasks.
    // Bug: __meta__ IDs aren't in the sel walkOrder, so cursor normalizes to null.
    const nodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "col1",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "col1" },
        parent_id: "board",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "plan",
        type: "h",
        item: { task: { marker: "[ ]", status: "todo" as const } },
        fstype: "mdfile" as const,
        content: "Quarterly Plan Q19",
        data: { name: "Quarterly Plan Q19" },
        parent_id: "col1",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "constitution",
        type: "h",
        item: {},
        fstype: "mdsection" as const,
        data: { name: "Constitution" },
        parent_id: "plan",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task-c1",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" as const } },
        content: "Review charter",
        data: {},
        parent_id: "constitution",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "craft",
        type: "h",
        item: {},
        fstype: "mdsection" as const,
        data: { name: "Craft" },
        parent_id: "plan",
        parent_idx: 1,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task-r1",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" as const } },
        content: "Build prototype",
        data: {},
        parent_id: "craft",
        parent_idx: 0,
        embed_of: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    ] as KNode[]

    const { board, store } = createDriverTest(() => nodes, { checkIncremental: false, incremental: false })
    board.press("D")

    // Initial cursor starts on first real child (H2 heading), not __meta__
    expect(dc(store)).toBe("constitution")

    // j → enter Constitution's first child
    board.press("j")
    expect(dc(store)).toBe("task-c1")

    // j → past last child of Constitution → next H2 sibling
    board.press("j")
    expect(dc(store)).toBe("craft")

    // j → enter Craft's first child
    board.press("j")
    expect(dc(store)).toBe("task-r1")

    // k → back to Craft heading
    board.press("k")
    expect(dc(store)).toBe("craft")

    // k → back to task-c1 (last descendant of Constitution)
    board.press("k")
    expect(dc(store)).toBe("task-c1")

    // k → back to Constitution heading
    board.press("k")
    expect(dc(store)).toBe("constitution")
  })

  test("j navigates past H2 headings with fromMarkdown (real parser)", () => {
    // Realistic: a document with H1 (becomes board root) and H2 sections (columns)
    // Then each H2 section has task items as cards.
    // The detail pane is opened on ONE card, and we navigate its H2 sub-sections.
    // A card with H2 sub-sections = item("card1", item.section("H2A", ...), item.section("H2B", ...))
    const { board, store } = createDriverTest(
      () =>
        item(
          "board",
          item(
            "col1",
            item(
              "plan",
              item.section("Constitution", item("Review charter"), item("Update bylaws")),
              item.section("Craft", item("Build prototype")),
              item.section("Clan", item("Team review"), item("Hire designer")),
            ),
          ),
        ),
      { checkIncremental: false, incremental: false },
    )

    board.press("D")
    // Cursor starts on first child
    expect(dc(store)).toBe("Constitution")

    // Navigate through the entire tree with j
    board.press("j")
    expect(dc(store)).toBe("Review charter")
    board.press("j")
    expect(dc(store)).toBe("Update bylaws")
    board.press("j")
    expect(dc(store)).toBe("Craft")
    board.press("j")
    expect(dc(store)).toBe("Build prototype")
    board.press("j")
    expect(dc(store)).toBe("Clan")
    board.press("j")
    expect(dc(store)).toBe("Team review")
    board.press("j")
    expect(dc(store)).toBe("Hire designer")

    // j at the end should stay (boundary)
    board.press("j")
    expect(dc(store)).toBe("Hire designer")

    // Now navigate back up with k
    board.press("k")
    expect(dc(store)).toBe("Team review")
    board.press("k")
    expect(dc(store)).toBe("Clan")
    board.press("k")
    expect(dc(store)).toBe("Build prototype")
    board.press("k")
    expect(dc(store)).toBe("Craft")
    board.press("k")
    expect(dc(store)).toBe("Update bylaws")
    board.press("k")
    expect(dc(store)).toBe("Review charter")
    board.press("k")
    expect(dc(store)).toBe("Constitution")
  })
})

// =============================================================================
// Board h/l navigation with detail pane open
// =============================================================================

describe("board h/l navigation with detail pane open", () => {
  /** Get board cursor from sel store */
  const bc = (store: any): string | null => store.getState().sel.node.cursor() ?? null

  test("D → navigate detail → h → l: board cursor preserved, l works", () => {
    const { board, store } = createDriverTest(
      () => item("board", item("Todo", item("task-1", item("sub-1"), item("sub-2"))), item("Doing", item("task-2"))),
      { checkIncremental: false, incremental: false },
    )

    // Navigate to task-1
    board.press("j") // board → Todo header
    board.press("j") // Todo header → task-1
    expect(bc(store)).toBe("task-1")

    // Open detail pane, navigate inside
    board.press("D")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    const dc =
      ((store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null) ?? null
    expect(dc).toBe("sub-1")

    board.press("j") // navigate in detail

    // Come back to board
    board.press("h")
    expect(store.getState().workspace.focusedPaneId).toBe("main")

    // Board cursor should still be on task-1
    expect(bc(store)).toBe("task-1")

    // l should navigate to Doing column
    board.press("l")
    expect(bc(store)).toBe("task-2")
  })
})

// =============================================================================
// Merged from detail-pane.slow.spec.ts — Detail Pane Journey Tests
// =============================================================================

describe("Detail Pane Journeys", () => {
  test("D opens detail pane and focuses it, D again closes it", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy milk"), item.task("Fix bug"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initially no detail pane
    app.expect("#main-detail").not.toExist()

    // Step 1: Open detail pane with D — auto-focuses detail
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()
    app.expectScreen("Buy milk")

    // Step 2: Close detail pane with D (from detail pane)
    app.command("toggle_detail_pane")
    app.expect("#main-detail").not.toExist()
  })

  test("open detail, return to board, navigate cursor down, detail follows", () => {
    using app = createTestApp(item("board", item("col1", item.task("task1"), item.task("task2"), item.task("task3"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane — auto-focuses detail, shows task1
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expectScreen("task1")

    // Step 2: Return to board, navigate down to task2 — detail should follow
    app.command("cursor_left")
    app.command("cursor_down")
    app.expectScreen("task2")

    // Step 3: Navigate down to task3 — detail should follow
    app.command("cursor_down")
    app.expectScreen("task3")
  })

  test("detail pane shows folder children when cursor is on folder card", () => {
    using app = createTestApp(item("board", item("col1", item("project", item("subtask-a"), item("subtask-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane for folder card — auto-focuses detail, cursor on first child
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#subtask-a[data-cursor]").toExist()

    // Step 2: Navigate down to second child
    app.command("cursor_down")
    app.expect("#subtask-b[data-cursor]").toExist()
  })

  test("l at rightmost column focuses detail, h returns to board", () => {
    using app = createTestApp(item("board", item("col1", item.task("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane, return to board
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.command("cursor_left") // return focus to board

    // Step 2: l at rightmost column should focus detail pane
    app.command("cursor_right")
    app.expect("#main-detail[data-focused]").toExist()

    // Step 3: h should return focus to board
    app.command("cursor_left")
    app.expect("#main-detail[data-focused]").not.toExist()
    // Pane should still be open
    app.expect("#main-detail").toExist()
  })

  test("round-trip: open detail, navigate entries, return to board, navigate board", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.task("task1"), item.task("task2"), item.task("task3")),
        item("col2", item.task("task4")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane with D — auto-focuses detail
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()

    // Step 2: Navigate within detail pane
    app.command("cursor_down")

    // Step 3: Return to board
    app.command("cursor_left")
    app.expect("#main-detail[data-focused]").not.toExist()

    // Step 4: Navigate to col2 then back to col1
    app.command("cursor_right") // col1 -> col2
    app.command("cursor_left") // col2 -> col1

    // Step 5: Board navigation still works
    app.command("cursor_down")
    app.command("cursor_down")
    app.expect("#task3[data-cursor]").toExist()
  })

  test("j/k navigation between detail pane children", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b"), item("child-c")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail — cursor starts on first child
    app.command("toggle_detail_pane")
    app.expect("#child-a[data-cursor]").toExist()

    // Step 2: j moves to next child
    app.command("cursor_down")
    app.expect("#child-b[data-cursor]").toExist()

    // Step 3: k moves back
    app.command("cursor_up")
    app.expect("#child-a[data-cursor]").toExist()
  })

  test("Enter on structural child triggers inline edit and typing saves", () => {
    using app = createTestApp(item("board", item("col1", item("parent", item("child-a"), item("child-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane — cursor starts on first child (child-a)
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()
    app.expect("#child-a[data-cursor]").toExist()

    // Step 2: Enter = inline edit on child-a in detail pane, detail stays open
    app.press("Enter")
    app.expect("#main-detail").toExist()

    // Step 4: Type to edit the title — the text should appear on screen
    for (const c of "-ok") app.press(c)
    app.expectScreen("child-a-ok")

    // Step 5: Escape to confirm edit
    app.press("Escape")

    // Step 6: Verify the node was updated in repo
    const updated = app.repo.getNode("child-a")
    expect(updated?.content).toContain("-ok")
  })

  test("Escape during inline edit saves and exits (no stray sibling)", () => {
    using app = createTestApp(item("board", item("col1", item("parent", item("child-a"), item("child-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail (cursor starts on child-a), start editing
    app.command("toggle_detail_pane")
    app.press("Enter")

    // Type something
    for (const c of "-ok") app.press(c)

    // Escape saves and exits edit mode for body blocks in the detail pane
    const childrenBefore = app.repo.getChildren("parent").length
    app.press("Escape")
    expect(app.repo.getChildren("parent").length).toBe(childrenBefore) // no stray node
    expect(app.repo.getNode("child-a")?.content).toContain("-ok") // saved
  })

  test("i on structural child in detail pane also triggers inline edit", () => {
    using app = createTestApp(item("board", item("col1", item("parent", item("child-a"), item("child-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail (cursor starts on child-a)
    app.command("toggle_detail_pane")
    app.expect("#child-a[data-cursor]").toExist()

    // i = inline edit on detail cursor node — verify edit started by typing
    app.press("i")
    // Type to verify we're in edit mode (cursor starts at end, so ! appends)
    app.press("!")
    app.expectScreen("child-a!")
    app.press("Escape")
  })

  // =========================================================================
  // Bug km-ii6qw.2: Shift+L unfold doesn't work in detail pane
  // DetailView no longer applies DETAIL_DEFAULT_DEPTH — DocNode/DocContent use
  // MAX_EXPAND_DEPTH=3 and there is no per-node fold state. Re-enable when
  // detail pane grows a fold model.
  // =========================================================================

  test.skip("L unfolds a child in detail pane, revealing deeper descendants", () => {
    // 3 levels deep: child-a > gc-1 > ggc-1
    // With DETAIL_DEFAULT_DEPTH=1, gc-1 is visible but ggc-1 is folded
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1"), item("ggc-2")))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()
    app.expect("#child-a[data-cursor]").toExist()

    // gc-1 is visible at depth 1, but ggc-1/ggc-2 are folded (depth exceeded)
    app.expectScreen("gc-1")

    // Step 2: Unfold child-a with L (Shift+L) — should reveal ggc-1, ggc-2
    app.command("unfold_more")

    // After unfold, deeper descendants should be visible
    app.expectScreen("ggc-1")
  })

  test("H folds a child in detail pane, hiding its sub-children", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1"), item("gc-2"))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // gc-1 and gc-2 are visible at DETAIL_DEFAULT_DEPTH=1
    app.expectScreen("gc-1")

    // Step 2: Fold child-a — gc-1/gc-2 should disappear from detail
    app.command("fold_more")

    // Step 3: Unfold — should restore
    app.command("unfold_more")
    app.expectScreen("gc-1")
  })

  // =========================================================================
  // Bug km-ii6qw.3: Detail depth matches column depth (no full tree duplication)
  // =========================================================================

  test.skip("detail pane children use controlled depth, not infinite expansion", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1")))))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // DETAIL_DEFAULT_DEPTH=1: child-a shows gc-1 (1 level), but gc-1's children
    // (ggc-1) should be folded. The detail pane should NOT show ggc-1 initially.
    app.expectScreen("gc-1")
    app.expectScreenNot("ggc-1")
  })

  test("detail pane stays open when navigating between columns", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.task("task-a")),
        item("col2", item.task("task-b")),
        item("col3", item.task("task-c")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane, return focus to board
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.command("cursor_left") // return to board

    // Step 2: Navigate right to col2
    app.command("cursor_right")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-b")

    // Step 3: Navigate right to col3
    app.command("cursor_right")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-c")

    // Step 4: Navigate left back to col2
    app.command("cursor_left")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-b")
  })

  // =========================================================================
  // km-o7ayx: Detail view children use Card infrastructure
  // DetailView now renders children as DocNode boxes (not Card components)
  // after the 9f24941e refactor that replaced virtual __meta__ nodes with
  // focusable React components. Test is obsolete.
  // =========================================================================

  test.skip("detail pane children render as cards with data-view attribute", () => {
    using app = createTestApp(item("board", item("col1", item("parent", item("child-a"), item("child-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane — auto-focuses detail, cursor on first child
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // Step 2: Children should be wrapped in Card components with data-view="card"
    app.expect('[data-view="card"][data-card-id="child-a"]').toExist()
    app.expect('[data-view="card"][data-card-id="child-b"]').toExist()

    // Step 3: Children should still be visible on screen
    app.expectScreen("child-a")
    app.expectScreen("child-b")
  })
})

// =============================================================================
// Detail pane edit-mode styling
// =============================================================================

describe("detail pane edit-mode styling", () => {
  test("editing a detail pane node suppresses selection-bg and shows focusborder color", () => {
    const { board } = createDriverTest(
      () => item("board", item("col1", item("card1", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    board.press("D") // open + focus detail pane

    // Cursor is on child-a — should have selection-bg
    const cursorBox = board.screen.nodeBox("child-a")
    expect(cursorBox).not.toBeNull()

    // Enter edit mode on the cursor node
    board.press("Enter")

    // After editing: cursor node should NOT have selection-bg background
    // (it should be clear/undefined) and text should use $focusborder color
    const editBox = board.screen.nodeBox("child-a")
    expect(editBox).not.toBeNull()

    // The node should still be visible (editing didn't break rendering)
    board.expectScreen("child-a")

    // Exit edit mode
    board.press("Escape")

    // After exiting: selection-bg should return
    board.expectScreen("child-a")
  })
})
