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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Cursor prefetch warms adjacent columns
// =============================================================================

describe("cursor prefetch on horizontal navigation", () => {
  test("rapid h/l navigation across 5 columns lands on correct final position", () => {
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
    app.command("cursor_right")
    app.command("cursor_right")
    app.command("cursor_right")
    app.command("cursor_right")
    app.expect("#5a[data-cursor]").toExist()

    // Navigate back left rapidly
    app.command("cursor_left")
    app.command("cursor_left")
    app.command("cursor_left")
    app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()
  })

  test("h/l navigation with mixed j/k between columns renders correctly", () => {
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
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Move right to col2 — stickyY should position near 1b
    app.command("cursor_right")
    expect(app.text).toContain("2a")
    expect(app.text).toContain("2b")

    // Move right again to col3
    app.command("cursor_right")
    expect(app.text).toContain("3a")

    // Move back left twice
    app.command("cursor_left")
    app.command("cursor_left")
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
    expect(app.text).toContain("1c")
  })

  test("rapid l-l-h-l-h-h sequence preserves cursor and rendering", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 20 })

    app.expect("#1a[data-cursor]").toExist()

    // Rapid back-and-forth
    app.command("cursor_right") // -> col2
    app.command("cursor_right") // -> col3
    app.command("cursor_left") // -> col2
    app.command("cursor_right") // -> col3
    app.command("cursor_left") // -> col2
    app.command("cursor_left") // -> col1

    app.expect("#1a[data-cursor]").toExist()

    // Screen should render without artifacts — cursor is on col1,
    // so col1 and col2 should be visible at minimum
    expect(app.text).toContain("col1")
    expect(app.text).toContain("col2")
  })

  test("prefetch fires after horizontal nav without errors", () => {
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
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Subsequent vertical navigation should work — depends on column data
    app.command("cursor_down")
    app.expect("#2b[data-cursor]").toExist()

    // Navigate to col3 — if prefetch corrupted col3 data, this would fail
    app.command("cursor_right")
    app.expect("#3b[data-cursor]").toExist()

    // Navigate back to col1
    app.command("cursor_left")
    app.command("cursor_left")
    expect(app.text).toContain("1a")
  })

  test("horizontal nav across boundary doesn't cause errors", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
      cols: 80,
      rows: 20,
    })

    // Navigate to right boundary
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Try to go further right — should hit boundary, no crash
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Navigate left
    app.command("cursor_left")
    app.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // h at column header is boundary, no crash
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()
  })
})

// =============================================================================
// Multiple rapid mutations (repo.touch) don't crash
// =============================================================================

describe("rapid repo.touch() coalescing", () => {
  test("5 rapid touch() calls don't crash the board", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))), {
      cols: 80,
      rows: 20,
    })

    // Board renders correctly initially
    app.expect("#1a[data-cursor]").toExist()
    app.expectScreen("1a")

    // Fire 5 rapid touch() calls (simulating background link resolution)
    act(() => {
      app.repo.touch()
      app.repo.touch()
      app.repo.touch()
      app.repo.touch()
      app.repo.touch()
    })

    // Flush React updates
    app.press("")

    // Board should still render correctly after rapid touches
    app.expectScreen("1a")
    app.expectScreen("1b")
    app.expectScreen("2a")
  })

  test("touch() between navigation steps doesn't break cursor", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
      { cols: 80, rows: 20 },
    )

    app.expect("#1a[data-cursor]").toExist()

    // Navigate down
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()

    // Simulate background mutation
    act(() => {
      app.repo.touch()
    })
    app.press("")

    // Cursor should still be on 1b
    app.expect("#1b[data-cursor]").toExist()

    // Navigate right to col2
    app.command("cursor_right")

    // Simulate another background mutation
    act(() => {
      app.repo.touch()
    })
    app.press("")

    // Board should still render correctly
    app.expectScreen("col1")
    app.expectScreen("col2")
  })

  test("rapid touch() with no actual data changes preserves rendering", () => {
    using app = createTestApp(item("board", item("col1", item("task-1"), item("task-2"), item("task-3"))), {
      cols: 60,
      rows: 20,
    })

    app.expectScreen("task-1")
    app.expectScreen("task-2")
    app.expectScreen("task-3")

    // Rapid touches without data changes
    act(() => {
      for (let i = 0; i < 10; i++) {
        app.repo.touch()
      }
    })
    app.press("")

    app.expectScreen("task-1")
    app.expectScreen("task-2")
    app.expectScreen("task-3")
  })

  test("touch() during horizontal navigation doesn't cause rendering issues", () => {
    using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 20 })

    // Navigate right
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Simulate rapid background mutations during navigation
    act(() => {
      app.repo.touch()
      app.repo.touch()
      app.repo.touch()
    })

    // Navigate right again
    app.command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()

    // Cursor is on col3 — col2 and col3 should be visible
    app.expectScreen("col2")
    app.expectScreen("col3")
  })
})
