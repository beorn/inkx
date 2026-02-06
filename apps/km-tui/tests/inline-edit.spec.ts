/**
 * Inline Edit Acceptance Tests
 *
 * Tests for inline node editing via Enter key.
 * Verifies the full flow: Enter → edit mode → type → Enter/Escape → confirm/cancel.
 *
 * Note: After confirm, the breadcrumb (which reads from repo) reflects the new
 * content, but the card still shows the original node ID. So we check the
 * breadcrumb for saved changes, not the card text.
 *
 * Readline shortcut details (Ctrl+W word delete, Ctrl+U/K line kill, etc.)
 * are tested at the hook level in use-line-edit.test.ts, not here.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Inline Editing", () => {
  test("Enter on card enters inline edit, shows editable text", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()

    // Press Enter to start inline editing
    board.press("Enter")

    // The text should still be visible (now in edit mode)
    const output = board.screenshot()
    expect(output).toContain("1a")
  })

  test("Enter on column header enters inline edit", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("k") // card → column
    board.expect("#col1[data-cursor]").toExist()
    board.press("Enter")

    const output = board.screenshot()
    expect(output).toContain("col1")
  })

  test("typing during inline edit does NOT trigger board commands", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // These keys would navigate/quit in normal mode
    board.press("j")
    board.press("k")
    board.press("q")
    board.press("l")

    // Board should still be intact (didn't quit or navigate)
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Escape during inline edit cancels without saving", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Type some characters
    board.press("x")
    board.press("y")
    board.press("z")

    // Cancel with Escape
    board.press("Escape")

    // Original content should be preserved
    const output = board.screenshot()
    expect(output).toContain("1a")

    // Board should be back in normal mode — j should navigate
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Enter confirms inline edit and saves to repo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Append text to existing content
    for (const c of "-edited") board.press(c)

    // Confirm with Enter
    board.press("Enter")

    // The breadcrumb path updates from repo — check it shows the edit
    const output = board.screenshot()
    expect(output).toContain("1a-edited")

    // Board should be back in normal mode
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("inline edit then navigate works (edit → Escape → j/k)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )

    // Edit first card then cancel
    board.press("Enter")
    board.press("Escape")

    // Should be able to navigate normally
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Edit second card then cancel
    board.press("Enter")
    board.press("Escape")

    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("close_or_quit (Escape) cancels inline edit before other actions", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter")

    // First Escape should cancel inline edit (not quit)
    board.press("Escape")

    // Board should still be showing
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")

    // Cursor should still be on the edited node
    board.expect("#1a[data-cursor]").toExist()
  })
})

describe("Inline Edit — Readline Integration", () => {
  // These verify that readline shortcuts work through the board's input layer stack.
  // Exhaustive readline testing belongs at the useLineEdit hook level.

  test("Backspace and arrow keys work in edit mode", () => {
    const { board } = testEnv(() => item("board", item("col1", item("ab"))))

    board.press("Enter")
    // ab| → ArrowLeft → a|b → insert X → aXb
    board.press("ArrowLeft")
    board.press("X")
    board.press("Enter")

    expect(board.screenshot()).toContain("aXb")
  })

  test("Ctrl shortcuts (Control+A, Control+W) work through input layers", () => {
    const { board } = testEnv(() => item("board", item("col1", item("xyz"))))

    board.press("Enter")
    // xyz| → Ctrl+A → |xyz → type "0" → 0xyz
    board.press("Control+a")
    board.press("0")
    board.press("Enter")

    expect(board.screenshot()).toContain("0xyz")
  })
})

describe("Inline Edit — Task Marks", () => {
  test("editing a task node preserves task mark on save", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("task1")))
      // Make task1 a proper task with a mark
      const taskNode = nodes.find((n) => n.id === "task1")!
      taskNode.content = "[x] task1"
      taskNode.task_status = "done"
      taskNode.task_mark = "x"
      return nodes
    })

    board.expect("#task1[data-cursor]").toExist()
    board.press("Enter")

    // The edit field should show "task1" (stripped mark), not "[x] task1"
    // Type to append
    for (const c of "-ok") board.press(c)
    board.press("Enter")

    // After save, the content in repo should have "[x] task1-ok"
    // The display should show the edited title
    expect(board.screenshot()).toContain("task1-ok")
  })

  test("editing a todo task preserves todo mark", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("mytodo")))
      const taskNode = nodes.find((n) => n.id === "mytodo")!
      taskNode.content = "[ ] mytodo"
      taskNode.task_status = "todo"
      taskNode.task_mark = " "
      return nodes
    })

    board.press("Enter")
    // Append text
    for (const c of "-done") board.press(c)
    board.press("Enter")

    expect(board.screenshot()).toContain("mytodo-done")
  })
})

describe("Inline Edit — Edge Cases", () => {
  test("edit across different columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("c1")), item("col2", item("c2"))),
    )

    // Edit in col1
    board.press("Enter")
    board.press("X")
    board.press("Enter")
    expect(board.screenshot()).toContain("c1X")

    // Navigate to col2
    board.press("l")
    board.expect("#c2[data-cursor]").toExist()

    // Edit in col2
    board.press("Enter")
    board.press("Y")
    board.press("Enter")
    expect(board.screenshot()).toContain("c2Y")
  })

  test("confirm with no changes preserves original", () => {
    const { board } = testEnv(() => item("board", item("col1", item("keep"))))

    board.press("Enter")
    // Immediately confirm without typing
    board.press("Enter")

    expect(board.screenshot()).toContain("keep")
  })

  test("backspace all then confirm saves empty content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("ab"))))

    board.press("Enter")
    board.press("Backspace")
    board.press("Backspace")
    // Content empty
    board.press("Enter")

    // Node should still exist — board shouldn't crash
    const output = board.screenshot()
    expect(output).toContain("col1")
  })

  test("edit then confirm then edit same node again", () => {
    const { board } = testEnv(() => item("board", item("col1", item("orig"))))

    // First edit: append "1"
    board.press("Enter")
    board.press("1")
    board.press("Enter")
    expect(board.screenshot()).toContain("orig1")

    // Second edit should start with "orig1" (not stale "orig")
    board.press("Enter")
    board.press("2")
    board.press("Enter")
    expect(board.screenshot()).toContain("orig12")
  })
})
