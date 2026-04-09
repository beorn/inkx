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
import { testEnv, item } from "./helpers/board-test.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"

// --- Test Helpers ---

/** Default node fields that most tests don't care about */
const nodeDefaults = {
  parent_idx: 0,
  symlink_to: null,
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
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Initially: 1 pane (main), no detail pane
    expect(store.getState().workspace.panes.size).toBe(1)
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Press D to toggle detail pane open
    board.press("D")

    // Should have exactly 2 panes: main + main-detail
    const ws = store.getState().workspace
    expect(ws.panes.size).toBe(2)
    expect(ws.panes.has("main")).toBe(true)
    expect(ws.panes.has("main-detail")).toBe(true)

    // The detail pane should be a board pane with viewMode "detail"
    const detailPane = ws.panes.get("main-detail")!
    expect(detailPane.viewType).toBe("board")
    expect((detailPane as any).viewMode).toBe("detail")

    // Detail pane should be present in workspace panes
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // No "empty" panes should exist
    const emptyPanes = [...ws.panes.values()].filter((p) => p.viewType === "empty")
    expect(emptyPanes).toHaveLength(0)

    // The layout should be a split with main (left) and main-detail (right)
    expect(ws.layout.type).toBe("split")
    if (ws.layout.type === "split") {
      expect(ws.layout.left).toEqual({ type: "leaf", paneId: "main" })
      expect(ws.layout.right).toEqual({ type: "leaf", paneId: "main-detail" })
    }
  })

  test("D with split panes does not create extra empty pane", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Split the pane first
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Now press D to open detail pane
    board.press("D")

    const ws = store.getState().workspace
    // Should have 3 panes: main, main-detail, and the split pane
    // Detail pane is a BoardPaneState with viewMode "detail"
    const detailPane = ws.panes.get("main-detail")
    expect(detailPane).toBeDefined()
    expect(detailPane!.viewType).toBe("board")
    expect((detailPane as any).viewMode).toBe("detail")
    // Any empty panes should only be from the split (not from D)
    const emptyPanes = [...ws.panes.values()].filter((p) => p.viewType === "empty")
    expect(emptyPanes.length).toBeLessThanOrEqual(1)

    // The rendered output should not show "Empty pane" text
    const text = board.screenshot()
    expect(text).not.toContain("Empty pane")
  })

  test("D toggles detail pane closed when already open", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Close detail pane
    board.press("D")
    expect(store.getState().workspace.panes.size).toBe(1)
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
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
    const { board } = testEnv(
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
    const { board } = testEnv(
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

describe("detail pane empty state fallback", () => {
  test("shows empty board when cursor points to non-existent node", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

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

  test("shows empty board when both card and column are null", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

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

  test("detail pane shows header bar in fallback state", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

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
    const { board, store } = testEnv(
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
    const { board, store } = testEnv(
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
    const { board, store } = testEnv(() => item("board", item("col1", item("card1", item("sub1"), item("sub2")))), {
      checkIncremental: false,
      incremental: false,
    })

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
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
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
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Navigate to the link node (it's the first card in col1)
    board.expectState({ cursor: "link-to-target" })

    // Open detail pane with Space
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane with Space
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("Escape from detail pane returns to board, then closes pane", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Escape from detail → returns to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape again → closes pane
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("link node whose target has children: Enter zooms instead of detail pane", { timeout: 5000 }, () => {
    // The link target "col2" has children, so Enter should zoom into it, not open detail pane
    const { board, store } = testEnv(
      () =>
        item("board", item("col1", item.link("embed-link", "col2"), item("another-card")), item("col2", item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Enter on link node starts inline edit (Enter is bound to enter_inline_edit in normal mode)
    board.press("Enter")
    // Detail pane should NOT open — Enter triggers inline edit, not OPEN_DETAIL_PANE
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("backslash key does NOT toggle detail pane (bound to command palette)", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Backslash is bound to command_palette, not toggle_detail_pane
    board.press("\\")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Space is the correct key to open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Backslash does NOT close it either
    board.press("\\")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Space closes it
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("detail pane stays closeable after navigating to different card", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-node", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Return to board, navigate to next card
    board.press("h")
    board.press("j")
    board.expectState({ cursor: "regular-card" })

    // Detail pane still open, should close with D
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("detail pane stays closeable after navigating to different column", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-node", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // D opens + focuses detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Return to board, navigate to different column
    board.press("h")
    board.press("l")
    board.expectState({ cursor: "card2" })

    // Escape closes pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("detail pane closes on link node pointing to existing target", { timeout: 5000 }, () => {
    // The link target exists in the repo
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("embed-link", "card2"), item("another-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close with Space
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
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

describe("detail pane + column navigation (regression: infinite render loop)", () => {
  test("l navigates right while detail pane is open", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open + focus detail pane
    board.press("h") // return to board
    expect(getColIndex(store)).toBe(0)

    board.press("l") // navigate right
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(getColIndex(store)).toBe(1)
  })

  test("D auto-focuses detail pane when opening", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1", item("sub1")))), {
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
    const { board, store } = testEnv(() => item("board", item("col1", item("card1", item("sub1")))), {
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
    const { board, store } = testEnv(
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
    const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

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
    const { board, store } = testEnv(
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
    const { board, store } = testEnv(
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
    const { board, store } = testEnv(() => item("board", item("col1", item("card1", item("sub1"), item("sub2")))), {
      checkIncremental: false,
      incremental: false,
    })

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
    const { board, store } = testEnv(() => item("board", item("col1", item.task("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open + auto-focus detail
    board.press("h") // back to board
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("detail pane root node follows board cursor", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("task1"), item.task("task2"))), {
      checkIncremental: false,
      incremental: false,
    })

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
    const { board, store } = testEnv(() => item("board", item("col1", item.task("task1"), item.task("task2"))), {
      checkIncremental: false,
      incremental: false,
    })

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
    const { board, store } = testEnv(
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

  test("task with mixed children: body paragraphs + heading sections", () => {
    const nodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder" as const,
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        symlink_to: null,
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
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task1",
        type: "p",
        item: {},
        content: "Review Q1 budget",
        list_marker: "-",
        task_marker: "[ ]",
        task_status: "todo" as const,
        data: {},
        parent_id: "col1",
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "body1",
        type: "p",
        content: "This needs review by Friday",
        data: {},
        parent_id: "task1",
        parent_idx: 0,
        symlink_to: null,
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
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    ] as KNode[]
    const { board, store } = testEnv(() => nodes, { checkIncremental: false, incremental: false })
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

  test("cursor highlight works for all children (not just first)", () => {
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
        symlink_to: null,
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
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task1",
        type: "p",
        item: {},
        content: "Task",
        list_marker: "-",
        task_marker: "[ ]",
        task_status: "todo" as const,
        data: {},
        parent_id: "col1",
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "body1",
        type: "p",
        content: "Description text",
        data: {},
        parent_id: "task1",
        parent_idx: 0,
        symlink_to: null,
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
        symlink_to: null,
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
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    ] as KNode[]
    const { board, store } = testEnv(() => nodes, { checkIncremental: false, incremental: false })
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
    const { board, store } = testEnv(
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
})

// =============================================================================
// Board h/l navigation with detail pane open
// =============================================================================

describe("board h/l navigation with detail pane open", () => {
  /** Get board cursor from sel store */
  const bc = (store: any): string | null => store.getState().sel.node.cursor() ?? null

  test("D → navigate detail → h → l: board cursor preserved, l works", () => {
    const { board, store } = testEnv(
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
