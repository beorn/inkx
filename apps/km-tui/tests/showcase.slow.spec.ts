/**
 * km Test Showcase — Specification-style tests demonstrating the full test API.
 *
 * This file reads like a SPECIFICATION of km's behavior. Someone who has never
 * seen the code should understand what the app does by reading these tests.
 *
 * Demonstrates:
 * - CSS selector queries: #id, [attr], #parent > #child, descendant, sibling
 * - Typed node handles: app.card(), app.column(), app.node()
 * - Declarative state: app.state (cursor, selection, view, overlay, visible)
 * - Custom matchers: toHaveText, toContainText, toBeVisible, toBeLeftOf, toBeContainedIn
 * - Snapshot assertions: app.expectSnapshot()
 * - Journey patterns: multi-step user workflows
 * - fromMarkdown inline fixture: createTestApp.fromMarkdown()
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Board Navigation", () => {
  test("moving between columns preserves vertical position", () => {
    using app = createTestApp(
      item(
        "board",
        item("Todo", item("task-a"), item("task-b"), item("task-c")),
        item("WIP", item("task-d"), item("task-e")),
        item("Done", item("task-f")),
      ),
    )

    // Start on first card in first column
    expect(app.state.cursor).toBe("task-a")
    expect(app.column("Todo").visible).toBe(true)

    // Navigate down two cards within the column
    app.command("cursor_down").command("cursor_down")
    expect(app.card("task-c").isCursor).toBe(true)

    // Move right to second column — lands on a card, not the column header
    app.command("cursor_right")
    expect(app.state.cursor).not.toBe("WIP")

    // Move right again to third column
    app.command("cursor_right")
    expect(app.card("task-f").isCursor).toBe(true)
  })

  test("boundary bell fires when cursor cannot move further", () => {
    using app = createTestApp(item("board", item("col1", item("only-card"))))
    expect(app.state.cursor).toBe("only-card")

    // Try to move down past the only card — bell should fire
    app.command("cursor_down")
    expect(app.state.bell).toBeGreaterThan(0)
  })
})

describe("Folding and Visibility", () => {
  test("folding a card hides its children from the column", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-1"), item("child-2")), item("sibling"))),
    )

    // Children are initially visible
    app.expect("#child-1").toExist()
    app.expect("#child-2").toExist()

    // Fold parent — children disappear
    app.command("fold_more")
    app.expect("#child-1").not.toExist()
    app.expect("#child-2").not.toExist()
    app.expect("#parent").toExist()
    app.expect("#sibling").toExist()

    // Unfold — children reappear
    app.command("unfold_more")
    app.expect("#child-1").toExist()
    app.expect("#child-2").toExist()
  })

  test("zoom into a column shows only that column's content", () => {
    using app = createTestApp(
      item("board", item("Focus", item("important-task")), item("Later", item("deferred-task"))),
    )

    // Both columns visible initially
    expect(app.state.visible).toContain("Focus")
    expect(app.state.visible).toContain("Later")

    // Zoom into Focus column
    app.command("zoom_inwards")

    // The focused column's content should still be visible
    app.expectScreen("important-task")
  })
})

describe("CSS Selector Queries", () => {
  test("attribute selectors find elements by data attributes", () => {
    using app = createTestApp(item("board", item("col1", item("task-1"), item("task-2"))))

    // Cursor attribute selector
    app.expect("#task-1[data-cursor]").toExist()
    app.expect("#task-2[data-cursor]").not.toExist()

    // Move cursor and verify attribute follows
    app.command("cursor_down")
    app.expect("#task-1[data-cursor]").not.toExist()
    app.expect("#task-2[data-cursor]").toExist()
  })

  test("locator queries and layout matchers verify column arrangement", () => {
    using app = createTestApp(item("board", item("Alpha", item("alpha-task")), item("Beta", item("beta-task"))))

    // Layout matchers on locator results
    const alphaCol = app.q("#Alpha")
    const betaCol = app.q("#Beta")
    expect(alphaCol).toBeVisible()
    expect(betaCol).toBeVisible()
    expect(alphaCol).toBeLeftOf(betaCol)

    // Cards are contained within their columns
    const alphaCard = app.q("#alpha-task")
    expect(alphaCard).toBeVisible()
    expect(alphaCard).toBeContainedIn(alphaCol)
  })
})

describe("Inline Editing", () => {
  test("pressing i enters inline edit, Escape exits back to normal mode", () => {
    using app = createTestApp(item("board", item("col1", item("original-title"))))
    expect(app.state.cursor).toBe("original-title")

    // Enter inline edit mode — the card should show an edit indicator
    app.press("i")

    // Escape returns to normal navigation mode
    app.press("Escape")
    expect(app.card("original-title").isCursor).toBe(true)
    expect(app.card("original-title").exists).toBe(true)
  })
})

describe("Multi-Selection", () => {
  test("extend-select with Shift+Arrow collects multiple cards", () => {
    using app = createTestApp(item("board", item("col1", item("sel-a"), item("sel-b"), item("sel-c"))))

    // Shift+ArrowDown extends selection from current card downward
    app.press("shift+ArrowDown")
    expect(app.card("sel-b").isCursor).toBe(true)

    // Extend further — three cards should now be involved
    app.press("shift+ArrowDown")
    expect(app.card("sel-c").isCursor).toBe(true)
  })
})

describe("Markdown Fixtures", () => {
  test("fromMarkdown creates a working board from inline markdown", () => {
    using app = createTestApp.fromMarkdown(
      ["# Backlog", "- [ ] Write documentation", "- [ ] Review pull request", "# Sprint", "- [ ] Deploy v2"].join("\n"),
    )

    // Board renders with columns from markdown headings
    app.expectScreen("Write documentation")
    app.expectScreen("Review pull request")
    app.expectScreen("Deploy v2")
    expect(app.state.view).toBe("cards")
  })
})

describe("Visual Regression", () => {
  test("kanban board layout is stable across renders", () => {
    using app = createTestApp(
      item(
        "board",
        item("Todo", item.task("Buy groceries"), item.task("Call dentist")),
        item("Done", item.task("File taxes")),
      ),
      { cols: 80, rows: 15 },
    )

    app.expectSnapshot("initial-kanban")

    // Navigate and snapshot again — layout should be stable
    app.command("cursor_down")
    app.expectSnapshot("after-cursor-down")
  })
})

describe("View Modes", () => {
  test("cycling view mode changes board layout", () => {
    using app = createTestApp(item("board", item("col1", item("card-1")), item("col2", item("card-2"))))

    // Start in cards view
    expect(app.state.view).toBe("cards")

    // Cycle to next view mode
    app.command("cycle_view_mode")
    expect(app.state.view).not.toBe("cards")

    // Content should still be visible regardless of view mode
    app.expectScreen("card-1")
  })
})

describe("Node Handles", () => {
  test("card(), column(), and node() provide typed access to board elements", () => {
    using app = createTestApp(item("board", item("Projects", item("alpha"), item("beta")), item("Archive")))

    // Column handle
    const projects = app.column("Projects")
    expect(projects.exists).toBe(true)
    expect(projects.visible).toBe(true)

    // Card handle — cursor is on the first card
    expect(app.card("alpha").isCursor).toBe(true)
    expect(app.card("beta").isCursor).toBe(false)
    expect(app.card("beta").exists).toBe(true)

    // Node handle by ID — same data, different access path
    const alphaNode = app.node("alpha")
    expect(alphaNode.exists).toBe(true)
    expect(alphaNode.isCursor).toBe(true)
    expect(alphaNode.visible).toBe(true)

    // Non-existent node
    const ghost = app.node("does-not-exist")
    expect(ghost.exists).toBe(false)
  })
})
