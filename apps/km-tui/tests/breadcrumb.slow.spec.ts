/**
 * Breadcrumb Navigation Journey Tests
 *
 * User-level journey specs for the top-bar breadcrumb trail. Complements
 * breadcrumb.slow.test.ts which focuses on ANSI replay correctness, ghost
 * prefix regression (km-axswu), and multi-line text bleed (km-silvery.zoom-mismatch).
 *
 * These journey tests cover the user stories:
 * - Zoom in to a card, breadcrumb shows ancestor path
 * - Navigate columns, breadcrumb updates to show current column
 * - Zoom out, breadcrumb reflects the parent level
 * - Long breadcrumb paths truncate with ellipsis
 * - Breadcrumb updates correctly through multi-level zoom sequences
 *
 * Key bindings:
 *   z = zoom in (enter card/column as board)
 *   Z = zoom out (return to parent level)
 *   h/l = move between columns
 *   j/k = move between cards / levels
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Breadcrumb Navigation Journeys", () => {
  test("zoom into a card, breadcrumb shows full ancestor path", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Projects", item("Frontend", item("react-app"), item("vue-app")), item("Backend", item("api-server"))),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Initial breadcrumb shows board
    const initialTopBar = app.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Step 2: Zoom into Frontend (cursor starts on first card)
    await app.command("zoom_inwards")
    app.expect("#react-app").toExist()

    // Step 3: Breadcrumb should show the ancestor path
    const zoomedTopBar = app.q("#top-bar").textContent()
    expect(zoomedTopBar).toContain("board")
    expect(zoomedTopBar).toContain("Projects")
    expect(zoomedTopBar).toContain("Frontend")
  })

  test("navigate columns with h/l, breadcrumb updates current column", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Inbox", item("msg1"), item("msg2")),
        item("Projects", item("proj1")),
        item("Archive", item("old1")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Initially on Inbox
    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Inbox")

    // Step 2: Move to Projects column
    await app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Projects")

    // Step 3: Move to Archive column
    await app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Archive")

    // Step 4: Move back to Projects
    await app.command("cursor_left")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Projects")
    // Should not contain ghost chars from Archive
    expect(topBar).not.toContain("AProjects")
  })

  test("zoom out with Z, breadcrumb reflects parent level", async () => {
    using app = createTestApp(
      item("board", item("col", item("level1", item("level2", item("deep-a"), item("deep-b"))))),
      { cols: 120, rows: 24 },
    )

    // Step 1: Zoom in twice
    await app.command("zoom_inwards") // into level1
    await app.command("zoom_inwards") // into level2
    app.expect("#deep-a").toExist()

    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level2")

    // Step 2: Zoom out once
    await app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level1")

    // Step 3: Zoom out again — back to root board
    await app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("board")
    app.expect("#col").toExist()
  })

  test("long breadcrumb path truncates with ellipsis on narrow terminal", async () => {
    using app = createTestApp(
      item(
        "VeryLongBoardName",
        item(
          "VeryLongColumnName",
          item("VeryLongSectionName", item("VeryLongSubsection", item("leaf-a"), item("leaf-b"))),
        ),
      ),
      { cols: 60, rows: 24 },
    )

    // Step 1: Zoom deep so the full path is longer than 60 chars
    await app.command("zoom_inwards") // into VeryLongSectionName
    await app.command("zoom_inwards") // into VeryLongSubsection

    // Step 2: Breadcrumb should truncate with ellipsis
    const topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("\u22EF") // ellipsis character

    // Step 3: The deepest visible segment should still be present
    expect(topBar).toContain("leaf-a")
  })

  test("breadcrumb path uses > separator for hierarchy within board", async () => {
    using app = createTestApp(item("board", item("col", item("card", item("sub1"), item("sub2")))), {
      cols: 120,
      rows: 24,
    })

    // Step 1: Navigate to card level
    await app.command("cursor_down")
    const topBar = app.q("#top-bar").textContent()

    // Step 2: Path segments should be separated by >
    expect(topBar).toContain("board")
    expect(topBar).toContain("col")
    expect(topBar).toContain("card")
    expect(topBar).toContain(">")
  })

  test("zoom in, navigate columns, zoom out — breadcrumb stays consistent", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Work", item("Sprint-1", item("feat-a"), item("feat-b")), item("Sprint-2", item("feat-c"))),
        item("Personal", item("hobby")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Zoom into Work
    await app.command("cursor_up") // to column header
    await app.command("zoom_inwards")
    app.expect("#Sprint-1").toExist()

    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Work")

    // Step 2: Navigate to Sprint-2 column
    await app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Sprint-2")

    // Step 3: Navigate back to Sprint-1
    await app.command("cursor_left")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Sprint-1")

    // Step 4: Zoom out back to root
    await app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("board")
    app.expect("#Work").toExist()
    app.expect("#Personal").toExist()
  })

  // This test stays on testEnv: uses board.expectNoGhostChars() which is not exposed by createTestApp.
  test("breadcrumb has no ghost characters after rapid navigation", () => {
    const { board } = testEnv(
      () =>
        item("board", item("Calendar", item("event1")), item("inbox", item("item1")), item("TaskNotes", item("note1"))),
      { columns: 100, rows: 24 },
    )

    // Step 1: Rapid h/l navigation
    board.command("cursor_right") // inbox
    board.command("cursor_right") // TaskNotes
    board.command("cursor_left") // inbox
    board.command("cursor_left") // Calendar
    board.command("cursor_right") // inbox
    board.command("cursor_right") // TaskNotes

    // Step 2: Top bar should cleanly show TaskNotes without ghost chars
    const topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("TaskNotes")
    expect(topLine).not.toContain("iTaskNotes")
    expect(topLine).not.toContain("CTaskNotes")

    // Step 3: Navigate back and verify no ghost prefix
    board.command("cursor_left")
    const topLine2 = board.screenshot().split("\n")[0] ?? ""
    expect(topLine2).toContain("inbox")
    expect(topLine2).not.toContain("Tinbox")
    expect(topLine2).not.toContain("Cinbox")

    // Step 4: Buffer-level check for ghost characters in top bar
    board.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})
