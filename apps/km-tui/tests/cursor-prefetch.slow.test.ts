/**
 * Cursor prefetch and query coalescing tests.
 *
 * Tests:
 * 1. Rapid horizontal navigation (h/l) across columns — verifies prefetch
 *    doesn't break cursor position or rendering.
 * 2. Rapid repo.touch() calls — verifies debounced version coalescing
 *    doesn't crash the board or cause rendering artifacts.
 */

import { describe, test, expect } from "vitest"
import { act } from "react"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Cursor prefetch warms adjacent columns
// =============================================================================

describe("cursor prefetch on horizontal navigation", () => {
  test("rapid h/l navigation across 5 columns lands on correct final position", async () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b")),
        item("col4", item("4a"), item("4b")),
        item("col5", item("5a"), item("5b")),
      ),
      { cols: 120, rows: 20 },
    )

    // Start at col1, first card
    app.expect("#1a[data-cursor]").toExist()

    // Navigate right rapidly through all columns
    await app.command("cursor_right")
    await app.command("cursor_right")
    await app.command("cursor_right")
    await app.command("cursor_right")
    app.expect("#5a[data-cursor]").toExist()

    // Navigate back left rapidly
    await app.command("cursor_left")
    await app.command("cursor_left")
    await app.command("cursor_left")
    await app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("h/l navigation with mixed j/k between columns renders correctly", async () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b"), item("2c")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
      { cols: 100, rows: 20 },
    )

    // Move down in col1
    await app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Move right to col2 — stickyY should position near 1b
    await app.command("cursor_right")
    expect(app.text).toContain("2a")
    expect(app.text).toContain("2b")

    // Move right again to col3
    await app.command("cursor_right")
    expect(app.text).toContain("3a")

    // Move back left twice
    await app.command("cursor_left")
    await app.command("cursor_left")
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
    expect(app.text).toContain("1c")
  })

  test("rapid l-l-h-l-h-h sequence preserves cursor and rendering", async () => {
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 20 })

    app.expect("#1a[data-cursor]").toExist()

    // Rapid back-and-forth
    await app.command("cursor_right") // -> col2
    await app.command("cursor_right") // -> col3
    await app.command("cursor_left") // -> col2
    await app.command("cursor_right") // -> col3
    await app.command("cursor_left") // -> col2
    await app.command("cursor_left") // -> col1

    app.expect("#1a[data-cursor]").toExist()

    // Screen should render without artifacts — cursor is on col1,
    // so col1 and col2 should be visible at minimum
    expect(app.text).toContain("col1")
    expect(app.text).toContain("col2")
  })

  test("prefetch fires after horizontal nav without errors", async () => {
    // The prefetch in handleHorizontalNav uses setTimeout(0) to warm
    // adjacent column children. This test verifies the prefetch doesn't
    // throw or corrupt state by navigating and then performing operations
    // that depend on column data being correct.
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b")),
      ),
      { cols: 100, rows: 20 },
    )

    // Navigate right — triggers prefetch of col1 and col3
    await app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Subsequent vertical navigation should work — depends on column data
    await app.command("cursor_down")
    app.expect("#2b[data-cursor]").toExist()

    // Navigate to col3 — if prefetch corrupted col3 data, this would fail
    await app.command("cursor_right")
    app.expect("#3b[data-cursor]").toExist()

    // Navigate back to col1
    await app.command("cursor_left")
    await app.command("cursor_left")
    expect(app.text).toContain("1a")
  })

  test("horizontal nav across boundary doesn't cause errors", async () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
      cols: 80,
      rows: 20,
    })

    // Navigate to right boundary
    await app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Try to go further right — should hit boundary, no crash
    await app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Navigate left
    await app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header
    await app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // h at column header is boundary, no crash
    await app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()
  })
})

// =============================================================================
// Multiple rapid mutations (repo.touch) don't crash
// =============================================================================

describe("rapid repo.touch() coalescing", () => {
  test("5 rapid touch() calls don't crash the board", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))),
      { columns: 80, rows: 20 },
    )

    // Board renders correctly initially
    board.expect("#1a[data-cursor]").toExist()
    expect(board.screenshot()).toContain("1a")

    // Fire 5 rapid touch() calls (simulating background link resolution)
    act(() => {
      repo.touch()
      repo.touch()
      repo.touch()
      repo.touch()
      repo.touch()
    })

    // Flush React updates
    board.press("")

    // Board should still render correctly after rapid touches
    expect(board.screenshot()).toContain("1a")
    expect(board.screenshot()).toContain("1b")
    expect(board.screenshot()).toContain("2a")
  })

  test("touch() between navigation steps doesn't break cursor", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
      { columns: 80, rows: 20 },
    )

    board.expect("#1a[data-cursor]").toExist()

    // Navigate down
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Simulate background mutation
    act(() => {
      repo.touch()
    })
    board.press("")

    // Cursor should still be on 1b
    board.expect("#1b[data-cursor]").toExist()

    // Navigate right to col2
    board.command("cursor_right")

    // Simulate another background mutation
    act(() => {
      repo.touch()
    })
    board.press("")

    // Board should still render correctly
    const screenshot = board.screenshot()
    expect(screenshot).toContain("col1")
    expect(screenshot).toContain("col2")
  })

  test("rapid touch() with no actual data changes preserves rendering", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("task-1"), item("task-2"), item("task-3"))), {
      columns: 60,
      rows: 20,
    })

    const before = board.screenshot()
    expect(before).toContain("task-1")
    expect(before).toContain("task-2")
    expect(before).toContain("task-3")

    // Rapid touches without data changes
    act(() => {
      for (let i = 0; i < 10; i++) {
        repo.touch()
      }
    })
    board.press("")

    const after = board.screenshot()
    expect(after).toContain("task-1")
    expect(after).toContain("task-2")
    expect(after).toContain("task-3")
  })

  test("touch() during horizontal navigation doesn't cause rendering issues", () => {
    const { board, repo } = testEnv(item.multiColBoard, { columns: 120, rows: 20 })

    // Navigate right
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Simulate rapid background mutations during navigation
    act(() => {
      repo.touch()
      repo.touch()
      repo.touch()
    })

    // Navigate right again
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Cursor is on col3 — col2 and col3 should be visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("col2")
    expect(screenshot).toContain("col3")
  })
})
