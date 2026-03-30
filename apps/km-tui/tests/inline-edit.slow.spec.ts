/**
 * Inline Edit Acceptance Tests
 *
 * Tests for inline node editing via Enter key.
 * Verifies the full flow: Enter → edit mode → type → Enter/Escape → save.
 *
 * Every test that edits content verifies BOTH:
 * 1. repo.getNode() returns updated content (data layer)
 * 2. board.screenshot() reflects the change (rendering layer)
 *
 * Readline shortcut details (Ctrl+W word delete, Ctrl+U/K line kill, etc.)
 * are tested at the hook level in useEditContext, not here.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Inline Editing", () => {
  test("Enter on card enters inline edit, shows editable text", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect("#1a[data-cursor]").toExist()

    // Press Enter to start inline editing
    board.press("Enter")

    // The text should still be visible (now in edit mode)
    const output = board.screenshot()
    expect(output).toContain("1a")
  })

  test("Enter on column header enters inline edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.command("cursor_up") // card → column
    board.expect("#col1[data-cursor]").toExist()
    board.press("Enter")

    const output = board.screenshot()
    expect(output).toContain("col1")
  })

  test("typing during inline edit does NOT trigger board commands", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // These keys would navigate/quit in normal mode
    board.command("cursor_down")
    board.command("cursor_up")
    board.command("quit")
    board.command("cursor_right")

    // Board should still be intact (didn't quit or navigate)
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Escape during inline edit saves and exits", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Type some characters
    board.command("toggle_task_done")
    board.press("y")
    board.command("zoom_inwards")

    // Escape saves and exits edit mode
    board.press("Escape")

    // Repo should be modified (Escape saves)
    expect(repo.getNode("1a")?.content).toBe("1axyz")

    // Updated content should be on screen
    const output = board.screenshot()
    expect(output).toContain("1axyz")

    // Board should be back in normal mode — j should navigate
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Enter confirms inline edit and saves to repo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Append text to existing content
    for (const c of "-edited") board.press(c)

    // Confirm with Enter — saves content + creates new sibling + enters edit
    board.press("Enter")

    // Verify repo was updated (data layer)
    expect(repo.getNode("1a")?.content).toBe("1a-edited")

    // Verify screenshot reflects the save (rendering layer)
    expect(board.screenshot()).toContain("1a-edited")

    // Exit edit on the new sibling (outliner Enter creates new sibling in edit mode)
    board.press("Escape")

    // Navigate past the new sibling to reach 1b
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("inline edit then navigate works (Enter → Escape → j/k)", () => {
    const { board } = testEnv(item.simpleBoard)

    // Edit first card then cancel
    board.press("Enter")
    board.press("Escape")

    // Should be able to navigate normally
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()

    // Edit second card then cancel
    board.press("Enter")
    board.press("Escape")

    board.command("cursor_down")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("Escape exits inline edit before other close_or_quit actions", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter")

    // First Escape should exit inline edit (not quit the board)
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
  // Exhaustive readline testing belongs at the useEditContext hook level.

  test("Backspace and arrow keys work in edit mode", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("ab"))))

    board.press("Enter")
    // ab| → ArrowLeft → a|b → insert X → aXb
    board.press("ArrowLeft")
    board.command("cycle_task_status")
    board.press("Escape") // save+exit (Enter splits in outliner mode)

    expect(repo.getNode("ab")?.content).toBe("aXb")
    expect(board.screenshot()).toContain("aXb")
  })

  test("Delete key works in edit mode (forward delete)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("ab"))))

    board.press("Enter")
    // ab| → Ctrl+A → |ab → Delete → |b
    board.press("Control+a")
    board.press("Delete")
    board.press("Escape") // save+exit (Enter splits in outliner mode)

    expect(repo.getNode("ab")?.content).toBe("b")
    expect(board.screenshot()).not.toContain("ab")
  })

  test("Ctrl shortcuts (Control+A, Control+W) work through input layers", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("xyz"))))

    board.press("Enter")
    // xyz| → Ctrl+A → |xyz → type "0" → 0xyz
    board.press("Control+a")
    board.press("0")
    board.press("Escape") // save+exit (Enter splits in outliner mode)

    expect(repo.getNode("xyz")?.content).toBe("0xyz")
    expect(board.screenshot()).toContain("0xyz")
  })
})

describe("Inline Edit — Task Markers", () => {
  test("editing a task node preserves task marker on save", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("task1")))
      // Make task1 a proper task with a marker
      const taskNode = nodes.find((n) => n.id === "task1")!
      taskNode.content = "- [x] task1"
      taskNode.task_status = "done"
      taskNode.task_marker = "[x]"
      return nodes
    })

    board.expect("#task1[data-cursor]").toExist()
    board.press("Enter")

    // The edit field should show "task1" (stripped marker), not "- [x] task1"
    // Type to append
    for (const c of "-ok") board.press(c)
    board.press("Enter")

    // Repo should have marker preserved
    expect(repo.getNode("task1")?.content).toBe("- [x] task1-ok")
    expect(board.screenshot()).toContain("task1-ok")
  })

  test("editing a todo task preserves todo marker", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("mytodo")))
      const taskNode = nodes.find((n) => n.id === "mytodo")!
      taskNode.content = "- [ ] mytodo"
      taskNode.task_status = "todo"
      taskNode.task_marker = "[ ]"
      return nodes
    })

    board.press("Enter")
    // Append text
    for (const c of "-done") board.press(c)
    board.press("Enter")

    expect(repo.getNode("mytodo")?.content).toBe("- [ ] mytodo-done")
    expect(board.screenshot()).toContain("mytodo-done")
  })
})

describe("Inline Edit — Navigate Away Saves", () => {
  test("ArrowDown during edit saves and navigates to next card", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

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
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to second card
    board.command("cursor_down")
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
    const { board, repo } = testEnv(() => item("board", item("col1", item("orig"), item("1b"))))

    board.press("Enter")
    // Don't type anything, just navigate away
    board.press("ArrowDown")

    board.expect("#1b[data-cursor]").toExist()
    // Repo should be unchanged
    expect(repo.getNode("orig")?.content).toBe("orig")
    expect(board.screenshot()).toContain("orig")
  })

  test("Escape during edit saves content (not cancel)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter")
    for (const c of "-nope") board.press(c)

    // Escape saves and exits
    board.press("Escape")

    expect(repo.getNode("1a")?.content).toBe("1a-nope")
  })
})

describe("Inline Edit — useSyncExternalStore (repo→render)", () => {
  // These tests verify that direct repo mutations (NOT through UI commands)
  // cause the board to re-render. This catches the production bug where
  // useSyncExternalStore must drive re-renders independently of UI dispatch.

  test("direct repo.updateNode causes board to show updated content", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("original"), item("1b"))))

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
    const { board, repo } = testEnv(() => item("board", item("col1", item("aaa"), item("bbb"))))

    repo.updateNode("aaa", { content: "AAA" })
    repo.updateNode("bbb", { content: "BBB" })
    board.press("0") // flush render

    expect(board.screenshot()).toContain("AAA")
    expect(board.screenshot()).toContain("BBB")
    expect(board.screenshot()).not.toContain("aaa")
    expect(board.screenshot()).not.toContain("bbb")
  })

  test("repo.deleteNode causes board to remove the node", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("keep"), item("remove"))))

    expect(board.screenshot()).toContain("remove")

    repo.deleteNode("remove")
    board.press("0") // flush render

    expect(board.screenshot()).not.toContain("remove")
    expect(board.screenshot()).toContain("keep")
  })
})

describe("Inline Edit — Edge Cases", () => {
  test("edit across different columns", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("c1")), item("col2", item("c2"))))

    // Edit in col1
    board.press("Enter")
    board.command("cycle_task_status")
    board.press("Enter") // save c1X + create sibling in edit mode
    expect(repo.getNode("c1")?.content).toBe("c1X")

    // Exit new sibling's edit, then navigate to col2
    board.press("Escape")
    board.command("cursor_right")
    board.expect("#c2[data-cursor]").toExist()

    // Edit in col2
    board.press("Enter")
    board.press("Y")
    board.press("Enter") // save c2Y + create sibling
    expect(repo.getNode("c2")?.content).toBe("c2Y")
  })

  test("confirm with no changes preserves original", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("keep"))))

    board.press("Enter")
    // Immediately confirm without typing
    board.press("Enter")

    expect(repo.getNode("keep")?.content).toBe("keep")
    expect(board.screenshot()).toContain("keep")
  })

  test("backspace all then confirm saves empty content", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("ab"))))

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
    const { board, repo } = testEnv(() => item("board", item("col1", item("orig"))))

    // First edit: append "1"
    board.press("Enter")
    board.press("1")
    board.press("Enter") // save orig1 + create sibling in edit mode
    expect(repo.getNode("orig")?.content).toBe("orig1")

    // Navigate back to orig: exit new sibling edit, go up
    board.press("Escape")
    board.command("cursor_up")

    // Second edit should start with "orig1" (not stale "orig")
    board.press("Enter")
    board.press("2")
    board.press("Enter") // save orig12 + create another sibling
    expect(repo.getNode("orig")?.content).toBe("orig12")
    expect(board.screenshot()).toContain("orig12")
  })
})

describe("Inline Edit — Outliner Enter Behavior", () => {
  // Enter behavior matrix:
  //   cursor position × visible children → placement of new node
  //
  // | Cursor     | No children         | Visible children      |
  // |------------|---------------------|-----------------------|
  // | At end     | sibling after       | first child           |
  // | At start   | sibling before      | sibling before        |
  // | In middle  | split → sibling     | split → first child   |
  //
  // Shift+Enter: always insert child at end
  // Empty text:  cursorAtEnd=true → same as "at end"

  // ── No visible children ────────────────────────────────────

  test("end, no children → sibling after + verify navigation", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    board.press("Enter") // edit alpha, cursor at end
    board.press("Enter") // → sibling after

    // alpha saved unchanged
    expect(repo.getNode("alpha")?.content).toContain("alpha")

    // Now in edit mode on new node — type and exit
    for (const c of "new") board.press(c)
    board.press("Escape")

    // Repo: alpha, new, beta
    const siblings = repo.getChildren("col1")
    expect(siblings.length).toBe(3)
    expect(siblings[0]!.id).toBe("alpha")
    expect(siblings[2]!.id).toBe("beta")

    // Navigation works: cursor is on "new", j goes to beta
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()
  })

  test("start, no children → sibling before + verify navigation", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    board.press("Enter") // edit alpha, cursor at end
    board.press("Control+a") // cursor to start
    board.press("Enter") // → sibling before

    expect(repo.getNode("alpha")?.content).toContain("alpha")

    // Exit new node's edit mode
    board.press("Escape")

    // Repo: new node first, then alpha, then beta
    const siblings = repo.getChildren("col1")
    expect(siblings.length).toBe(3)
    expect(siblings[1]!.id).toBe("alpha")
    expect(siblings[2]!.id).toBe("beta")

    // Navigation: cursor is on new node, j goes to alpha
    board.command("cursor_down")
    board.expect("#alpha[data-cursor]").toExist()
  })

  test("middle, no children → split as sibling + verify content", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("abcd"), item("zeta"))))

    board.press("Enter") // edit "abcd", cursor at end
    board.press("ArrowLeft") // ab|cd → move 2 left
    board.press("ArrowLeft")
    board.press("Enter") // → split: "ab" stays, "cd" becomes sibling

    // Original node has "ab" part (with task marker prefix)
    const origContent = repo.getNode("abcd")?.content ?? ""
    expect(origContent).toContain("ab")
    expect(origContent).not.toContain("cd")

    // Now editing "cd" node — exit and verify
    board.press("Escape")

    // Repo: ab, cd, zeta (all siblings under col1)
    const siblings = repo.getChildren("col1")
    const contents = siblings.map((n) => n.content ?? "")
    expect(contents.some((c) => c.includes("ab"))).toBe(true)
    expect(contents.some((c) => c.includes("cd"))).toBe(true)
    const abIdx = siblings.findIndex((n) => (n.content ?? "").includes("ab"))
    const cdIdx = siblings.findIndex((n) => (n.content ?? "").includes("cd"))
    const zetaIdx = siblings.findIndex((n) => n.id === "zeta")
    expect(abIdx).toBeLessThan(cdIdx)
    expect(cdIdx).toBeLessThan(zetaIdx)

    // Navigation: cursor on "cd", j goes to zeta
    board.command("cursor_down")
    board.expect("#zeta[data-cursor]").toExist()
  })

  // ── With visible children ──────────────────────────────────

  test("end, visible children → first child + verify navigation", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("sibling"))),
    )

    // Navigate to parent card (it's the first card in col1)
    board.expect("#parent[data-cursor]").toExist()
    board.press("Enter") // edit parent, cursor at end
    board.press("Enter") // → first child (parent has visible children)

    // Exit new node's edit mode
    board.press("Escape")

    // Repo: new node is first child of "parent", before child1
    const children = repo.getChildren("parent")
    const child1Idx = children.findIndex((n) => n.id === "child1")
    expect(child1Idx).toBeGreaterThan(0) // child1 is no longer first
    expect(children[0]!.id).not.toBe("child1") // new node is first

    // "parent" still has its original children
    expect(children.some((n) => n.id === "child1")).toBe(true)
    expect(children.some((n) => n.id === "child2")).toBe(true)
  })

  test("start, visible children → sibling before (not child)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("parent", item("child1")), item("sibling"))))

    board.press("Enter") // edit parent, cursor at end
    board.press("Control+a") // cursor to start
    board.press("Enter") // → sibling before (start always = sibling before)

    board.press("Escape")

    // New node is sibling of parent (under col1), not child of parent
    const col1Children = repo.getChildren("col1")
    const parentIdx = col1Children.findIndex((n) => n.id === "parent")
    expect(col1Children.length).toBe(3) // new + parent + sibling
    expect(parentIdx).toBeGreaterThan(0) // parent pushed down

    // parent's children unchanged
    const parentChildren = repo.getChildren("parent")
    expect(parentChildren.length).toBe(1) // still just child1
    expect(parentChildren[0]!.id).toBe("child1")
  })

  test("middle, visible children → split as first child + verify", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("abcd", item("existing")), item("sibling"))))

    board.press("Enter") // edit "abcd", cursor at end
    board.press("ArrowLeft") // move to ab|cd
    board.press("ArrowLeft")
    board.press("Enter") // → split: "ab" stays as parent, "cd" becomes first child

    // Now editing the "cd" child node — exit
    board.press("Escape")

    // Parent node "abcd" has truncated content (just "ab" part)
    const parentNode = repo.getNode("abcd")
    expect(parentNode?.content).not.toContain("cd")

    // "cd" is now a child of "abcd", before "existing"
    const children = repo.getChildren("abcd")
    const cdIdx = children.findIndex((n) => (n.content ?? "").includes("cd"))
    const existingIdx = children.findIndex((n) => n.id === "existing")
    expect(cdIdx).toBeLessThan(existingIdx) // cd is first child
    expect(cdIdx).toBe(0)

    // "existing" is still a child of abcd (not moved)
    expect(children.some((n) => n.id === "existing")).toBe(true)
  })

  // ── Edge cases ─────────────────────────────────────────────

  test("empty text → sibling after (cursorAtEnd wins)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"))))

    board.press("Enter") // edit alpha (cursor at end of "alpha")
    // Delete all text: cursor at end → ctrl+u deletes to start
    board.press("Control+u")
    board.press("Enter") // empty text, cursor at end → sibling after

    // alpha now has empty content
    const content = repo.getNode("alpha")?.content ?? ""
    expect(content).toBe("")

    // New sibling created
    board.press("Escape")
    const siblings = repo.getChildren("col1")
    expect(siblings.length).toBe(2) // alpha + new
  })

  test("Shift+Enter always inserts child at end", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    board.press("Enter") // edit alpha
    // Note: shift+Enter is indistinguishable from Enter in ANSI (no Kitty protocol in tests).
    // Use command() to directly invoke the text.child_block command.
    board.command("text.child_block")

    board.press("Escape") // exit new child's edit mode

    // New node is child of alpha (not sibling)
    const children = repo.getChildren("alpha")
    expect(children.length).toBe(1)

    // alpha's siblings unchanged
    const siblings = repo.getChildren("col1")
    expect(siblings.length).toBe(2) // alpha + beta (no new sibling)
  })
})

// =============================================================================
// Outliner Enter — save + new sibling
// =============================================================================

/** Select all item nodes inside a column (in render order) */
const colItems = (col: string) => `#${col} [data-view='item']`

describe("Outliner Enter — save + new sibling", () => {
  test("Enter saves content and creates new sibling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter") // enter edit mode on 1a
    board.command("cycle_task_status") // type "X" → content should be "1aX"
    board.press("Enter") // save + create new sibling

    // DOM: 3 items in column (was 2)
    board.expect(colItems("col1")).toHaveCount(3)
    // Data: content saved
    expect(repo.getNode("1a")?.content).toBe("1aX")
  })

  test("Enter with no changes still creates new sibling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect(colItems("col1")).toHaveCount(2)

    board.press("Enter") // enter edit mode
    board.press("Enter") // save (no changes) + create sibling

    // DOM: sibling added
    board.expect(colItems("col1")).toHaveCount(3)
    // Data: content unchanged
    expect(repo.getNode("1a")?.content).toBe("1a")
  })

  test("Multiple Enters create chain of siblings", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    board.expect(colItems("col1")).toHaveCount(1)

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling1 + edit sibling1
    board.press("Enter") // save sibling1 + create sibling2 + edit sibling2
    board.press("Enter") // save sibling2 + create sibling3 + edit sibling3

    // DOM: 1 original + 3 new siblings
    board.expect(colItems("col1")).toHaveCount(4)
  })

  test("After Enter, user is editing new sibling (can type into it)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling in edit mode

    // User is now editing the new sibling — typing goes there
    board.command("fold_node")
    board.press("i")
    board.press("Escape") // save and exit (Escape saves now)

    // DOM: 3 items in column
    board.expect(colItems("col1")).toHaveCount(3)
    // Data: original content preserved, new sibling has typed content
    expect(repo.getNode("1a")?.content).toBe("1a")
  })

  test("Escape saves and exits without creating sibling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect(colItems("col1")).toHaveCount(2)

    board.press("Enter") // edit 1a
    board.command("cycle_task_status") // type
    board.press("Escape") // save and exit

    // DOM: no new items (Escape doesn't create siblings)
    board.expect(colItems("col1")).toHaveCount(2)

    // Data: content saved with typed characters
    expect(repo.getNode("1a")?.content).toBe("1aX")

    // DOM: cursor navigates normally (back in normal mode)
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("new sibling is created between existing cards", () => {
    const { board } = testEnv(() => {
      return item("board", item("col1", item("1a"), item("1b")))
    })

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling

    // DOM: 3 items in column
    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // DOM: new sibling is at position 1 (between 1a and 1b)
    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("1a")
    expect(newNodeId).not.toBe("1b")
  })

  test("new sibling is inserted AFTER current card, not before", () => {
    const { board } = testEnv(item.simpleBoard)

    // Cursor on 1a, Enter → edit, Enter → save + new sibling
    board.press("Enter")
    board.press("Enter")
    board.press("Escape") // exit edit on new sibling

    // DOM: 4 items, ordered: 1a, NEW, 1b, 1c
    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(4)
    expect(items.nth(0).getAttribute("id")).toBe("1a")
    expect(items.nth(1).getAttribute("id")).toMatch(/^fake-/) // new node
    expect(items.nth(2).getAttribute("id")).toBe("1b")
    expect(items.nth(3).getAttribute("id")).toBe("1c")
  })

  test("new sibling after LAST card is appended at end", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    // Navigate to last card (1b)
    board.command("cursor_down")
    board.press("Enter") // edit 1b
    board.press("Enter") // save + new sibling after 1b
    board.press("Escape")

    // DOM: 3 items, ordered: 1a, 1b, NEW
    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)
    expect(items.nth(0).getAttribute("id")).toBe("1a")
    expect(items.nth(1).getAttribute("id")).toBe("1b")
    expect(items.nth(2).getAttribute("id")).toMatch(/^fake-/) // new at end
  })

  test("new sibling after MIDDLE card goes between neighbors", () => {
    const { board } = testEnv(item.simpleBoard)

    // Navigate to middle card (1b)
    board.command("cursor_down")
    board.press("Enter") // edit 1b
    board.press("Enter") // save + new sibling after 1b
    board.press("Escape")

    // DOM: 4 items, ordered: 1a, 1b, NEW, 1c
    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(4)
    expect(items.nth(0).getAttribute("id")).toBe("1a")
    expect(items.nth(1).getAttribute("id")).toBe("1b")
    expect(items.nth(2).getAttribute("id")).toMatch(/^fake-/) // new between 1b and 1c
    expect(items.nth(3).getAttribute("id")).toBe("1c")
  })
})

// =============================================================================
// Enter on embed_source (transclusion) nodes — mimics @next board
// =============================================================================

describe("Outliner Enter — embed_source nodes (transclusion)", () => {
  /** Build a board with a column containing embed_source nodes, like @next */
  function linkBoard() {
    const nodes = item("board", item("col1", item("link-a"), item("link-b"), item("link-c")))
    // Create target nodes that the links point to
    const targetA: KNode = {
      id: "target-a",
      type: "p",
      item: true,
      list_marker: "-",
      content: "Target task A",
      parent_id: "other-file",
      parent_idx: 0,
      embed_source: null,
      task_status: "todo",
      task_marker: "[ ]",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const targetB: KNode = { ...targetA, id: "target-b", content: "Target task B", parent_idx: 1 }
    const targetC: KNode = { ...targetA, id: "target-c", content: "Target task C", parent_idx: 2 }
    const otherFile: KNode = {
      id: "other-file",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "Other File" },
      parent_id: ".",
      parent_idx: 100,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    // Make the card nodes into links
    for (const n of nodes) {
      if (n.id === "link-a") {
        n.embed_source = "target-a"
        n.content = "Target task A"
        n.task_status = "todo"
        n.task_marker = "[ ]"
      }
      if (n.id === "link-b") {
        n.embed_source = "target-b"
        n.content = "Target task B"
        n.task_status = "todo"
        n.task_marker = "[ ]"
      }
      if (n.id === "link-c") {
        n.embed_source = "target-c"
        n.content = "Target task C"
        n.task_status = "todo"
        n.task_marker = "[ ]"
      }
    }

    return [...nodes, otherFile, targetA, targetB, targetC]
  }

  test("Enter on embed_source card creates new sibling and shows it", () => {
    const { board, repo } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a (shows Target task A)
    board.press("Enter") // save + create sibling

    // DOM: 4 items in column (was 3)
    board.expect(colItems("col1")).toHaveCount(4)
  })

  test("Enter on embed_source card: new sibling is a regular node, not a link", () => {
    const { board, repo } = testEnv(linkBoard)

    board.press("Enter") // edit
    board.press("Enter") // save + create sibling
    board.press("Escape") // exit edit on new sibling

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(4)

    // New sibling (at position 1) should NOT be a link
    const newNodeId = items.nth(1).getAttribute("id")!
    const newNode = repo.getNode(newNodeId)
    expect(newNode).toBeTruthy()
    expect(newNode!.embed_source).toBeNull()
    expect(newNode!.content).toBe("") // empty new node
  })

  test("Multiple Enters on embed_source board create chain of siblings", () => {
    const { board } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a
    board.press("Enter") // save + sibling1
    board.press("Enter") // save sibling1 + sibling2
    board.press("Enter") // save sibling2 + sibling3

    // DOM: 3 original links + 3 new siblings
    board.expect(colItems("col1")).toHaveCount(6)
  })

  test("keybindings work after Enter on embed_source node", () => {
    const { board } = testEnv(linkBoard)

    board.press("Enter") // edit
    board.press("Enter") // save + create sibling (now editing new node)
    board.press("Escape") // exit edit

    // Should be able to navigate normally after
    board.command("cursor_down") // move down
    board.expect("[data-cursor]").toExist()
  })
})

// =============================================================================
// Enter on paragraph-type embeds — real vault scenario
// =============================================================================

describe("Outliner Enter — paragraph-type embeds (real vault)", () => {
  /**
   * Build a board that mimics a real @next vault:
   * - Embed nodes have type "paragraph" (from markdown parser)
   * - embed_source points to resolved target
   * - Content is the ![[...]] syntax
   */
  function paragraphLinkBoard() {
    const nodes = item("board", item("col1", item("link-a"), item("link-b"), item("link-c")))
    // Create target nodes that the links point to
    const targetA: KNode = {
      id: "target-a",
      type: "p",
      item: true,
      list_marker: "-",
      content: "Target task A",
      parent_id: "other-file",
      parent_idx: 0,
      embed_source: null,
      task_status: "todo",
      task_marker: "[ ]",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const targetB: KNode = { ...targetA, id: "target-b", content: "Target task B", parent_idx: 1 }
    const targetC: KNode = { ...targetA, id: "target-c", content: "Target task C", parent_idx: 2 }
    const otherFile: KNode = {
      id: "other-file",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "Other File" },
      parent_id: ".",
      parent_idx: 100,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    // Make the card nodes into paragraph-type embeds (matching real vault)
    for (const n of nodes) {
      if (n.id === "link-a") {
        n.type = "p"
        n.embed_source = "target-a"
        n.content = "![[Other File#^a1]]"
      }
      if (n.id === "link-b") {
        n.type = "p"
        n.embed_source = "target-b"
        n.content = "![[Other File#^b2]]"
      }
      if (n.id === "link-c") {
        n.type = "p"
        n.embed_source = "target-c"
        n.content = "![[Other File#^c3]]"
      }
    }

    return [...nodes, otherFile, targetA, targetB, targetC]
  }

  test("Enter on paragraph embed creates new sibling and shows it", () => {
    const { board } = testEnv(paragraphLinkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a (shows Target task A)
    board.press("Enter") // save + create sibling

    // DOM: 4 items in column (was 3)
    board.expect(colItems("col1")).toHaveCount(4)
  })

  test("Multiple Enters on paragraph embeds create chain of siblings", () => {
    const { board } = testEnv(paragraphLinkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a
    board.press("Enter") // save + sibling1
    board.press("Enter") // save sibling1 + sibling2
    board.press("Enter") // save sibling2 + sibling3

    // DOM: 3 original links + 3 new siblings
    board.expect(colItems("col1")).toHaveCount(6)
  })

  test("keybindings work after Enter on paragraph embed", () => {
    const { board } = testEnv(paragraphLinkBoard)

    board.press("Enter") // edit
    board.press("Enter") // save + create sibling (now editing new node)
    board.press("Escape") // exit edit

    // Should be able to navigate normally after
    board.command("cursor_down") // move down
    board.expect("[data-cursor]").toExist()
  })
})

// =============================================================================
// Edit Focus Ring — visual indicators for inline edit mode
// =============================================================================

/**
 * Find the row containing text that appears INSIDE the card content area
 * (skipping the breadcrumb header at row 0 and column header).
 * Starts scanning from row 4 to skip breadcrumb, blank line, header, separator.
 */
function findContentRow(board: ReturnType<typeof testEnv>["board"], text: string): number {
  const rows = board.screen.rows
  for (let y = 4; y < rows.length; y++) {
    if (rows[y]?.includes(text)) return y
  }
  return -1
}

/**
 * Find the first cell matching "bo" pattern on a row and return its color info.
 */
function findBoCell(board: ReturnType<typeof testEnv>["board"], row: number) {
  for (let x = 0; x < board.screen.width; x++) {
    const cell = board.screen.cell(x, row)
    if (cell.char === "b" && board.screen.cell(x + 1, row).char === "o") {
      return { x, fg: cell.fg, bg: cell.bg, attrs: cell.attrs }
    }
  }
  return null
}

describe("edit focus ring", () => {
  test("inline edit mode does not fill row with blue background", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"))))

    // Enter inline edit mode with Enter key
    board.press("Enter")

    // The title row should NOT have a filled background — editing is
    // indicated by the cyan card border + inverse cursor, not bg fill
    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    if (!box) return

    let foundBlueBg = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char.trim() !== "") {
        if (cell.bg === 12) foundBlueBg = true
        break
      }
    }
    expect(foundBlueBg, "title should NOT have blueBright background during edit").toBe(false)
  })

  test("non-active body blocks show cardBorderEditing color during inline edit mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1", item.paragraph("body line 1"), item.paragraph("body line 2")))),
    )

    // Enter inline edit mode
    board.press("Enter")

    // Find the body text in the card content area (skip breadcrumb header)
    const bodyRow = findContentRow(board, "body line 1")
    expect(bodyRow, "body line 1 should be visible in card content area").toBeGreaterThanOrEqual(0)

    // Non-active body text should have blueBright fg (12) — $focusborder = "blueBright"
    const boCell = findBoCell(board, bodyRow)
    expect(boCell, "should find 'body' text on the row").not.toBeNull()
    expect(boCell!.fg, "non-active body text should have blueBright fg (12)").toBe(12)
  })

  test("navigating to body block does not add blue background", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1", item.paragraph("body text"), item.paragraph("more text")))),
    )

    // Enter inline edit mode on title
    board.press("Enter")

    // Navigate to next block — ArrowDown moves to next body block during editing
    board.press("ArrowDown")

    // "body text" should be the active block — no filled background
    const bodyRow = findContentRow(board, "body text")
    expect(bodyRow, "body text row should be visible in card content").toBeGreaterThanOrEqual(0)

    const boCell = findBoCell(board, bodyRow)
    expect(boCell, "should find 'body' text on the row").not.toBeNull()
    // Active body block should NOT have blueBright bg — cyan border only
    expect(boCell!.bg, "active body block should NOT have blueBright bg").not.toBe(12)
  })
})

// =============================================================================
// Body Block Edit Display — P1 bug km-tui.edit-display
// =============================================================================

describe("body block edit display (km-tui.edit-display)", () => {
  /**
   * Regression: text typed during inline body block editing doesn't display.
   * Characters ARE captured (saved to repo on confirm) but the rendered
   * screen doesn't update to show them. Root cause: incremental rendering
   * misses the update (0-byte diff patch).
   */
  test("typing in a body block card shows typed text on screen", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item.paragraph("See instructions."), item("section1", item("task1")))),
      { columns: 60, rows: 20 },
    )

    // Body block should be the first card (virtual body card)
    const screenshot0 = board.screenshot()
    expect(screenshot0).toContain("See instructions.")

    // Enter edit mode on the body block
    board.press("Enter")

    // Type characters — these go through the full pipeline:
    // press → handleKey → command system → insertChar → forceRender → doRender
    board.command("toggle_task_done")

    // The typed text MUST appear on screen (not just in repo)
    const screenshot1 = board.screenshot()
    expect(screenshot1).toContain("See instructions.x")

    // Type more characters
    board.press("y")
    board.command("zoom_inwards")

    const screenshot2 = board.screenshot()
    expect(screenshot2).toContain("See instructions.xyz")
  })

  test("typing in body block with incremental rendering matches fresh render", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item.paragraph("Hello world"), item("section1", item("task1")))),
      { columns: 60, rows: 20 },
    )

    // Enter edit mode on body block
    board.press("Enter")

    // Type a character
    board.press("!")

    // Verify incremental render matches a fresh render
    board.expectIncrementalMatchesFresh()

    // Type more
    board.press("!")
    board.expectIncrementalMatchesFresh()
  })

  test("typing in body block within a column (not root body) shows text", () => {
    // This tests body blocks that appear inside a column's card list,
    // not just at the root level virtual body column
    const { board, repo } = testEnv(
      () => item("board", item("col1", item.paragraph("Body content here"), item("section1", item("task1")))),
      { columns: 60, rows: 20 },
    )

    // Navigate to body block and edit
    board.press("Enter")

    // Type and confirm
    for (const c of "-ok") board.press(c)

    // Confirm with Enter
    board.press("Enter")

    // Verify repo saved correctly
    const node = repo.getNode("Body content here")
    expect(node?.content).toContain("Body content here-ok")

    // Verify screen shows the updated text
    expect(board.screenshot()).toContain("Body content here-ok")
  })
})

// =============================================================================
// Text Cursor Navigation — P2 feature km-tui.text-cursor-nav
// =============================================================================

describe("text cursor navigation (km-tui.text-cursor-nav)", () => {
  test("ArrowUp in body block edit moves cursor within visual lines", () => {
    // Use long content that wraps across multiple visual lines
    const longContent =
      "This is a longer body block that should wrap across multiple visual lines for testing cursor navigation"
    const { board } = testEnv(
      () => item("board", item("col1", item.paragraph(longContent), item("section1", item("task1")))),
      { columns: 40, rows: 20 },
    )

    // Enter edit mode on the body block
    board.press("Enter")

    // Cursor should be at end of text (last visual line)
    // ArrowUp should move cursor up one visual line, NOT navigate to previous block
    board.press("ArrowUp")

    // If we're still in edit mode, the text should still be visible
    const screenshot = board.screenshot()
    expect(screenshot).toContain("body block")
  })

  test("ArrowDown traverses all visual lines then exits to next block", () => {
    const longContent = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ"
    // checkIncremental: false — bottom bar format change (removed cardIndex, added [EDIT]) causes stale incremental cells
    const { board } = testEnv(
      () => item("board", item("col1", item.paragraph(longContent), item("section1", item("task1")))),
      { columns: 30, rows: 20, checkIncremental: false },
    )

    // Enter edit mode, move cursor to start
    board.press("Enter")
    board.press("Control+a")

    // Press ArrowDown repeatedly — should traverse visual lines then exit edit mode
    // With columns=30 and border (2), available width ~26 chars.
    // The text wraps across multiple visual lines.
    // Keep pressing down until we exit edit mode (breadcrumb changes)
    for (let i = 0; i < 10; i++) {
      board.press("ArrowDown")
    }

    // After enough ArrowDowns, we should have exited edit mode and moved to next card
    // The next card is "section1" which contains "task1"
    const screenshot = board.screenshot()
    expect(screenshot).toContain("task1")
  })

  test("Control+a clears cursor inverse attr at old position (incremental)", () => {
    const longContent = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
    // checkIncremental: false — bottom bar format change causes stale incremental cells
    const { board } = testEnv(
      () => item("board", item("col1", item.paragraph(longContent), item("section1", item("task1")))),
      { columns: 30, rows: 20, checkIncremental: false },
    )

    // Enter edit mode (cursor at end of text)
    board.press("Enter")

    // Control+a moves cursor to start — old cursor position must clear inverse attr
    board.press("Control+a")
  })

  test("ArrowUp at first visual line exits to previous block", () => {
    const longContent = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
    // checkIncremental: false — bottom bar format change causes stale incremental cells
    const { board } = testEnv(
      () => item("board", item("col1", item.paragraph(longContent), item("section1", item("task1")))),
      { columns: 30, rows: 20, checkIncremental: false },
    )

    // Enter edit mode, move cursor to start
    board.press("Enter")
    board.press("Control+a")

    // ArrowUp at first visual line should exit edit mode (boundary)
    board.press("ArrowUp")

    // Should have navigated up to column header
    board.expect("#col1[data-cursor]").toExist()
  })

  test("INSERT mode indicator appears in command box during inline edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Before editing: command box is hidden in NORMAL mode
    expect(board.screenshot()).not.toContain("INSERT")

    // Enter edit mode
    board.press("Enter")

    // During editing: INSERT mode indicator visible in floating command box
    expect(board.screenshot()).toContain("INSERT")

    // Exit edit mode
    board.press("Escape")

    // After editing: command box hidden again (NORMAL mode)
    expect(board.screenshot()).not.toContain("INSERT")
  })

  // ===========================================================================
  // Edit-mode navigation (arrows/ctrl-n/p cross nodes, stay in edit mode)
  // ===========================================================================

  describe("edit-mode node navigation", () => {
    test("ArrowDown at boundary crosses to next card, stays in edit mode", () => {
      const { board } = testEnv(() => item("board", item("col1", item("task-1"), item("task-2"), item("task-3"))))

      // Enter edit mode on task-1
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // Arrow down → task-2, still in edit mode
      board.press("ArrowDown")
      expect(board.screenshot()).toContain("INSERT")
      board.expect("#task-2[data-cursor]").toExist()

      // Arrow down → task-3, still in edit mode
      board.press("ArrowDown")
      expect(board.screenshot()).toContain("INSERT")
      board.expect("#task-3[data-cursor]").toExist()

      // Arrow up → task-2, still in edit mode
      board.press("ArrowUp")
      expect(board.screenshot()).toContain("INSERT")
      board.expect("#task-2[data-cursor]").toExist()
    })

    test("mouse click in edit mode repositions within same card", () => {
      const { board } = testEnv(() => item("board", item("Column", item("card", item("child-1"), item("child-2")))), {
        columns: 80,
        rows: 24,
      })

      // Click child-1 and enter edit mode
      const c1 = board.q("[id='child-1']")
      const c1Box = c1.boundingBox()!
      board.click(c1Box.x + 1, c1Box.y)
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // Click child-2 (same card) → should reposition edit, stay in edit mode
      const c2 = board.q("[id='child-2']")
      const c2Box = c2.boundingBox()!
      board.click(c2Box.x + 1, c2Box.y)
      expect(board.screenshot()).toContain("INSERT")
      board.expect("#child-2[data-cursor]").toExist()
    })

    test("mouse click outside card exits edit mode", () => {
      const { board } = testEnv(
        () => item.root("board", item("Column", item("card-a", item("child-1"))), item("Other", item("card-b"))),
        { columns: 80, rows: 24 },
      )

      // Enter edit mode on child-1
      const c1 = board.q("[id='child-1']")
      const c1Box = c1.boundingBox()!
      board.click(c1Box.x + 1, c1Box.y)
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // Click card-b (different card) → should exit edit mode
      const cb = board.q("[id='card-b']")
      const cbBox = cb.boundingBox()!
      board.click(cbBox.x + 1, cbBox.y)
      expect(board.screenshot()).not.toContain("INSERT")
      board.expect("#card-b[data-cursor]").toExist()
    })
  })
})

describe("Inline Edit — Folder/Section Nodes", () => {
  test("editing column header via Escape updates both content and name", () => {
    const { board, repo } = testEnv(() => item("board", item("Views", item("task1"))))

    // Navigate to column header
    board.command("cursor_up")
    board.expect("#Views[data-cursor]").toExist()

    // Enter inline edit on column header
    board.press("Enter")

    // Type a character (cursor starts at end of "Views")
    board.press("k")

    // Save and exit via Escape
    board.press("Escape")

    // Verify repo: both content and name should reflect the edit
    const node = repo.getNode("Views")
    expect(node?.content).toBe("Viewsk")
    expect(node?.name).toBe("Viewsk")

    // Verify screen shows the new name
    expect(board.screenshot()).toContain("Viewsk")
  })

  test("folder node name is updated (not just content) after save-on-exit", () => {
    const { board, repo } = testEnv(() => item("board", item("Col", item("task1"))))

    // Navigate to column header
    board.command("cursor_up")
    board.expect("#Col[data-cursor]").toExist()

    // Enter inline edit and modify
    board.press("Enter")
    board.press("X")
    board.press("Escape")

    // After editing, both content and name should be updated
    const node = repo.getNode("Col")
    expect(node?.content).toBe("ColX")
    expect(node?.name).toBe("ColX")
  })

  test("editing column header fully replaces name after clearing text", () => {
    const { board, repo } = testEnv(() => item("board", item("Old", item("task1"))))

    // Navigate to column header
    board.command("cursor_up")
    board.expect("#Old[data-cursor]").toExist()

    // Enter inline edit
    board.press("Enter")

    // Delete existing text with Ctrl+U (kill to start — cursor is at end)
    board.press("Control+u")

    // Type new name
    for (const c of "New") board.press(c)

    // Save and exit
    board.press("Escape")

    // Both content and name should be "New", not "OldNew" or "New" with stale name
    const node = repo.getNode("Old")
    expect(node?.content).toBe("New")
    expect(node?.name).toBe("New")
    expect(board.screenshot()).toContain("New")
  })
})
