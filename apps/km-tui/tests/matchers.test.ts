/**
 * TestApp Custom Matchers Tests
 *
 * Tests for the board-state matchers (toHaveCursorOn, toHaveSelection, etc.)
 * that operate on TestApp objects rather than AutoLocator elements.
 */

import { describe, test, expect } from "vitest"
import { createTestApp } from "./helpers/test-app.ts"
import { item } from "./helpers/board-test.ts"
import "./helpers/matchers.ts"

describe("TestApp matchers", () => {
  test("toHaveCursorOn — initial cursor and after navigation", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    expect(app).toHaveCursorOn("task1")
    app.press("j")
    expect(app).toHaveCursorOn("task2")
    expect(app).not.toHaveCursorOn("task1")
  })

  test("toHaveView — default is cards", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(app).toHaveView("cards")
    expect(app).not.toHaveView("columns")
  })

  test("toHaveOverlay — null by default", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(app).toHaveOverlay(null)
    expect(app).not.toHaveOverlay("search")
  })

  test("toHaveSelection — cursor included by default", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    // selection includes the cursor node
    expect(app).toHaveSelection(["task1"])
  })

  test("toHaveNodeCount — counts all visible nodes", () => {
    using app = createTestApp(item("board", item("col", item("t1"), item("t2"), item("t3"))))
    expect(app).toHaveNodeCount(5) // board + col + 3 tasks
    expect(app).not.toHaveNodeCount(3)
  })

  test("toHaveBell — not fired by default", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(app).not.toHaveBell()
  })

  test("toHaveCursorOn error message is helpful", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(() => {
      expect(app).toHaveCursorOn("nonexistent")
    }).toThrow(/Expected cursor on "nonexistent", got "task1"/)
  })

  test("toHaveNodeCount error message includes visible node list", () => {
    using app = createTestApp(item("board", item("col", item("t1"))))
    expect(() => {
      expect(app).toHaveNodeCount(99)
    }).toThrow(/Expected 99 visible nodes, got 3/)
  })

  test("toHaveView error message shows actual view", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(() => {
      expect(app).toHaveView("tabs")
    }).toThrow(/Expected view to be "tabs", got "cards"/)
  })

  test("toHaveOverlay error message distinguishes null from named", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    expect(() => {
      expect(app).toHaveOverlay("search")
    }).toThrow(/Expected overlay "search", got null/)
  })

  test("type guard rejects non-TestApp values", () => {
    expect(() => {
      expect("not-an-app").toHaveCursorOn("x")
    }).toThrow(/toHaveCursorOn expects a TestApp/)

    expect(() => {
      expect(42).toHaveView("cards")
    }).toThrow(/toHaveView expects a TestApp/)

    expect(() => {
      expect(null).toHaveSelection([])
    }).toThrow(/toHaveSelection expects a TestApp/)
  })
})
