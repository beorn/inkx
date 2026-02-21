/**
 * Dialog lifecycle tests: open -> confirm and open -> cancel flows.
 *
 * Covers:
 * - DatePromptDialog (td chord -> type date -> Enter/Escape)
 * - SearchDialog (Cmd+f -> type query -> Enter/Escape)
 * - NewItemDialog (gn chord -> type name -> Enter/Escape)
 *
 * Each dialog is tested for:
 * 1. Open: dialog appears in screenshot and store state is set
 * 2. Confirm: Enter closes dialog and applies the action
 * 3. Cancel: Escape closes dialog without side effects
 * 4. State reset: store state is clean after close
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// ---------------------------------------------------------------------------
// DatePromptDialog lifecycle
// ---------------------------------------------------------------------------

describe("DatePromptDialog lifecycle", () => {
  test("td opens dialog — store.datePrompt is set and screenshot shows title", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"), item.task("Task2"))))

    board.press("j") // move to card level
    board.press("t").press("d")

    // Store state
    expect(store.getState().ui.datePrompt).toBeTruthy()

    // Screenshot
    expect(board.screenshot()).toContain("Set Due Date")
  })

  test("td -> type date -> Enter confirms and closes dialog", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")
    board.press("t").press("d")
    expect(board.screenshot()).toContain("Set Due Date")

    // Type a date
    for (const ch of "tomorrow") board.press(ch)

    // Confirm
    board.press("Enter")

    // Dialog closed
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Date was applied to the node
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("td -> Escape cancels without setting date", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")
    board.press("t").press("d")
    expect(store.getState().ui.datePrompt).toBeTruthy()
    expect(board.screenshot()).toContain("Set Due Date")

    // Cancel
    board.press("Escape")

    // Dialog closed
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(board.screenshot()).not.toContain("Set Due Date")

    // No date was set
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
    expect(task.due_at).toBeFalsy()
  })

  test("td -> type date -> Escape cancels without applying typed date", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")
    board.press("t").press("d")

    // Type a date but then cancel
    for (const ch of "friday") board.press(ch)
    board.press("Escape")

    // Dialog closed
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(board.screenshot()).not.toContain("Set Due Date")

    // No date was set
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()
  })

  test("ts opens start date dialog and Escape cancels", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")
    board.press("t").press("s")

    expect(store.getState().ui.datePrompt).toBeTruthy()
    expect(board.screenshot()).toContain("Set Start Date")

    board.press("Escape")

    expect(store.getState().ui.datePrompt).toBeNull()
    expect(board.screenshot()).not.toContain("Set Start Date")
  })
})

// ---------------------------------------------------------------------------
// SearchDialog lifecycle
// ---------------------------------------------------------------------------

describe("SearchDialog lifecycle", () => {
  test("/ opens search dialog — store flag is set and screenshot shows title", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    board.press("Cmd+f")

    expect(store.getState().ui.showSearchDialog).toBe(true)
    expect(board.screenshot()).toContain("Search")
  })

  test("/ -> Escape cancels search dialog", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    board.press("Cmd+f")
    expect(store.getState().ui.showSearchDialog).toBe(true)

    board.press("Escape")

    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(board.screenshot()).not.toContain("Search")
  })

  test("/ -> type query -> Escape cancels without navigating", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    board.press("Cmd+f")

    // Type a query
    for (const ch of "Alpha") board.press(ch)

    // Cancel
    board.press("Escape")

    // Dialog closed
    expect(store.getState().ui.showSearchDialog).toBe(false)

    // Board still shows both tasks (no navigation happened)
    const screen = board.screenshot()
    expect(screen).toContain("Alpha")
    expect(screen).toContain("Beta")
  })

  test("/ -> type query -> Enter confirms search (closes dialog)", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Alpha task"), item.task("Beta task"))))

    board.press("Cmd+f")
    expect(store.getState().ui.showSearchDialog).toBe(true)

    // Type a query
    for (const ch of "Alpha") board.press(ch)

    // Confirm
    board.press("Enter")

    // Dialog should be closed after confirm
    expect(store.getState().ui.showSearchDialog).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// NewItemDialog lifecycle
// ---------------------------------------------------------------------------

describe("NewItemDialog lifecycle", () => {
  test("gn opens new item dialog — store flag is set and screenshot shows title", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"), item.task("Task2"))))

    board.press("j") // move to card level
    board.press("g").press("n")

    expect(store.getState().ui.showNewItemDialog).toBe(true)
    expect(board.screenshot()).toContain("New")
  })

  test("gn -> Escape cancels new item dialog without creating nodes", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    const col = repo.getChildren("board")[0]!
    const nodesBefore = repo.getChildren(col.id).length

    board.press("j")
    board.press("g").press("n")
    expect(store.getState().ui.showNewItemDialog).toBe(true)

    board.press("Escape")

    // Dialog closed
    expect(store.getState().ui.showNewItemDialog).toBe(false)
    expect(board.screenshot()).not.toContain("New task")

    // No nodes created
    const nodesAfter = repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("gn -> type name -> Escape cancels without creating nodes", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    const col = repo.getChildren("board")[0]!
    const nodesBefore = repo.getChildren(col.id).length

    board.press("j")
    board.press("g").press("n")

    // Type a name but then cancel
    for (const ch of "Groceries") board.press(ch)
    board.press("Escape")

    // Dialog closed
    expect(store.getState().ui.showNewItemDialog).toBe(false)

    // No nodes created
    const nodesAfter = repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("gn -> type name -> Enter creates the new item", () => {
    const { board, store, repo } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    const col = repo.getChildren("board")[0]!
    const nodesBefore = repo.getChildren(col.id).length

    board.press("j")
    board.press("g").press("n")
    expect(store.getState().ui.showNewItemDialog).toBe(true)

    // Type name
    for (const ch of "Buy milk") board.press(ch)

    // Confirm
    board.press("Enter")

    // Dialog closed
    expect(store.getState().ui.showNewItemDialog).toBe(false)

    // A new node was created
    const nodesAfter = repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore + 1)

    // The new node has the correct content
    const children = repo.getChildren(col.id)
    const newNode = children.find((n) => n.content === "Buy milk")
    expect(newNode).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Cross-dialog: no state leakage between open/close cycles
// ---------------------------------------------------------------------------

describe("dialog state isolation", () => {
  test("opening one dialog does not set other dialog flags", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    // Open date dialog
    board.press("j")
    board.press("t").press("d")
    expect(store.getState().ui.datePrompt).toBeTruthy()
    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(store.getState().ui.showNewItemDialog).toBe(false)

    board.press("Escape")

    // Open search dialog
    board.press("Cmd+f")
    expect(store.getState().ui.showSearchDialog).toBe(true)
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(store.getState().ui.showNewItemDialog).toBe(false)

    board.press("Escape")

    // Open new item dialog
    board.press("g").press("n")
    expect(store.getState().ui.showNewItemDialog).toBe(true)
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(store.getState().ui.showSearchDialog).toBe(false)

    board.press("Escape")

    // All clean
    expect(store.getState().ui.datePrompt).toBeNull()
    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(store.getState().ui.showNewItemDialog).toBe(false)
  })

  test("sequential open/cancel cycles leave store clean", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")

    // Cycle 1: date dialog
    board.press("t").press("d")
    board.press("Escape")

    // Cycle 2: search dialog
    board.press("Cmd+f")
    board.press("Escape")

    // Cycle 3: new item dialog
    board.press("g").press("n")
    board.press("Escape")

    // All flags clean
    const ui = store.getState().ui
    expect(ui.datePrompt).toBeNull()
    expect(ui.showSearchDialog).toBe(false)
    expect(ui.showNewItemDialog).toBe(false)
  })

  test("confirm in one dialog, then open another — no interference", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Task1"))))

    board.press("j")

    // Confirm a date
    board.press("t").press("d")
    for (const ch of "tomorrow") board.press(ch)
    board.press("Enter")
    expect(store.getState().ui.datePrompt).toBeNull()

    // Now open search — should work cleanly
    board.press("Cmd+f")
    expect(store.getState().ui.showSearchDialog).toBe(true)
    expect(board.screenshot()).toContain("Search")

    board.press("Escape")
    expect(store.getState().ui.showSearchDialog).toBe(false)
  })
})
