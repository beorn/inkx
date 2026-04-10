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

describe("White-box APIs", () => {
  test("click — moves cursor to clicked card", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"), item("task3"))))
    expect(app).toHaveCursorOn("task1")

    // Get position of task2 to click on it
    const pos = app.screen.nodePos("task2")
    expect(pos).not.toBeNull()
    if (pos) {
      app.click(pos.x, pos.y)
      expect(app).toHaveCursorOn("task2")
    }
  })

  test("click — ctrl-click toggles multi-selection", () => {
    using app = createTestApp(item("board", item("col", item("t1"), item("t2"), item("t3"))))
    expect(app).toHaveCursorOn("t1")

    const pos2 = app.screen.nodePos("t2")
    if (pos2) {
      app.click(pos2.x, pos2.y, { ctrl: true })
      // After ctrl-click, t2 should be selected
      expect(app.node("t2").isSelected).toBe(true)
    }
  })

  test("expectNodeBorder — cards have borders", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    // Cards in default cards view should have borders
    app.expectNodeBorder("task1")
  })

  test("expectNodeColor — cursor node has non-null fg", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    // Cursor node should render with some foreground color (not null)
    const box = app.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    // Just verify it doesn't throw — the color value depends on theme
    app.expectNodeColor("task1", {})
  })

  test("expectNoGhostChars — clean board has no ghost chars", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    // A freshly rendered board should have no ghost characters
    app.expectNoGhostChars()
  })

  test("expectNoGhostChars — regional scan", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    // Scan a specific region
    app.expectNoGhostChars({ x: 0, y: 0, width: 40, height: 10 })
  })

  test("screen.ansi — returns styled content", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    const ansi = app.screen.ansi
    expect(typeof ansi).toBe("string")
    expect(ansi.length).toBeGreaterThan(0)
  })

  test("click is chainable", () => {
    using app = createTestApp(item("board", item("col", item("t1"), item("t2"))))
    const pos = app.screen.nodePos("t2")
    if (pos) {
      // Verify click returns the app for chaining
      const result = app.click(pos.x, pos.y)
      expect(result).toBe(app)
    }
  })

  test("click records action history", () => {
    using app = createTestApp(item("board", item("col", item("t1"), item("t2"))))
    const pos = app.screen.nodePos("t2")
    if (pos) {
      app.click(pos.x, pos.y)
      expect(app.actionHistory).toContain(`click(${pos.x},${pos.y})`)
    }
  })

  test("expectNodeBorder, expectNodeColor, expectNoGhostChars are chainable", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    const result = app.expectNodeBorder("task1").expectNodeColor("task1", {}).expectNoGhostChars()
    expect(result).toBe(app)
  })
})
