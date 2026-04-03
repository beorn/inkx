/**
 * P2 Feature: km-tui.filter — Property-based filtering
 *
 * V opens a filter panel in the top-right corner.
 * Navigate with j/k (rows) and h/l (values), toggle with Space/Enter.
 * X clears all filters. Escape closes the panel.
 *
 * Filter categories: task status, priority, due date.
 * Text search persists from old implementation.
 * Filter state persists across view mode changes.
 *
 * Row order: Status, Priority, Due (filters first), then View, Icons (radio).
 */

import { describe, test, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { item, testEnv, testEnvWithRepo } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { addHidden, computeHiddenPath, readBoardHidden, isHidden } from "../src/hidden.ts"

describe("P2: Filter feature", () => {
  test("V toggles filter panel", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs")),
          item("Notes", item("Meeting notes"), item("Design doc")),
        ),
      { columns: 120, rows: 24 },
    )

    // Initially no filter panel
    let screen = board.screenshot()
    expect(screen).not.toContain("View Settings")

    // Open filter panel with V
    board.command("filter")
    screen = board.screenshot()
    expect(screen).toContain("View Settings")
    expect(screen).toContain("Status")
    expect(screen).toContain("Priority")
    expect(screen).toContain("Due")
  })

  test("Escape closes filter panel", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    board.command("filter")
    let screen = board.screenshot()
    expect(screen).toContain("View Settings")

    board.press("Escape")
    screen = board.screenshot()
    expect(screen).not.toContain("Status")
  })

  test("j/k navigates between filter rows", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is now row 0 (first row) — cursor starts there
    let screen = board.screenshot()
    // Status row should be active (first row)
    expect(screen).toContain("Status")

    // Move down to Priority
    board.command("cursor_down")
    screen = board.screenshot()
    expect(screen).toContain("Priority")

    // Move down to Due
    board.command("cursor_down")
    screen = board.screenshot()
    expect(screen).toContain("Due")

    // Move back up
    board.command("cursor_up")
    screen = board.screenshot()
    expect(screen).toContain("Priority")
  })

  test("Space toggles a filter value", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"))), {
      columns: 120,
      rows: 24,
    })

    board.command("filter")
    // Status is row 0 — cursor starts there
    // Toggle 'todo' on
    board.command("select_toggle")
    let screen = board.screenshot()
    expect(screen).toContain("✓ todo")

    // Toggle it off
    board.command("select_toggle")
    screen = board.screenshot()
    expect(screen).toContain("□ todo")
  })

  test("h/l navigates between values in a row", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is row 0 — cursor starts there
    // Move right to second value (wip)
    board.command("cursor_right")
    board.command("select_toggle") // toggle wip on
    let screen = board.screenshot()
    expect(screen).toContain("✓ wip")

    // Move left back to first value (todo)
    board.command("cursor_left")
    board.command("select_toggle") // toggle todo on
    screen = board.screenshot()
    expect(screen).toContain("✓ todo")
    expect(screen).toContain("✓ wip")
  })

  test("X clears all filters", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    board.command("filter")
    // Status is row 0 — cursor starts there
    // Toggle some filters on
    board.command("select_toggle") // todo on
    board.command("cursor_right")
    board.command("select_toggle") // wip on

    let screen = board.screenshot()
    expect(screen).toContain("✓ todo")
    expect(screen).toContain("✓ wip")

    // Clear all
    board.command("cycle_task_status")
    screen = board.screenshot()
    expect(screen).toContain("□ todo")
    expect(screen).toContain("□ wip")
  })

  test("filter indicator shows in top bar when filters active", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // No filter indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("[F]")

    // Open filter — Status is row 0, toggle todo
    board.command("filter")
    board.command("select_toggle") // toggle todo on

    // Close filter panel
    board.press("Escape")

    screen = board.screenshot()
    // Filter indicator should be visible in top bar
    expect(screen).toContain("[F]")
    expect(screen).toContain("todo")
  })

  test("text filter still works via filterText state", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Buy groceries"),
            item("Fix bug in auth"),
            item("Fix login page"),
            item("Write documentation"),
          ),
        ),
      { columns: 120, rows: 24 },
    )

    // All items visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Buy groceries")
    expect(screen).toContain("Fix bug in auth")
    expect(screen).toContain("Write documentation")

    // Set filter text programmatically (text search via SET_FILTER action)
    board.setUI({ filterText: "Fix" })
    // Press a neutral key to flush the React render cycle
    board.command("filter")
    board.press("Escape")

    screen = board.screenshot()
    // Only "Fix" items should be visible in the card area
    // (top bar breadcrumb may still reference cursor position, so check card content area only)
    const cardArea = screen.split("\n").slice(2).join("\n")
    expect(cardArea).toContain("Fix bug in auth")
    expect(cardArea).toContain("Fix login page")
    expect(cardArea).not.toContain("Buy groceries")
    expect(cardArea).not.toContain("Write documentation")
  })

  test("filter persists across view mode changes", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Buy groceries"), item("Fix bug")),
          item("Notes", item("Meeting notes"), item("Fix design")),
        ),
      { columns: 120, rows: 24 },
    )

    // Apply text filter "Fix" programmatically
    board.setUI({ filterText: "Fix" })
    // Press a neutral key to flush the React render cycle
    board.command("filter")
    board.press("Escape")

    // In cards view, only Fix items visible (skip breadcrumb in top bar)
    let screen = board.screenshot()
    let cardArea = screen.split("\n").slice(2).join("\n")
    expect(cardArea).toContain("Fix bug")
    expect(cardArea).not.toContain("Buy groceries")

    // Switch to columns view — filter should persist
    board.command("cycle_view_mode")
    screen = board.screenshot()
    cardArea = screen.split("\n").slice(2).join("\n")
    expect(cardArea).toContain("Fix bug")
    expect(cardArea).not.toContain("Buy groceries")
  })

  test("V closes filter panel when already open (toggle)", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Buy groceries"))), { columns: 120, rows: 24 })

    // Open
    board.command("filter")
    let screen = board.screenshot()
    expect(screen).toContain("View Settings")

    // Close via V again
    board.command("filter")
    screen = board.screenshot()
    expect(screen).not.toContain("Status")
  })
})

// =============================================================================
// Deep filter: embedded tasks use source node properties (km-tui.filter-embedded-source)
// =============================================================================

describe("deep filter: embedded tasks use source node properties (km-tui.filter-embedded-source)", () => {
  /**
   * Build a board with embedded tasks. The embed nodes have embed_source pointing
   * to source nodes. The source nodes have task properties (status, priority,
   * due_at). The embed nodes themselves have minimal properties.
   *
   * Board structure:
   *   board > Tasks > [embed1(embed_source=src1), embed2(embed_source=src2), normalTask]
   *   src1: task_status=todo, priority=1
   *   src2: task_status=done, priority=2
   *   normalTask: task_status=todo (no embed_source)
   */
  function buildEmbedBoard(): KNode[] {
    const now = Date.now()

    // Source nodes (exist elsewhere in the tree -- under a different parent)
    const srcParent: KNode = {
      id: "src-parent",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "Sources" },
      parent_id: "board",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const src1: KNode = {
      id: "src1",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      priority: "P1",
      content: "Source task 1 (todo P1)",
      data: {},
      parent_id: "src-parent",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const src2: KNode = {
      id: "src2",
      type: "p",
      item: { list: "-", task: { status: "done", marker: "[x]" } },
      priority: "P2",
      content: "Source task 2 (done P2)",
      data: {},
      parent_id: "src-parent",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Tasks column
    const tasksCol: KNode = {
      id: "Tasks",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "Tasks" },
      parent_id: "board",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Embed nodes (point to source nodes via embed_source)
    // Embeds have no task_status/priority themselves — they inherit from source
    const embed1: KNode = {
      id: "embed1",
      type: "p",
      item: { list: "-" },
      content: "![[src1]]",
      data: {},
      parent_id: "Tasks",
      parent_idx: 0,
      embed_source: "src1",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const embed2: KNode = {
      id: "embed2",
      type: "p",
      item: { list: "-" },
      content: "![[src2]]",
      data: {},
      parent_id: "Tasks",
      parent_idx: 1,
      embed_source: "src2",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    // A normal (non-embed) task for comparison
    const normalTask: KNode = {
      id: "normalTask",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Normal task (todo)",
      data: {},
      parent_id: "Tasks",
      parent_idx: 2,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Board root
    const board: KNode = {
      id: "board",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    return [board, tasksCol, embed1, embed2, normalTask, srcParent, src1, src2]
  }

  test("filtering by 'todo' status includes embed whose source is todo", () => {
    const { board } = testEnv(() => buildEmbedBoard(), {
      columns: 120,
      rows: 24,
      checkIncremental: false,
    })

    // Verify all cards are visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Source task 1") // embed1 resolves to src1's display
    expect(screen).toContain("Normal task")

    // Apply 'todo' status filter — Status is row 0
    board.command("filter") // open filter
    board.command("select_toggle") // toggle todo (Status row, first value)
    board.press("Escape") // close filter

    screen = board.screenshot()
    // embed1 links to src1 which is task_status=todo → should be visible
    // embed2 links to src2 which is task_status=done → should be hidden
    // normalTask is task_status=todo → should be visible
    expect(screen).toContain("Source task 1")
    expect(screen).toContain("Normal task")
    expect(screen).not.toContain("Source task 2")
  })

  test("filtering by 'done' status includes embed whose source is done", () => {
    const { board } = testEnv(() => buildEmbedBoard(), {
      columns: 120,
      rows: 24,
      checkIncremental: false,
    })

    // Apply 'done' status filter — Status is row 0
    board.command("filter") // open filter
    // Navigate to 'done' value: h/l through values
    // Status row values: todo, wip, blocked, done, dropped
    board.command("cursor_right").command("cursor_right").command("cursor_right") // move to 'done'
    board.command("select_toggle") // toggle done
    board.press("Escape") // close filter

    const screen = board.screenshot()
    // embed2 links to src2 which is task_status=done → should be visible
    // embed1 links to src1 which is task_status=todo → should be hidden
    // normalTask is task_status=todo → should be hidden
    expect(screen).toContain("Source task 2")
    expect(screen).not.toContain("Source task 1")
    expect(screen).not.toContain("Normal task")
  })
})

// =============================================================================
// Bug: hide_node at card level doesn't hide the column (km-tui.hide-broken)
// =============================================================================

/**
 * Bug: hide_node at card level doesn't hide the column
 *
 * Bead: km-tui.hide-broken
 *
 * Root cause: handleHideNode used `card?.node ?? col?.node`, so when cursor
 * was at card level it hid the card node. But Board.tsx only filters at
 * column level (`isHidden(hiddenPaths, col.node, repo)`), so the column
 * stayed visible. The cursor then moved to an adjacent column via SELECT,
 * creating a visual artifact the user reported as "big area selected."
 *
 * Fix: Always hide at column level (`col?.node`), not card level.
 *
 * Note: hide_node is unbound in v2 keybindings. Integration tests call
 * addHidden directly to simulate the command behavior.
 */

/**
 * Create production-like nodes with a file parent and mdsection columns.
 * This matches what km-markdown produces from a real .md file.
 */
function createRealisticNodes(repoPath: string): KNode[] {
  const now = Date.now()
  const base = {
    parent_idx: 0,
    embed_source: null,
    created_at: now,
    updated_at: now,
    version: "v1",
  } satisfies Partial<KNode>

  const fileNode: KNode = {
    ...base,
    id: "file-1",
    type: "h",
    item: {},
    fstype: "mdfile",
    fs_path: "tasks.md",
    name: "tasks",
    content: "Tasks",
    data: {},
    parent_id: null,
  }

  const col1: KNode = {
    ...base,
    id: "col1",
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "todo",
    content: "Todo",
    data: {},
    parent_id: "file-1",
    parent_idx: 0,
  }

  const col2: KNode = {
    ...base,
    id: "col2",
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "done",
    content: "Done",
    data: {},
    parent_id: "file-1",
    parent_idx: 1,
  }

  const taskA: KNode = {
    ...base,
    id: "task-a",
    type: "p",
    item: { list: "-", task: { status: "todo", marker: "[ ]" } },
    content: "Task A",
    data: {},
    parent_id: "col1",
    parent_idx: 0,
  }

  const taskB: KNode = {
    ...base,
    id: "task-b",
    type: "p",
    item: { list: "-", task: { status: "todo", marker: "[ ]" } },
    content: "Task B",
    data: {},
    parent_id: "col1",
    parent_idx: 1,
  }

  const taskC: KNode = {
    ...base,
    id: "task-c",
    type: "p",
    item: { list: "-", task: { status: "done", marker: "[x]" } },
    content: "Task C",
    data: {},
    parent_id: "col2",
    parent_idx: 0,
  }

  return [fileNode, col1, col2, taskA, taskB, taskC]
}

describe("Bug: hide_node should hide column (km-tui.hide-broken)", () => {
  let tmpDir: string | null = null

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("computeHiddenPath produces correct path for mdsection column node", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const col1 = repo.getNode("col1")!
    expect(col1).toBeTruthy()

    const hiddenPath = computeHiddenPath(col1, repo)
    // mdsection node should produce "parentFile#slug" format
    expect(hiddenPath).toBe("tasks.md#todo")
  })

  test("computeHiddenPath for card node differs from column node", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const taskA = repo.getNode("task-a")!
    const col1 = repo.getNode("col1")!

    const cardPath = computeHiddenPath(taskA, repo)
    const colPath = computeHiddenPath(col1, repo)

    // Card and column should produce different hidden paths
    expect(cardPath).not.toBe(colPath)
    // Card is nested: "tasks.md#todo/task-a"
    expect(cardPath).toBe("tasks.md#todo/task-a")
    // Column: "tasks.md#todo"
    expect(colPath).toBe("tasks.md#todo")
  })

  test("isHidden matches column node after ignoring column (not card)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const col1 = repo.getNode("col1")!
    const colPath = computeHiddenPath(col1, repo)!

    // Simulate writing the column's hidden path
    const hiddenPaths = new Set([colPath])
    expect(isHidden(hiddenPaths, col1, repo)).toBe(true)
  })

  test("isHidden does NOT match column node when card was hidden instead", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const taskA = repo.getNode("task-a")!
    const col1 = repo.getNode("col1")!
    const cardPath = computeHiddenPath(taskA, repo)!

    // If we wrote the card's path, the column should NOT match
    const hiddenPaths = new Set([cardPath])
    expect(isHidden(hiddenPaths, col1, repo)).toBe(false)
  })

  test("hiding column at card level writes column hidden path and hides column", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const { board } = testEnvWithRepo(repo, "file-1", {
      columns: 80,
      rows: 24,
    })

    // Verify initial state: both columns visible, cursor on first card
    const before = board.screenshot()
    expect(before).toContain("Todo")
    expect(before).toContain("Done")
    expect(before).toContain("Task A")

    // hide_node is unbound in v2 keybindings — invoke addHidden directly
    // to simulate what handleHideNode does (always hides at column level)
    const col1 = repo.getNode("col1")!
    const hiddenPath = computeHiddenPath(col1, repo)!
    addHidden(tmpDir, hiddenPath)

    // Verify the .km/hidden file was written with the COLUMN path
    const hiddenFilePath = join(tmpDir, ".km", "hidden")
    expect(existsSync(hiddenFilePath)).toBe(true)
    const hiddenContent = readFileSync(hiddenFilePath, "utf-8")
    // Should contain column path (tasks.md#todo), NOT card path (tasks.md#todo/task-a)
    expect(hiddenContent).toContain("tasks.md#todo")
    expect(hiddenContent).not.toContain("tasks.md#todo/task-a")

    // Bump hiddenVersion to invalidate the readBoardHidden memo cache,
    // then press a key to flush the React render tree
    board.setUI((prev) => ({ hiddenVersion: prev.hiddenVersion + 1 }))
    board.command("cursor_right") // navigate right to trigger re-render

    // The "Todo" column header (§ Todo) should be hidden after ignoring.
    const after = board.screenshot()
    expect(after).not.toContain("§ Todo")
    // The "Done" column should still be visible
    expect(after).toContain("§ Done")
    expect(after).toContain("Task C")
  })

  test("ignoring column at header level also hides column", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const { board } = testEnvWithRepo(repo, "file-1", {
      columns: 80,
      rows: 24,
    })

    const headerView = board.screenshot()
    expect(headerView).toContain("Todo")

    // hide_node is unbound in v2 keybindings — invoke addHidden directly
    const col1 = repo.getNode("col1")!
    const hiddenPath = computeHiddenPath(col1, repo)!
    addHidden(tmpDir, hiddenPath)

    // The .km/hidden file should exist with the column path
    const hiddenFilePath = join(tmpDir, ".km", "hidden")
    expect(existsSync(hiddenFilePath)).toBe(true)
    const hiddenContent = readFileSync(hiddenFilePath, "utf-8")
    expect(hiddenContent).toContain("tasks.md#todo")

    // Bump hiddenVersion to invalidate the readBoardHidden memo cache,
    // then press a key to flush the React render tree
    board.setUI((prev) => ({ hiddenVersion: prev.hiddenVersion + 1 }))
    board.command("cursor_right") // navigate to trigger re-render

    // The "Todo" column header (§ Todo) should be hidden
    const after = board.screenshot()
    expect(after).not.toContain("§ Todo")
    // The "Done" column should still be visible
    expect(after).toContain("§ Done")
  })
})

// =============================================================================
// Filter hidden count indicator (km-tui.filter-hidden-count)
// =============================================================================

/**
 * Filter hidden count indicator tests.
 *
 * When items are hidden by filters (text filter, property filters),
 * a dim "+N hidden" indicator appears as a listFooter inside VirtualList,
 * right after the last visible card. When cards overflow the viewport,
 * the footer scrolls with the content and is only visible at the bottom.
 */

/** Open and close filter dialog to flush Zustand → React render cycle */
function flushFilter(board: { press: (key: string) => void; command: (cmd: string) => void }) {
  board.command("filter")
  board.press("Escape")
}

describe("filter hidden count indicator", () => {
  test("shows +N hidden when text filter hides cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Buy groceries"),
            item("Fix bug in auth"),
            item("Fix login page"),
            item("Write documentation"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("more cards")

    // Apply text filter that hides 2 of 4 cards
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    screen = board.screenshot()
    // 2 of 4 cards match "Fix", so 2 are hidden
    expect(screen).toContain("+2 more cards")
  })

  test("hidden indicator disappears when filter is cleared", () => {
    const { board } = testEnv(
      () => item("board", item("Tasks", item("Buy groceries"), item("Fix bug"), item("Write docs"))),
      { columns: 80, rows: 24 },
    )

    // Apply filter
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    let screen = board.screenshot()
    expect(screen).toContain("+2 more cards")

    // Clear filter
    board.setUI({ filterText: "" })
    flushFilter(board)

    screen = board.screenshot()
    expect(screen).not.toContain("more cards")
  })

  test("no hidden indicator when all cards match filter", () => {
    const { board } = testEnv(() => item("board", item("Tasks", item("Fix bug"), item("Fix login"))), {
      columns: 80,
      rows: 24,
    })

    // Apply filter that matches all cards
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    expect(screen).not.toContain("more cards")
  })

  test("hidden indicator appears right after last card, not at screen bottom", () => {
    // With a tall terminal (40 rows) and only 2 visible cards, the "+N hidden"
    // indicator should appear right after the cards, not at row 39.
    const { board } = testEnv(
      () => item("board", item("Tasks", item("Fix bug"), item("Buy milk"), item("Write docs"), item("Fix login"))),
      { columns: 80, rows: 40 },
    )

    // Apply filter that shows 2 of 4 cards
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    expect(screen).toContain("+2 more cards")

    // Find the line containing "+2 more cards" — it should appear right after the 2 visible cards.
    // Layout: top bar (1) + spacer (1) + header (1) + separator (1) + 2 cards * ~5 rows = ~14.
    // Plus 1 blank line in the hidden indicator = ~15. Allow margin for spacing.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+2 more cards"))
    expect(hiddenLineIdx).toBeGreaterThan(0) // Not first line
    expect(hiddenLineIdx).toBeLessThan(18) // Right after the 2 cards, not at screen bottom
  })

  test("shows +N hidden when vd (toggle hide done) hides done tasks", () => {
    // Create a board with 2 todo tasks and 1 done task
    const nodes = item("board", item("Tasks", item("todo1"), item("todo2"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("more cards")
    expect(screen).toContain("doneTask")

    // Press vd to hide done tasks
    board.command("toggle_hide_done")

    screen = board.screenshot()
    expect(screen).toContain("todo1")
    expect(screen).toContain("todo2")
    expect(screen).not.toContain("doneTask")
    expect(screen).toContain("+1 more cards")

    // Verify the indicator appears right after the cards, not with a large gap.
    // Layout: top bar (1) + spacer (1) + header (1) + separator (1) + 2 cards * ~5 rows = ~14.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+1 more cards"))
    expect(hiddenLineIdx).toBeLessThan(18)
  })

  test("shows hidden count for done descendants inside heading cards", () => {
    // Simulates Asana vault structure: heading cards contain done task children.
    // Top-level cards (headings) don't have task_status, so card-level filter
    // doesn't remove them. But done children within are hidden by TreeNode filter.
    // The hidden count should reflect these descendant-level hidden items.
    const nodes = item("board", item("Col", item("Section A", item("todoChild"), item("doneChild"))))
    const doneNode = nodes.find((n) => n.id === "doneChild")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // No hidden indicator initially
    expect(board.screenshot()).not.toContain("more cards")

    // Press vd to hide done tasks
    board.command("toggle_hide_done")

    const screen = board.screenshot()
    // The done child should be hidden, so we should see +1 hidden
    expect(screen).toContain("+1 more cards")
    // The todo child should still be visible
    expect(screen).toContain("todoChild")
  })

  test("shows hidden indicator per column independently", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Tasks", item("Fix bug"), item("Buy milk"), item("Fix login")),
          item("Notes", item("Fix design"), item("Meeting notes")),
        ),
      { columns: 120, rows: 24 },
    )

    // Apply filter "Fix" — Tasks: 1 hidden (Buy milk), Notes: 1 hidden (Meeting notes)
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()
    // Both columns should show "+1 more cards"
    const matches = screen.match(/\+1 more cards/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(2)
  })

  test("hidden indicator positioned near cards, not at screen bottom (tall terminal, few visible)", () => {
    // 6 cards total, filter leaves only 2 visible. With rows=40, the +4 hidden
    // indicator should appear right after the 2 visible cards, not at the bottom.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Tasks",
            item("Fix auth bug"),
            item("Buy groceries"),
            item("Fix login page"),
            item("Write documentation"),
            item("Clean kitchen"),
            item("Read book"),
          ),
        ),
      { columns: 80, rows: 40 },
    )

    // No hidden indicator initially
    let screen = board.screenshot()
    expect(screen).not.toContain("more cards")

    // Apply text filter that shows only the 2 "Fix" cards, hiding 4
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    screen = board.screenshot()
    expect(screen).toContain("+4 more cards")

    // The indicator should be near the top of the screen (close to the 2 visible cards),
    // not near the bottom (row 39). With header + separator + 2 cards, expect it
    // somewhere around rows 8-15, definitely not past row 20.
    const lines = screen.split("\n")
    const hiddenLineIdx = lines.findIndex((l) => l.includes("+4 more cards"))
    expect(hiddenLineIdx).toBeGreaterThan(0)
    expect(hiddenLineIdx).toBeLessThan(20) // Well above the screen bottom (row 39)

    // Also verify it's NOT near the screen bottom
    expect(hiddenLineIdx).toBeLessThan(lines.length - 10)
  })

  test("hidden count appears as listFooter inside VirtualList after last card", () => {
    // The hidden count indicator is rendered as a listFooter inside VirtualList.
    // With few enough visible cards, both the cards and the footer are visible
    // without scrolling. With many visible cards that overflow, the footer is
    // at the end of scrollable content (only visible when scrolled to bottom).
    //
    // This test uses 3 visible + 5 hidden cards so everything fits in viewport.
    const cards = [
      item("Fix bug 1"),
      item("Fix bug 2"),
      item("Fix bug 3"),
      item("Buy milk"),
      item("Buy bread"),
      item("Buy eggs"),
      item("Read novel"),
      item("Clean house"),
    ]
    const { board } = testEnv(() => item("board", item("Tasks", ...cards)), {
      columns: 80,
      rows: 24,
    })

    // Apply text filter — 3 "Fix" cards visible, 5 others hidden
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()

    // Hidden count should show +5 hidden (rendered as listFooter inside VirtualList)
    expect(screen).toContain("+5 more cards")

    // 3 cards fit easily in 24 rows, so no overflow indicator
    expect(screen).not.toContain("▼")

    // The hidden indicator should appear right after the 3 cards, not at screen bottom
    const lines = screen.split("\n")
    const hiddenIdx = lines.findIndex((l) => l.includes("+5 more cards"))
    expect(hiddenIdx).toBeGreaterThan(0)
    expect(hiddenIdx).toBeLessThan(18) // Well above row 23
  })

  test("overflow indicator appears when many filtered cards exceed viewport", () => {
    // When many cards match the filter and overflow the viewport, the ▼ overflow
    // indicator appears. The hidden count footer is at the end of scrollable
    // content (not visible when scrolled to top).
    const cards = [
      item("Fix bug 1"),
      item("Fix bug 2"),
      item("Fix bug 3"),
      item("Fix bug 4"),
      item("Fix bug 5"),
      item("Fix bug 6"),
      item("Fix bug 7"),
      item("Fix bug 8"),
      item("Fix bug 9"),
      item("Fix bug 10"),
      item("Buy milk"),
      item("Buy bread"),
      item("Buy eggs"),
      item("Read novel"),
      item("Clean house"),
    ]
    const { board } = testEnv(() => item("board", item("Tasks", ...cards)), {
      columns: 80,
      rows: 24,
    })

    // Apply text filter — 10 "Fix" cards visible, 5 others hidden
    board.setUI({ filterText: "Fix" })
    flushFilter(board)

    const screen = board.screenshot()

    // VirtualList overflow indicator ▼ should appear since 10 cards
    // won't fit in 24 rows
    expect(screen).toContain("▼")

    // The +5 hidden footer is inside the scroll container at the end,
    // so it's NOT visible when scrolled to top with overflow
    expect(screen).not.toContain("+5 more cards")
  })
})
