/**
 * Column Collapse Journey Tests
 *
 * User-level journey specs for column collapse/uncollapse operations.
 * Complements collapse.slow.test.ts which focuses on rendering integrity,
 * border symmetry, width, and incremental render consistency.
 *
 * These journey tests cover the user stories:
 * - Collapse a column via `c` key, verify it shrinks to 1-char wide
 * - Navigate collapsed columns with h/l
 * - Collapse → uncollapse round-trip preserves cards
 * - Collapse multiple columns, verify layout
 * - Collapse affects breadcrumb display
 *
 * Key bindings:
 *   v c = toggle column collapse
 *   h/l = navigate between columns
 *   j/k = navigate within column / between levels
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Column Collapse Journeys", () => {
  test("collapse a column with v c, verify it shrinks and hides cards", async () => {
    using app = await createTestApp(
      item("board", item("Todo", item("buy-milk"), item("write-tests")), item("Done", item("ship-v1"))),
      { cols: 80, rows: 24 },
    )

    // Step 1: Verify initial state — all cards visible
    app.expect("#buy-milk").toExist()
    app.expect("#write-tests").toExist()
    app.expect("#ship-v1").toExist()

    // Step 2: Collapse Todo column
    await app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 3: Cards inside collapsed column should not be visible on screen
    const screenshot = app.text
    expect(screenshot).not.toContain("buy-milk")
    expect(screenshot).not.toContain("write-tests")

    // Step 4: Other column's cards remain visible
    expect(screenshot).toContain("ship-v1")

    // Step 5: Collapsed column should be narrow (<=5 chars wide)
    const collapsed = app.q("[data-collapsed]")
    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  test("navigate between collapsed and expanded columns with h/l", async () => {
    using app = await createTestApp(
      item.root(
        "board",
        item("Alpha", item("a1"), item("a2")),
        item("Beta", item("b1"), item("b2")),
        item("Gamma", item("c1")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse Alpha column
    await app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 2: Navigate right to Beta — cursor should land on a Beta card
    await app.command("cursor_right")
    let cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("b1")

    // Step 3: Navigate right to Gamma
    await app.command("cursor_right")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("c1")

    // Step 4: Navigate left back through Beta to collapsed Alpha
    await app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("b1")

    await app.command("cursor_left")
    // Should land on collapsed Alpha's column header
    cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    app.expect("[data-collapsed][data-cursor]").toExist()
  })

  test("collapse then uncollapse round-trip restores all cards", async () => {
    using app = await createTestApp(
      item(
        "board",
        item("Projects", item("redesign"), item("migration"), item("cleanup")),
        item("Archive", item("old-stuff")),
      ),
      { cols: 80, rows: 24 },
    )

    // Step 1: Verify all cards visible initially
    app.expect("#redesign").toExist()
    app.expect("#migration").toExist()
    app.expect("#cleanup").toExist()

    // Step 2: Collapse Projects column
    await app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()
    expect(app.text).not.toContain("redesign")

    // Step 3: Uncollapse Projects column
    await app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)

    // Step 4: All cards should be visible again
    app.expect("#redesign").toExist()
    app.expect("#migration").toExist()
    app.expect("#cleanup").toExist()

    // Step 5: Cursor should be on a valid card in the uncollapsed column
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("collapse multiple columns independently, verify layout changes", async () => {
    using app = await createTestApp(
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
        item("col3", item("task-c")),
        item("col4", item("task-d")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse col1
    await app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // Step 2: Navigate to col3 and collapse it
    await app.command("cursor_right") // col2
    await app.command("cursor_right") // col3
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")
    await app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(2)

    // Step 3: Verify col2 and col4 cards are still visible
    const screenshot = app.text
    expect(screenshot).toContain("task-b")
    expect(screenshot).toContain("task-d")

    // Step 4: Verify col1 and col3 cards are hidden
    expect(screenshot).not.toContain("task-a")
    expect(screenshot).not.toContain("task-c")

    // Step 5: Expanded columns should get more space from collapsed siblings
    const col2Box = app.q("#col2").boundingBox()
    const col4Box = app.q("#col4").boundingBox()
    expect(col2Box).not.toBeNull()
    expect(col4Box).not.toBeNull()
    // With 2 of 4 columns collapsed, remaining columns should be wider than ~30 chars each
    expect(col2Box!.width).toBeGreaterThan(30)
    expect(col4Box!.width).toBeGreaterThan(30)
  })

  test("collapse column, navigate away, come back — column stays collapsed", async () => {
    using app = await createTestApp(
      item.root(
        "board",
        item("Inbox", item("new-item"), item("urgent")),
        item("Doing", item("active-task")),
        item("Review", item("pr-42")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse Inbox
    await app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 2: Navigate to Review column
    await app.command("cursor_right") // Doing
    await app.command("cursor_right") // Review
    let cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("pr-42")

    // Step 3: Navigate back to Doing
    await app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("active-task")

    // Step 4: Navigate back to collapsed Inbox
    await app.command("cursor_left")
    app.expect("[data-collapsed][data-cursor]").toExist()

    // Step 5: Inbox should still be collapsed
    expect(app.q("[data-collapsed]").count()).toBe(1)
    expect(app.text).not.toContain("new-item")
    expect(app.text).not.toContain("urgent")
  })

  test("collapsed column cursor is on header, j/k does not enter column", async () => {
    using app = await createTestApp(
      item("board", item("col1", item("task-a"), item("task-b"), item("task-c")), item("col2", item("other"))),
      { cols: 80, rows: 24 },
    )

    // Step 1: Collapse col1
    await app.command("toggle_collapse")
    app.expect("[data-collapsed][data-cursor]").toExist()

    // Step 2: Press j — should NOT enter the collapsed column
    await app.command("cursor_down")
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)

    // Step 3: Press k — should also not drill into collapsed column
    await app.command("cursor_up")
    expect(app.q("[data-cursor]").count()).toBe(1)

    // Step 4: Cards should remain hidden
    expect(app.text).not.toContain("task-a")
    expect(app.text).not.toContain("task-b")
  })
})
