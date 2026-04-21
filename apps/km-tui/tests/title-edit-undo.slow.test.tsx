/**
 * Regression tests for km-tui.title-edit-no-undo
 *
 * Edit a card title, save with Escape, press u → title should revert.
 * Before the fix, the title mutation bypassed the undoable-repo proxy, so
 * the edit was committed to disk but never pushed onto the undo stack.
 *
 * These journey tests verify the full user path: enter edit, type, Escape,
 * undo, observe revert.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("title edit undo (km-tui.title-edit-no-undo)", () => {
  test("card title edit: Escape then u reverts title to original content", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"))))

    app.expect("#task-a[data-cursor]").toExist()
    expect(app.repo.getNode("task-a")?.content).toBe("task-a")

    // Enter edit mode, append "-edited", save with Escape.
    app.press("Enter")
    for (const ch of "-edited") app.press(ch)
    app.press("Escape")

    // Edit committed.
    expect(app.repo.getNode("task-a")?.content).toBe("task-a-edited")

    // u should revert to the pre-edit content.
    app.command("undo")

    expect(app.repo.getNode("task-a")?.content).toBe("task-a")
  })

  test("multiple title edits produce multiple undo entries", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"))))

    // First edit
    app.press("Enter")
    for (const ch of "-one") app.press(ch)
    app.press("Escape")
    expect(app.repo.getNode("task-a")?.content).toBe("task-a-one")

    // Second edit
    app.press("Enter")
    for (const ch of "-two") app.press(ch)
    app.press("Escape")
    expect(app.repo.getNode("task-a")?.content).toBe("task-a-one-two")

    // Undo second
    app.command("undo")
    expect(app.repo.getNode("task-a")?.content).toBe("task-a-one")

    // Undo first
    app.command("undo")
    expect(app.repo.getNode("task-a")?.content).toBe("task-a")
  })

  test("title edit undo does not ring the 'nothing to undo' bell", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"))))

    // Make a title edit
    app.press("Enter")
    for (const ch of "-edited") app.press(ch)
    app.press("Escape")

    // u should succeed (no bell)
    app.command("undo")

    // The edit should be undone, not a "nothing to undo" bell.
    expect(app.repo.getNode("task-a")?.content).toBe("task-a")
  })

  test("column title edit: Escape then u reverts column content", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))

    // Navigate up to the column header
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    // Columns created via item() with children start with undefined content
    // (display name comes from data.name) — the rename path populates content.
    const before = app.repo.getNode("col1")
    const beforeContent = before?.content
    const beforeName = before?.name

    // Edit column title
    app.press("Enter")
    for (const ch of "-renamed") app.press(ch)
    app.press("Escape")

    expect(app.repo.getNode("col1")?.content).toBe("col1-renamed")

    // Undo reverts the column rename
    app.command("undo")

    // Content + name revert to pre-edit state (either both restored, or
    // both cleared if they started undefined — not left at "col1-renamed").
    const after = app.repo.getNode("col1")
    expect(after?.content).toBe(beforeContent)
    expect(after?.name).toBe(beforeName)
  })
})
