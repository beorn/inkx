/**
 * Demo test for the new TestApp API additions:
 * - app.state (declarative state getter)
 * - app.node(id), app.card(title), app.column(title) (typed node handles)
 * - createTestApp.fromMarkdown() (inline markdown fixture)
 */

import { describe, test, expect } from "vitest"
import { createTestApp } from "./helpers/test-app.ts"
import { item } from "./helpers/board-test.ts"

describe("TestApp API additions", () => {
  test("state getter returns cursor and view mode", () => {
    using app = createTestApp(item("board", item("Todo", item("task1"), item("task2")), item("Done")))
    // Initial cursor is on the first card
    expect(app.state.cursor).toBe("task1")
    expect(app.state.view).toBe("cards")
    expect(app.state.overlay).toBeNull()
    expect(app.state.visible).toContain("task1")
    expect(app.state.visible).toContain("Todo")
  })

  test("card() returns a handle with isCursor", () => {
    using app = createTestApp(item("board", item("Todo", item("task1"), item("task2")), item("Done")))
    expect(app.card("task1").isCursor).toBe(true)
    expect(app.card("task1").exists).toBe(true)
    expect(app.card("task2").isCursor).toBe(false)

    // Navigate down — cursor moves to task2
    app.press("j")
    expect(app.card("task2").isCursor).toBe(true)
    expect(app.card("task1").isCursor).toBe(false)
  })

  test("node() returns a handle by ID", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done")))
    const handle = app.node("task1")
    expect(handle.exists).toBe(true)
    expect(handle.isCursor).toBe(true)
    expect(handle.visible).toBe(true)
  })

  test("column() returns a handle for columns", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done")))
    expect(app.column("Todo").exists).toBe(true)
    expect(app.column("Todo").visible).toBe(true)
    expect(app.column("Done").exists).toBe(true)
  })

  test("fromMarkdown creates a test app from inline markdown", () => {
    using app = createTestApp.fromMarkdown("# col1\n- [ ] task1\n- [ ] task2")
    // The markdown should parse into a board with a column and tasks
    expect(app.state.view).toBe("cards")
    // Verify the screen shows the parsed content
    app.expectScreen("task1")
    app.expectScreen("task2")
  })
})
