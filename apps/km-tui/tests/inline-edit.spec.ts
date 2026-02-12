/**
 * Inline Edit Acceptance Tests
 *
 * Tests for inline node editing via Enter key.
 * Verifies the full flow: Enter → edit mode → type → Enter/Escape → confirm/cancel.
 *
 * Every test that edits content verifies BOTH:
 * 1. repo.getNode() returns updated content (data layer)
 * 2. board.screenshot() reflects the change (rendering layer)
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
    const { board, repo } = testEnv(() =>
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

    // Repo should NOT be modified
    expect(repo.getNode("1a")?.content).toBe("1a")

    // Original content should be preserved on screen
    const output = board.screenshot()
    expect(output).toContain("1a")

    // Board should be back in normal mode — j should navigate
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Enter confirms inline edit and saves to repo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Append text to existing content
    for (const c of "-edited") board.press(c)

    // Confirm with Enter
    board.press("Enter")

    // Verify repo was updated (data layer)
    expect(repo.getNode("1a")?.content).toBe("1a-edited")

    // Verify screenshot reflects the save (rendering layer)
    expect(board.screenshot()).toContain("1a-edited")

    // Board should be back in normal mode
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("inline edit then navigate works (Enter → Escape → j/k)", () => {
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
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("ab"))),
    )

    board.press("Enter")
    // ab| → ArrowLeft → a|b → insert X → aXb
    board.press("ArrowLeft")
    board.press("X")
    board.press("Enter")

    expect(repo.getNode("ab")?.content).toBe("aXb")
    expect(board.screenshot()).toContain("aXb")
  })

  test("Delete key works in edit mode (forward delete)", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("ab"))),
    )

    board.press("Enter")
    // ab| → Ctrl+A → |ab → Delete → |b
    board.press("Control+a")
    board.press("Delete")
    board.press("Enter")

    expect(repo.getNode("ab")?.content).toBe("b")
    expect(board.screenshot()).not.toContain("ab")
  })

  test("Ctrl shortcuts (Control+A, Control+W) work through input layers", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("xyz"))),
    )

    board.press("Enter")
    // xyz| → Ctrl+A → |xyz → type "0" → 0xyz
    board.press("Control+a")
    board.press("0")
    board.press("Enter")

    expect(repo.getNode("xyz")?.content).toBe("0xyz")
    expect(board.screenshot()).toContain("0xyz")
  })
})

describe("Inline Edit — Task Marks", () => {
  test("editing a task node preserves task mark on save", () => {
    const { board, repo } = testEnv(() => {
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

    // Repo should have mark preserved
    expect(repo.getNode("task1")?.content).toBe("[x] task1-ok")
    expect(board.screenshot()).toContain("task1-ok")
  })

  test("editing a todo task preserves todo mark", () => {
    const { board, repo } = testEnv(() => {
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

    expect(repo.getNode("mytodo")?.content).toBe("[ ] mytodo-done")
    expect(board.screenshot()).toContain("mytodo-done")
  })
})

describe("Inline Edit — Navigate Away Saves", () => {
  test("ArrowDown during edit saves and navigates to next card", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Type some text
    for (const c of "-ok") board.press(c)

    // Navigate away with ArrowDown — should save and move cursor
    board.press("ArrowDown")

    // Cursor should have moved to next card
    board.expect("#1b[data-cursor]").toExist()

    // Verify repo was updated
    expect(repo.getNode("1a")?.content).toBe("1a-ok")
    expect(board.screenshot()).toContain("1a-ok")
  })

  test("ArrowUp during edit saves and navigates to previous card", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Navigate to second card
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Edit second card
    board.press("Enter")
    for (const c of "-up") board.press(c)

    // Navigate away with ArrowUp — should save and move cursor
    board.press("ArrowUp")

    board.expect("#1a[data-cursor]").toExist()
    expect(repo.getNode("1b")?.content).toBe("1b-up")
    expect(board.screenshot()).toContain("1b-up")
  })

  test("navigate away without changes does not save (no-op)", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("orig"), item("1b"))),
    )

    board.press("Enter")
    // Don't type anything, just navigate away
    board.press("ArrowDown")

    board.expect("#1b[data-cursor]").toExist()
    // Repo should be unchanged
    expect(repo.getNode("orig")?.content).toBe("orig")
    expect(board.screenshot()).toContain("orig")
  })

  test("Escape during edit cancels without saving (no auto-save)", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter")
    for (const c of "-nope") board.press(c)

    // Escape cancels — should NOT save
    board.press("Escape")

    expect(repo.getNode("1a")?.content).toBe("1a")
    expect(board.screenshot()).not.toContain("1a-nope")
  })
})

describe("Inline Edit — useSyncExternalStore (repo→render)", () => {
  // These tests verify that direct repo mutations (NOT through UI commands)
  // cause the board to re-render. This catches the production bug where
  // useSyncExternalStore must drive re-renders independently of UI dispatch.

  test("direct repo.updateNode causes board to show updated content", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("original"), item("1b"))),
    )

    expect(board.screenshot()).toContain("original")

    // Mutate repo directly — no board command, no UI dispatch.
    // Only useSyncExternalStore should trigger re-render.
    repo.updateNode("original", { content: "mutated-directly" })

    // Press an unbound key to trigger act() + doRender() cycle
    // (the test renderer only flushes frames on sendInput)
    board.press("0")

    expect(board.screenshot()).toContain("mutated-directly")
    expect(board.screenshot()).not.toContain("original")
  })

  test("multiple direct repo mutations accumulate correctly", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("aaa"), item("bbb"))),
    )

    repo.updateNode("aaa", { content: "AAA" })
    repo.updateNode("bbb", { content: "BBB" })
    board.press("0") // flush render

    expect(board.screenshot()).toContain("AAA")
    expect(board.screenshot()).toContain("BBB")
    expect(board.screenshot()).not.toContain("aaa")
    expect(board.screenshot()).not.toContain("bbb")
  })

  test("repo.deleteNode causes board to remove the node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("keep"), item("remove"))),
    )

    expect(board.screenshot()).toContain("remove")

    repo.deleteNode("remove")
    board.press("0") // flush render

    expect(board.screenshot()).not.toContain("remove")
    expect(board.screenshot()).toContain("keep")
  })
})

describe("Inline Edit — Edge Cases", () => {
  test("edit across different columns", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("c1")), item("col2", item("c2"))),
    )

    // Edit in col1
    board.press("Enter")
    board.press("X")
    board.press("Enter") // save c1X + create sibling in edit mode
    expect(repo.getNode("c1")?.content).toBe("c1X")

    // Exit new sibling's edit, then navigate to col2
    board.press("Escape")
    board.press("l")
    board.expect("#c2[data-cursor]").toExist()

    // Edit in col2
    board.press("Enter")
    board.press("Y")
    board.press("Enter") // save c2Y + create sibling
    expect(repo.getNode("c2")?.content).toBe("c2Y")
  })

  test("confirm with no changes preserves original", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("keep"))),
    )

    board.press("Enter")
    // Immediately confirm without typing
    board.press("Enter")

    expect(repo.getNode("keep")?.content).toBe("keep")
    expect(board.screenshot()).toContain("keep")
  })

  test("backspace all then confirm saves empty content", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("ab"))),
    )

    board.press("Enter")
    board.press("Backspace")
    board.press("Backspace")
    // Content empty
    board.press("Enter")

    expect(repo.getNode("ab")?.content).toBe("")
    // Node should still exist — board shouldn't crash
    expect(board.screenshot()).toContain("col1")
  })

  test("edit then confirm then edit same node again", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("orig"))),
    )

    // First edit: append "1"
    board.press("Enter")
    board.press("1")
    board.press("Enter") // save orig1 + create sibling in edit mode
    expect(repo.getNode("orig")?.content).toBe("orig1")

    // Navigate back to orig: exit new sibling edit, go up
    board.press("Escape")
    board.press("k")

    // Second edit should start with "orig1" (not stale "orig")
    board.press("Enter")
    board.press("2")
    board.press("Enter") // save orig12 + create another sibling
    expect(repo.getNode("orig")?.content).toBe("orig12")
    expect(board.screenshot()).toContain("orig12")
  })
})
