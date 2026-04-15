/**
 * Dialog lifecycle tests: open -> confirm and open -> cancel flows.
 *
 * Covers:
 * - DatePromptDialog (td chord -> type date -> Enter/Escape)
 * - SearchDialog (search command -> type query -> Enter/Escape)
 * - NewItemDialog (cmd+shift+Enter -> type name -> Enter/Escape)
 *
 * Each dialog is tested for:
 * 1. Open: dialog appears on screen via [data-dialog="..."] selector
 * 2. Confirm: Enter closes dialog and applies the action
 * 3. Cancel: Escape closes dialog without side effects
 * 4. State reset: dialog selector no longer matches after close
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// ---------------------------------------------------------------------------
// DatePromptDialog lifecycle
// ---------------------------------------------------------------------------

describe("DatePromptDialog lifecycle", () => {
  test("td opens dialog — selector matches and screenshot shows title", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"), item.task("Task2"))))

    app.command("cursor_down") // move to card level
    app.command("set_due_date")

    app.expect("[data-dialog='date-prompt']").toExist()
    expect(app.text).toContain("Set Due Date")
  })

  test("td -> type date -> Enter confirms and closes dialog", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")
    app.command("set_due_date")
    expect(app.text).toContain("Set Due Date")

    // Type a date
    for (const ch of "tomorrow") app.press(ch)

    // Confirm
    app.press("Enter")

    // Dialog closed
    app.expect("[data-dialog='date-prompt']").not.toExist()
    expect(app.text).not.toContain("Set Due Date")

    // Date was applied to the node
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("td -> Escape cancels without setting date", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")
    app.command("set_due_date")
    app.expect("[data-dialog='date-prompt']").toExist()
    expect(app.text).toContain("Set Due Date")

    // Cancel
    app.press("Escape")

    // Dialog closed
    app.expect("[data-dialog='date-prompt']").not.toExist()
    expect(app.text).not.toContain("Set Due Date")

    // No date was set
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
  })

  test("td -> type date -> Escape cancels without applying typed date", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")
    app.command("set_due_date")

    // Type a date but then cancel
    for (const ch of "friday") app.press(ch)
    app.press("Escape")

    // Dialog closed
    app.expect("[data-dialog='date-prompt']").not.toExist()
    expect(app.text).not.toContain("Set Due Date")

    // No date was set
    const col = app.repo.getChildren("board")[0]!
    const task = app.repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
  })

  test("td opens due date dialog and Escape cancels", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")
    app.command("set_due_date")

    app.expect("[data-dialog='date-prompt']").toExist()
    expect(app.text).toContain("Set Due Date")

    app.press("Escape")

    app.expect("[data-dialog='date-prompt']").not.toExist()
    expect(app.text).not.toContain("Set Due Date")
  })
})

// ---------------------------------------------------------------------------
// SearchDialog lifecycle
// ---------------------------------------------------------------------------

describe("SearchDialog lifecycle", () => {
  test("search command opens search dialog — selector matches and screenshot shows title", () => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")

    app.expect("[data-dialog='search']").toExist()
    expect(app.text).toContain("Search")
  })

  test("search -> Escape cancels search dialog", () => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()

    app.press("Escape")

    app.expect("[data-dialog='search']").not.toExist()
  })

  test("search -> type query -> Escape cancels without navigating", () => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")

    // Type a query
    for (const ch of "Alpha") app.press(ch)

    // Cancel
    app.press("Escape")

    // Dialog closed
    app.expect("[data-dialog='search']").not.toExist()

    // Board still shows both tasks (no navigation happened)
    expect(app.text).toContain("Alpha")
    expect(app.text).toContain("Beta")
  })

  test("search -> type query -> Enter confirms search (closes dialog)", () => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha task"), item.task("Beta task"))))

    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()

    // Type a query
    for (const ch of "Alpha") app.press(ch)

    // Confirm
    app.press("Enter")

    // Dialog should be closed after confirm
    app.expect("[data-dialog='search']").not.toExist()
  })
})

// ---------------------------------------------------------------------------
// NewItemDialog lifecycle
// ---------------------------------------------------------------------------

describe("NewItemDialog lifecycle", () => {
  test("cmd+shift+Enter opens new item dialog — selector matches and screenshot shows title", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"), item.task("Task2"))))

    app.command("cursor_down") // move to card level
    app.press("cmd+shift+Enter")

    app.expect("[data-dialog='new-item']").toExist()
    expect(app.text).toContain("New")
  })

  test("cmd+shift+Enter -> Escape cancels new item dialog without creating nodes", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    const col = app.repo.getChildren("board")[0]!
    const nodesBefore = app.repo.getChildren(col.id).length

    app.command("cursor_down")
    app.press("cmd+shift+Enter")
    app.expect("[data-dialog='new-item']").toExist()

    app.press("Escape")

    // Dialog closed
    app.expect("[data-dialog='new-item']").not.toExist()
    expect(app.text).not.toContain("New task")

    // No nodes created
    const nodesAfter = app.repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("cmd+shift+Enter -> type name -> Escape cancels without creating nodes", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    const col = app.repo.getChildren("board")[0]!
    const nodesBefore = app.repo.getChildren(col.id).length

    app.command("cursor_down")
    app.press("cmd+shift+Enter")

    // Type a name but then cancel
    for (const ch of "Groceries") app.press(ch)
    app.press("Escape")

    // Dialog closed
    app.expect("[data-dialog='new-item']").not.toExist()

    // No nodes created
    const nodesAfter = app.repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("cmd+shift+Enter -> type name -> Enter creates the new item", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    const col = app.repo.getChildren("board")[0]!
    const nodesBefore = app.repo.getChildren(col.id).length

    app.command("cursor_down")
    app.press("cmd+shift+Enter")
    app.expect("[data-dialog='new-item']").toExist()

    // Type name
    for (const ch of "Buy milk") app.press(ch)

    // Confirm
    app.press("Enter")

    // Dialog closed
    app.expect("[data-dialog='new-item']").not.toExist()

    // A new node was created
    const nodesAfter = app.repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore + 1)

    // The new node has the correct content
    const children = app.repo.getChildren(col.id)
    const newNode = children.find((n) => n.content === "Buy milk")
    expect(newNode).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Cross-dialog: no state leakage between open/close cycles
// ---------------------------------------------------------------------------

describe("dialog state isolation", () => {
  test("opening one dialog does not show other dialog markers", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    // Open date dialog
    app.command("cursor_down")
    app.command("set_due_date")
    app.expect("[data-dialog='date-prompt']").toExist()
    app.expect("[data-dialog='search']").not.toExist()
    app.expect("[data-dialog='new-item']").not.toExist()

    app.press("Escape")

    // Open search dialog
    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()
    app.expect("[data-dialog='date-prompt']").not.toExist()
    app.expect("[data-dialog='new-item']").not.toExist()

    app.press("Escape")

    // Open new item dialog
    app.press("cmd+shift+Enter")
    app.expect("[data-dialog='new-item']").toExist()
    app.expect("[data-dialog='date-prompt']").not.toExist()
    app.expect("[data-dialog='search']").not.toExist()

    app.press("Escape")

    // All clean
    app.expect("[data-dialog='date-prompt']").not.toExist()
    app.expect("[data-dialog='search']").not.toExist()
    app.expect("[data-dialog='new-item']").not.toExist()
  })

  test("sequential open/cancel cycles leave no dialog open", () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")

    // Cycle 1: date dialog
    app.command("set_due_date")
    app.press("Escape")

    // Cycle 2: search dialog
    app.dispatch("search")
    app.press("Escape")

    // Cycle 3: new item dialog
    app.press("cmd+shift+Enter")
    app.press("Escape")

    // All dialogs closed
    app.expect("[data-dialog='date-prompt']").not.toExist()
    app.expect("[data-dialog='search']").not.toExist()
    app.expect("[data-dialog='new-item']").not.toExist()
  })

  test("confirm in one dialog, then open another — no interference", async () => {
    using app = createTestApp(item("board", item("col1", item.task("Task1"))))

    app.command("cursor_down")

    // Confirm a date
    app.command("set_due_date")
    for (const ch of "tomorrow") app.press(ch)
    app.press("Enter")
    app.expect("[data-dialog='date-prompt']").not.toExist()

    // Now open search — should work cleanly
    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()
    expect(app.text).toContain("Search")

    app.press("Escape")
    app.expect("[data-dialog='search']").not.toExist()
  })
})

// ---------------------------------------------------------------------------
// FavoritesDialog lifecycle
// ---------------------------------------------------------------------------

describe("FavoritesDialog lifecycle", () => {
  test("shift+m opens favorites dialog; Escape closes it", () => {
    // Regression for km-tui.manage-favorites-escape — the Escape binding used
    // to depend on inScope("dialog:favorites"), which wasn't reliably populated
    // in every production path. Now guarded by the direct favoritesDialogOpen
    // UI state check.
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))
    app.press("shift+m")
    expect(app.withStore((s) => s.ui.showFavoritesDialog)).toBe(true)
    app.press("Escape")
    expect(app.withStore((s) => s.ui.showFavoritesDialog)).toBe(false)
  })
})
