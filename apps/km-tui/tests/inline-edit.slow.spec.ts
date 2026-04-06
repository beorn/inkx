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
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

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

  test("shifted punctuation chars insert correctly during inline edit", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("task"), item("1b"))))

    board.expect("#task[data-cursor]").toExist()
    board.press("Enter")

    // Type shifted punctuation: "#$%^&*"
    for (const ch of "#$%^&*") board.press(ch)

    board.press("Escape")

    // Verify repo has the shifted chars (data layer)
    expect(repo.getNode("task")?.content).toBe("task#$%^&*")

    // Verify screenshot shows them (rendering layer)
    expect(board.screenshot()).toContain("task#$%^&*")
  })

  test("mixed text with shifted chars saves correctly", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("item"), item("1b"))))

    board.expect("#item[data-cursor]").toExist()
    board.press("Enter")

    // Type realistic content: " (v2!)"
    for (const ch of " (v2!)") {
      if (ch === " ") board.press("Space")
      else board.press(ch)
    }

    board.press("Escape")

    expect(repo.getNode("item")?.content).toBe("item (v2!)")
    expect(board.screenshot()).toContain("item (v2!)")
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
    board.press("ctrl+a")
    board.press("Delete")
    board.press("Escape") // save+exit (Enter splits in outliner mode)

    expect(repo.getNode("ab")?.content).toBe("b")
    expect(board.screenshot()).not.toContain("ab")
  })

  test("Ctrl shortcuts (ctrl+A, ctrl+W) work through input layers", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("xyz"))))

    board.press("Enter")
    // xyz| → Ctrl+A → |xyz → type "0" → 0xyz
    board.press("ctrl+a")
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
      taskNode.item = { ...taskNode.item, task: { status: "done", marker: "[x]" } }
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
      taskNode.item = { ...taskNode.item, task: { status: "todo", marker: "[ ]" } }
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
    board.press("ctrl+a") // cursor to start
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
    board.press("ctrl+a") // cursor to start
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
    board.press("ctrl+u")
    board.press("Enter") // empty text, cursor at end → sibling after

    // alpha now has empty content
    const content = repo.getNode("alpha")?.content ?? ""
    expect(content).toBe("")

    // New sibling created
    board.press("Escape")
    const siblings = repo.getChildren("col1")
    expect(siblings.length).toBe(2) // alpha + new
  })

  // ── Folded children (hidden by depth limit) ────────────────

  test("end, folded children (depth limit) → sibling after, not hidden child", () => {
    // CardColumn renders with remainingDepth=2, so:
    //   card: depth=0, remainingDepth=2
    //   sub1: depth=1, remainingDepth=1 → full TreeNode, navigable
    //   sub1's ChildrenList: remainingDepth=0 → allFolded → children are FoldedChildRow
    // When cursor is on sub1 (which has children rendered as FoldedChildRow),
    // Enter at end of title should create sibling (not child at the folded level).
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("card", item("sub1", item("gc1"), item("gc2")), item("sub2")))),
    )

    // Navigate to sub1
    board.expect("#card[data-cursor]").toExist()
    board.command("block_nav_down") // → sub1
    board.expect("#sub1[data-cursor]").toExist()

    // Enter inline edit → cursor at end of "sub1"
    board.press("Enter")
    // Press Enter again → should create sibling after sub1 (not child)
    board.press("Enter")

    // Exit edit mode on the new node
    board.press("Escape")

    // sub1 should NOT have gained a new child — still just gc1, gc2
    const sub1Children = repo.getChildren("sub1")
    expect(sub1Children.map((n) => n.id)).toEqual(["gc1", "gc2"])

    // New node should be a sibling of sub1 (child of card)
    const cardChildren = repo.getChildren("card")
    expect(cardChildren.length).toBe(3) // sub1 + new sibling + sub2
    const sub1Idx = cardChildren.findIndex((n) => n.id === "sub1")
    const sub2Idx = cardChildren.findIndex((n) => n.id === "sub2")
    expect(sub1Idx).toBe(0) // sub1 still first
    // New sibling should be between sub1 and sub2
    expect(sub2Idx).toBe(2)
  })

  test("middle, folded children (depth limit) → split as sibling, not child", () => {
    // Same depth scenario: sub-item at depth 1 has children that are FoldedChildRow.
    // Split at middle should produce sibling, not child.
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("card", item("abcd", item("deep1")), item("sub2")))),
    )

    // Navigate to "abcd" (sub-item with folded child)
    board.command("block_nav_down") // → abcd
    board.expect("#abcd[data-cursor]").toExist()

    // Enter inline edit, move cursor to middle (ab|cd)
    board.press("Enter")
    board.press("ArrowLeft")
    board.press("ArrowLeft")
    board.press("Enter") // → split: "ab" stays, "cd" becomes sibling (not child)

    board.press("Escape")

    // "abcd" node should have truncated content (just "ab")
    const origContent = repo.getNode("abcd")?.content ?? ""
    expect(origContent).toContain("ab")
    expect(origContent).not.toContain("cd")

    // "cd" should be sibling of "abcd" (child of card), not child of "abcd"
    const cardChildren = repo.getChildren("card")
    const abIdx = cardChildren.findIndex((n) => (n.content ?? "").includes("ab"))
    const cdIdx = cardChildren.findIndex((n) => (n.content ?? "").includes("cd"))
    expect(abIdx).toBeLessThan(cdIdx)

    // split() moves children to the after-node: "ab" has no children, "cd" inherits deep1
    const abcdChildren = repo.getChildren("abcd")
    expect(abcdChildren.length).toBe(0)
    const cdNode = cardChildren.find((n) => (n.content ?? "").includes("cd"))
    const cdChildren = repo.getChildren(cdNode!.id)
    expect(cdChildren.length).toBe(1)
    expect(cdChildren[0]!.id).toBe("deep1")
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
    board.command("fold_more")
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
// Enter on symlink_to (transclusion) nodes — mimics @next board
// =============================================================================

describe("Outliner Enter — symlink_to nodes (transclusion)", () => {
  /** Build a board with a column containing symlink_to nodes, like @next */
  function linkBoard() {
    const nodes = item("board", item("col1", item("link-a"), item("link-b"), item("link-c")))
    // Create target nodes that the links point to
    const targetA: KNode = {
      id: "target-a",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Target task A",
      parent_id: "other-file",
      parent_idx: 0,
      symlink_to: null,
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
      fstype: "folder",
      content: undefined,
      data: { name: "Other File" },
      parent_id: ".",
      parent_idx: 100,
      symlink_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    // Make the card nodes into links
    for (const n of nodes) {
      if (n.id === "link-a") {
        n.symlink_to = "target-a"
        n.content = "Target task A"
        n.item = { ...n.item, task: { status: "todo", marker: "[ ]" } }
      }
      if (n.id === "link-b") {
        n.symlink_to = "target-b"
        n.content = "Target task B"
        n.item = { ...n.item, task: { status: "todo", marker: "[ ]" } }
      }
      if (n.id === "link-c") {
        n.symlink_to = "target-c"
        n.content = "Target task C"
        n.item = { ...n.item, task: { status: "todo", marker: "[ ]" } }
      }
    }

    return [...nodes, otherFile, targetA, targetB, targetC]
  }

  test("Enter on symlink_to card creates new sibling and shows it", () => {
    const { board, repo } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a (shows Target task A)
    board.press("Enter") // save + create sibling

    // DOM: 4 items in column (was 3)
    board.expect(colItems("col1")).toHaveCount(4)
  })

  test("Enter on symlink_to card: new sibling is a regular node, not a link", () => {
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
    expect(newNode!.symlink_to).toBeNull()
    expect(newNode!.content).toBe("") // empty new node
  })

  test("Multiple Enters on symlink_to board create chain of siblings", () => {
    const { board } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a
    board.press("Enter") // save + sibling1
    board.press("Enter") // save sibling1 + sibling2
    board.press("Enter") // save sibling2 + sibling3

    // DOM: 3 original links + 3 new siblings
    board.expect(colItems("col1")).toHaveCount(6)
  })

  test("keybindings work after Enter on symlink_to node", () => {
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
   * - symlink_to points to resolved target
   * - Content is the ![[...]] syntax
   */
  function paragraphLinkBoard() {
    const nodes = item("board", item("col1", item("link-a"), item("link-b"), item("link-c")))
    // Create target nodes that the links point to
    const targetA: KNode = {
      id: "target-a",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Target task A",
      parent_id: "other-file",
      parent_idx: 0,
      symlink_to: null,
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
      fstype: "folder",
      content: undefined,
      data: { name: "Other File" },
      parent_id: ".",
      parent_idx: 100,
      symlink_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    // Make the card nodes into paragraph-type embeds (matching real vault)
    for (const n of nodes) {
      if (n.id === "link-a") {
        n.type = "p"
        n.symlink_to = "target-a"
        n.content = "![[Other File#^a1]]"
      }
      if (n.id === "link-b") {
        n.type = "p"
        n.symlink_to = "target-b"
        n.content = "![[Other File#^b2]]"
      }
      if (n.id === "link-c") {
        n.type = "p"
        n.symlink_to = "target-c"
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

  test("non-active body blocks render via TreeNode (preserves structure) during inline edit mode", () => {
    // After km-tui.body-edit-structure (P1): non-active body blocks render via
    // TreeNode in display mode so they keep their bullets, checkboxes, and
    // indentation. They no longer use the cardBorderEditing color override —
    // the cyan card border + inverse cursor are sufficient edit indicators.
    const { board } = testEnv(() =>
      item("board", item("col", item("task1", item.p("body line 1"), item.p("body line 2")))),
    )

    // Enter inline edit mode
    board.press("Enter")

    // Body text remains visible in the card content area while editing the title
    const bodyRow = findContentRow(board, "body line 1")
    expect(bodyRow, "body line 1 should be visible in card content area").toBeGreaterThanOrEqual(0)
    expect(board.screenshot()).toContain("body line 2")
  })

  test("navigating to body block does not add blue background", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1", item.p("body text"), item.p("more text")))))

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
      () => item("board", item("col1", item.p("See instructions."), item("section1", item("task1")))),
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
      () => item("board", item("col1", item.p("Hello world"), item("section1", item("task1")))),
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
      () => item("board", item("col1", item.p("Body content here"), item("section1", item("task1")))),
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
    const { board } = testEnv(() => item("board", item("col1", item.p(longContent), item("section1", item("task1")))), {
      columns: 40,
      rows: 20,
    })

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
    const { board } = testEnv(() => item("board", item("col1", item.p(longContent), item("section1", item("task1")))), {
      columns: 30,
      rows: 20,
      checkIncremental: false,
    })

    // Enter edit mode, move cursor to start
    board.press("Enter")
    board.press("ctrl+a")

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

  test("ctrl+a clears cursor inverse attr at old position (incremental)", () => {
    const longContent = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
    // checkIncremental: false — bottom bar format change causes stale incremental cells
    const { board } = testEnv(() => item("board", item("col1", item.p(longContent), item("section1", item("task1")))), {
      columns: 30,
      rows: 20,
      checkIncremental: false,
    })

    // Enter edit mode (cursor at end of text)
    board.press("Enter")

    // ctrl+a moves cursor to start — old cursor position must clear inverse attr
    board.press("ctrl+a")
  })

  test("ArrowUp at first visual line exits to previous block", () => {
    const longContent = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
    // checkIncremental: false — bottom bar format change causes stale incremental cells
    const { board } = testEnv(() => item("board", item("col1", item.p(longContent), item("section1", item("task1")))), {
      columns: 30,
      rows: 20,
      checkIncremental: false,
    })

    // Enter edit mode, move cursor to start
    board.press("Enter")
    board.press("ctrl+a")

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

    test("ctrl-n from card saves edit before navigating to next card", () => {
      const { board, repo } = testEnv(() => item("board", item("col1", item("task-1"), item("task-2"))))

      // Edit task-1 title
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // Type at end of title
      board.press("X")

      // ctrl-n to next card
      board.press("ctrl+n")
      board.expectEditing("task-2")

      // task-1 should be saved with the "X" appended
      expect(repo.getNode("task-1")?.content).toContain("X")
    })

    test("ctrl-n from sub-section saves edit before navigating to sibling", () => {
      const { board, repo } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
            item("card-2"),
          ),
        ),
      )

      // Edit sub-a's body block (blockIndex=1 = child-a1), so ctrl-n crosses to sub-b
      board.editNode("sub-a", { block: 1, card: "card-1" })
      expect(board.screenshot()).toContain("INSERT")

      // Type at end
      board.press("Y")

      // ctrl-n to sibling sub-b
      board.press("ctrl+n")
      board.expectEditing("sub-b")

      // child-a1 (the body block we edited) should be saved
      expect(repo.getNode("child-a1")?.content).toContain("Y")
    })

    test("ctrl-n from body block navigates to next sibling outline item", () => {
      // Bug: clicking directly on a paragraph (type=p) body block then pressing ctrl-n
      // fails with 'no adjacent node' because findAdjacentEditNode only checks
      // extractBody().items (outline nodes), not body blocks.
      // Note: sub-a/sub-b need children to be outline headings (type "h"), not leaf tasks (type "p")
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item.p("body-para"), item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
          ),
        ),
      )

      // Edit the body paragraph directly (blockIndex=0 on the paragraph node itself)
      board.editNode("body-para", { card: "card-1" })
      expect(board.screenshot()).toContain("INSERT")

      // ctrl-n should navigate to the next outline item (sub-a), not error
      board.press("ctrl+n")
      board.expectEditing("sub-a")
    })

    test("ctrl-n from body block traverses siblings sequentially", () => {
      // Real vault structure: heading has body paragraphs + leaf tasks, ALL type "p".
      // None are outline items. ctrl-n should traverse them in order via parent blockIndex.
      // Body blocks resolve to parent node with blockIndex: 0=title, 1+=body blocks.
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item.p("para-1"), item.p("para-2"), item("task-a"), item("task-b")),
            item("card-2"),
          ),
        ),
      )

      const editBlock = () => board.getAppState().sel.text()

      // Edit para-1 directly (as if user clicked on it)
      board.editNode("para-1", { card: "card-1" })
      expect(board.screenshot()).toContain("INSERT")

      // ctrl-n should resolve to parent (card-1) and advance blockIndex to para-2
      board.press("ctrl+n")
      expect(editBlock()?.nodeId).toBe("card-1")
      expect(board.getAppState().textEditHints?.blockIndex).toBe(2) // 0=title, 1=para-1, 2=para-2

      // ctrl-n again → blockIndex 3 (task-a)
      board.press("ctrl+n")
      expect(editBlock()?.nodeId).toBe("card-1")
      expect(board.getAppState().textEditHints?.blockIndex).toBe(3)

      // ctrl-n again → blockIndex 4 (task-b)
      board.press("ctrl+n")
      expect(editBlock()?.nodeId).toBe("card-1")
      expect(board.getAppState().textEditHints?.blockIndex).toBe(4)

      // ctrl-n past last body block → next card
      board.press("ctrl+n")
      board.expectEditing("card-2")
    })

    test("ArrowDown from sub-section navigates to next sibling, not first card", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
            item("card-2"),
          ),
        ),
      )

      // Enter edit on sub-a, last block (blockIndex=1) so ArrowDown crosses boundary
      board.editNode("sub-a", { block: 1, card: "card-1" })
      expect(board.screenshot()).toContain("INSERT")

      board.press("ArrowDown")
      board.expectEditing("sub-b")
    })

    test("ArrowDown from last sub-section navigates to next card", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
            item("card-2"),
          ),
        ),
      )

      board.editNode("sub-b", { block: 1, card: "card-1" })
      expect(board.screenshot()).toContain("INSERT")

      board.press("ArrowDown")
      board.expectEditing("card-2")
    })

    test("ArrowUp from first sub-section navigates to previous card", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1"),
            item("card-2", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
          ),
        ),
      )

      board.navigateTo("card-2")
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      board.editNode("sub-a", { block: 0, card: "card-2" })

      board.press("ArrowUp")
      board.expectEditing("card-1")
    })

    test("ArrowDown from section title enters first outline child, not next sibling", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item(
              "card",
              item("section-a", item("subsec-1", item("task-x")), item("subsec-2", item("task-y"))),
              item("section-b", item("task-z")),
            ),
          ),
        ),
      )

      board.editNode("section-a", { block: 0, card: "card" })
      board.press("ArrowDown")
      board.expectEditing("subsec-1")
    })

    test("ArrowUp from sibling enters previous sibling's DFS-last descendant", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item(
              "card",
              item("section-a", item("subsec-1", item("task-x")), item("subsec-2", item("task-y"))),
              item("section-b", item("task-z")),
            ),
          ),
        ),
      )

      board.editNode("section-b", { block: 0, card: "card" })
      board.press("ArrowUp")
      board.expectEditing("task-y")
    })

    test("navigating between sub-sections preserves cardNodeId (card stays expanded)", () => {
      const { board, store } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
            item("card-2"),
          ),
        ),
      )

      board.editNode("sub-a", { block: 1, card: "card-1" })

      // Navigate to sub-b
      board.press("ArrowDown")
      board.expectEditing("sub-b")

      // Both sub-sections should still be visible (card not collapsed)
      const shot = board.screenshot()
      expect(shot).toContain("sub-a")
      expect(shot).toContain("sub-b")
      expect(shot).toContain("child-a1")
      expect(shot).toContain("child-b1")
    })

    test("ctrl-p into card above lands on DFS-last descendant (true bottom)", () => {
      // Card with nested sub-sections: card-1 > sub-a > deep-a > leaf-a, sub-b > deep-b > leaf-b
      // When navigating UP from card-2, should land on leaf-b (DFS-last descendant),
      // not deep-b or sub-b — walkTree finds the true bottom of the card subtree.
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item(
              "card-1",
              item("sub-a", item("deep-a", item("leaf-a"))),
              item("sub-b", item("deep-b", item("leaf-b"))),
            ),
            item("card-2"),
          ),
        ),
      )

      board.navigateTo("card-2")
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // ArrowUp should land on leaf-b (DFS-last — true bottom of card-1)
      board.press("ArrowUp")
      board.expectEditing("leaf-b")
    })

    test("ctrl-p DFS-last includes body blocks, not just outline items", () => {
      // Structure: card-1 has sub-items where each sub-item has children (body blocks).
      // The old findDeepestLast only walked extractBody().items (outline headings),
      // missing body blocks entirely. The fix uses walkTree DFS to find the true last node.
      //
      // card-1
      //   sub-a (heading — has children)
      //     child-a1 (leaf — body block of sub-a)
      //   sub-b (heading — has children)
      //     child-b1 (leaf — body block of sub-b)  ← DFS-last
      // card-2  ← start here, press ctrl-p
      const { board } = testEnv(() =>
        item(
          "board",
          item(
            "col1",
            item("card-1", item("sub-a", item("child-a1")), item("sub-b", item("child-b1"))),
            item("card-2"),
          ),
        ),
      )

      // Navigate to card-2 and enter edit mode
      board.navigateTo("card-2")
      board.press("Enter")
      expect(board.screenshot()).toContain("INSERT")

      // ctrl-p should land on child-b1 (DFS-last descendant of card-1),
      // NOT sub-b (which is what the old items-only traversal would pick)
      board.press("ArrowUp")
      board.expectEditing("child-b1")
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
    board.press("ctrl+u")

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

  // ===========================================================================
  // Regression: km-tui.rename-column-cursor-null
  //
  // Renaming a column to a sigil-prefixed name (e.g. "name" → "+name") used to
  // produce two related failures:
  //   (1) the post-rename invariant pass threw InvariantViolationError
  //       ("cursor-not-null") because the cursor was not re-anchored,
  //   (2) the rendered column header still showed the stale name because
  //       getNodeDisplayName prefers `data.name`, which renameNode never
  //       updated.
  //
  // The fix re-anchors the cursor after the rename completes and keeps
  // `data.name` in sync with `name`/`content`.
  // ===========================================================================
  test("renaming column to sigil-prefixed name keeps cursor valid and updates display", () => {
    const { board, repo } = testEnv(() => item("board", item("name", item("task1"))))

    // Move to column header so the inline edit targets the column (folder) node
    board.command("cursor_up")
    board.expect("#name[data-cursor]").toExist()

    // Enter inline edit on the column header
    board.press("Enter")

    // Clear existing text and type the new sigil-prefixed name.
    // "+" must be sent as Shift+= because keyToAnsi splits on "+" for combos.
    board.press("ctrl+u")
    board.press("Shift+=")
    for (const c of "name") board.press(c)

    // Save and exit — used to throw InvariantViolationError("cursor-not-null")
    board.press("Escape")

    // Repo reflects the rename — content, name, and data.name must all update
    // so that getNodeDisplayName (which prefers data.name) renders the new label.
    const node = repo.getNode("name")
    expect(node?.content).toBe("+name")
    expect(node?.name).toBe("+name")
    expect((node?.data as { name?: string } | undefined)?.name).toBe("+name")

    // Cursor should still resolve to the renamed column header
    board.expect("#name[data-cursor]").toExist()
    expect(board.screenshot()).toContain("+name")
  })

  test("renaming column (no sigil) keeps cursor valid and updates display", () => {
    // Sanity check: a plain rename of a column header should also leave the
    // cursor selection and the rendered display name consistent.
    const { board, repo } = testEnv(() => item("board", item("Old", item("task1"))))

    board.command("cursor_up")
    board.expect("#Old[data-cursor]").toExist()

    board.press("Enter")
    board.press("ctrl+u")
    for (const c of "New") board.press(c)
    board.press("Escape")

    const node = repo.getNode("Old")
    expect(node?.name).toBe("New")
    expect((node?.data as { name?: string } | undefined)?.name).toBe("New")
    board.expect("#Old[data-cursor]").toExist()
    expect(board.screenshot()).toContain("New")
  })
})

// =============================================================================
// Empty Board — first child creation (km-tui.empty-board-edit)
// =============================================================================

describe("Empty Board — first child creation", () => {
  test("o creates column, Enter creates column, Escape cancels edit", () => {
    const { board, repo } = testEnv(() => item("board"))
    expect(board.screenshot()).toContain("Empty board")

    // --- o creates first column heading, enters edit ---
    board.press("o")
    expect(board.screenshot()).not.toContain("Empty board")
    const children1 = repo.getChildren("board")
    expect(children1.length).toBe(1)
    expect(children1[0]!.type).toBe("h")

    // Type name and save
    for (const ch of "Todo") board.press(ch)
    board.press("Escape")
    expect(repo.getNode(children1[0]!.id)?.content).toBe("Todo")
    expect(board.screenshot()).toContain("Todo")
  })

  test("Enter on empty board also creates first column", () => {
    const { board, repo } = testEnv(() => item("board"))
    expect(board.screenshot()).toContain("Empty board")

    board.press("Enter")
    expect(board.screenshot()).not.toContain("Empty board")

    for (const ch of "Inbox") board.press(ch)
    board.press("Escape")

    const children = repo.getChildren("board")
    expect(children.find((c: KNode) => c.content === "Inbox")).toBeDefined()
    expect(board.screenshot()).toContain("Inbox")
  })

  test("Escape during first-column edit saves empty content (column persists)", () => {
    const { board, repo } = testEnv(() => item("board"))

    // Create column but immediately Escape without typing
    board.press("o")
    board.press("Escape")

    // Column should still exist (with empty content)
    const children = repo.getChildren("board")
    expect(children.length).toBe(1)
    // Board should not show "Empty board" anymore — a column exists
    expect(board.screenshot()).not.toContain("Empty board")
  })

  test("journey: add cards to column, edit, delete", () => {
    // Board with one column and one card — standard starting point
    const { board, repo } = testEnv(() => item("board", item("Todo", item("First"))))

    expect(board.screenshot()).toContain("Todo")
    expect(board.screenshot()).toContain("First")

    // Step 1: Cursor on "First" card, press o to add sibling below
    board.press("o")
    for (const ch of "Second") board.press(ch)
    board.press("Escape")

    // Verify both cards exist
    let cards = repo.getChildren("Todo")
    expect(cards.find((c: KNode) => c.content === "First")).toBeDefined()
    expect(cards.find((c: KNode) => c.content === "Second")).toBeDefined()
    expect(board.screenshot()).toContain("Second")

    // Step 2: Add a third card
    board.press("o")
    for (const ch of "Third") board.press(ch)
    board.press("Escape")

    cards = repo.getChildren("Todo")
    expect(cards.find((c: KNode) => c.content === "Third")).toBeDefined()

    // Step 3: Delete last card (cursor on "Third")
    board.press("Backspace")

    cards = repo.getChildren("Todo")
    expect(cards.find((c: KNode) => c.content === "Third")).toBeUndefined()
    expect(cards.find((c: KNode) => c.content === "Second")).toBeDefined()
    expect(board.screenshot()).not.toContain("Third")
    expect(board.screenshot()).toContain("Second")

    // Step 4: Edit "Second" — Enter appends text
    board.press("Enter")
    for (const ch of " task") board.press(ch)
    board.press("Escape")

    const secondNode = cards.find((c: KNode) => c.content === "Second")!
    expect(repo.getNode(secondNode.id)?.content).toBe("Second task")
  })

  test("edit existing column title via Enter, append and save", () => {
    const { board, repo } = testEnv(() => item("board"))

    // Create a column
    board.press("o")
    for (const ch of "Col") board.press(ch)
    board.press("Escape")

    const colNode = repo.getChildren("board")[0]!
    expect(colNode.content).toBe("Col")

    // Edit the column title: Enter enters edit at end, type more, Escape saves
    board.press("Enter")
    for (const ch of "umn") board.press(ch)
    board.press("Escape")

    // Content should have "umn" appended
    expect(repo.getNode(colNode.id)?.content).toBe("Column")
    expect(board.screenshot()).toContain("Column")
  })

  test("double-click on column header enters inline edit", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"))))

    // Find column header position and double-click
    const screenshot = board.screenshot()
    // The column header "col1" should be at the top
    expect(screenshot).toContain("col1")

    // Double-click should enter edit mode on the column
    // Since we're testing from driver level, we use keyboard to simulate
    board.command("cursor_up") // card → column
    board.expect("#col1[data-cursor]").toExist()

    // Enter to edit (from column header)
    board.press("Enter")

    // Type new content
    for (const ch of "-edited") board.press(ch)

    // Escape to save
    board.press("Escape")

    // Verify the content was saved to the repo
    const col1Node = repo.getNode("col1")
    expect(col1Node?.content).toBe("col1-edited")
    expect(board.screenshot()).toContain("col1-edited")
  })

  test("click on column header selects it (doesn't move to board root)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // Simulate clicking on column header:
    // For keyboard, we can test that h/l navigation to column works
    board.command("cursor_down") // Go to a card
    board.command("cursor_down") // Make sure we're on a card
    board.command("cursor_left") // Move to column level (h navigation)

    // Now we should be at the first column level
    // The test verifies we didn't deselect to board root
    board.expect("#col1[data-cursor]").toExist()
  })

  test("column title inline edit: Escape saves and exits edit mode", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"))))

    // Move to column header and enter edit
    board.command("cursor_up")
    board.press("Enter")

    // Type some changes
    for (const ch of "-escaped") board.press(ch)

    // Escape saves and exits edit mode
    board.press("Escape")

    // Repo should have the changes saved
    expect(repo.getNode("col1")?.content).toContain("col1-escaped")
    expect(board.screenshot()).toContain("col1-escaped")

    // Should be back at column level (not in edit mode)
    board.expect("#col1[data-cursor]").toExist()
  })

  test("column title inline edit: Enter confirms (saves to repo)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"))))

    // Move to column header and enter edit
    board.command("cursor_up")
    board.press("Enter")

    // Type some changes
    for (const ch of "-confirmed") board.press(ch)

    // Enter confirms and saves
    board.press("Enter")

    // Repo should have updated content (with the appended text at end)
    const updatedContent = repo.getNode("col1")?.content ?? ""
    expect(updatedContent).toContain("col1-confirmed")
    expect(board.screenshot()).toContain("col1-confirmed")
  })
})

describe("Inline Edit — Card Expansion", () => {
  test("entering edit on a sub-item expands the full card to show all children", () => {
    // Card with 5 children — maxContentLines defaults to 3, so only 3 are visible normally
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("sub1"), item("sub2"), item("sub3"), item("sub4"), item("sub5")))),
    )

    // Cursor is on "card" by default
    board.expect("#card[data-cursor]").toExist()

    // Verify sub4 and sub5 are NOT visible initially (beyond maxContentLines=3)
    const beforeShot = board.screenshot()
    expect(beforeShot).toContain("sub1")
    expect(beforeShot).toContain("sub2")
    expect(beforeShot).toContain("sub3")

    // Simulate entering inline edit on a sub-item (e.g., via double-click).
    // cardNodeId tells the card to expand and show all children.
    board.editNode("sub2", { card: "card" })

    // The full card should be expanded — all sub-items visible
    const afterShot = board.screenshot()
    expect(afterShot).toContain("sub1")
    expect(afterShot).toContain("sub2")
    expect(afterShot).toContain("sub3")
    expect(afterShot).toContain("sub4")
    expect(afterShot).toContain("sub5")
  })

  test("card auto-expands when cursor navigates to child below maxContentLines fold", () => {
    // Card with 5 children — maxContentLines defaults to 3, so children 4+ are hidden
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("sub1"), item("sub2"), item("sub3"), item("sub4"), item("sub5")))),
    )

    // Verify sub4 and sub5 are NOT visible initially (beyond maxContentLines=3)
    const beforeShot = board.screenshot()
    expect(beforeShot).toContain("sub1")
    expect(beforeShot).toContain("sub3")
    expect(beforeShot).not.toContain("sub5")

    // Navigate cursor into card's children via block_nav_down (J), then cursor_down (j) through siblings
    board.command("block_nav_down") // enter card → sub1
    board.expect("#sub1[data-cursor]").toExist()
    board.command("cursor_down") // → sub2
    board.command("cursor_down") // → sub3
    board.command("cursor_down") // → sub4
    board.command("cursor_down") // → sub5

    // Card should auto-expand to show the cursor target
    board.expect("#sub5[data-cursor]").toExist()
    expect(board.screenshot()).toContain("sub5")
  })

  test("editing sub-sub-item expands intermediate parent nodes", () => {
    // Nested structure: card > section > deep items (deep-d and deep-e beyond section's fold)
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item("card", item("section", item("deep-a"), item("deep-b"), item("deep-c"), item("deep-d"), item("deep-e"))),
        ),
      ),
    )

    // deep-e is nested 2 levels deep and beyond section's maxContentLines — not visible initially
    const beforeShot = board.screenshot()
    expect(beforeShot).toContain("deep-a")
    expect(beforeShot).not.toContain("deep-e")

    // Enter edit on deep-e — both card AND section should expand to show it
    board.editNode("deep-e")

    // deep-e should now be visible — all ancestor nodes expanded
    const afterShot = board.screenshot()
    expect(afterShot).toContain("deep-e")
  })
})

describe("edit indentation parity", () => {
  test("body content indentation matches between display and edit mode", () => {
    // Card with body content (paragraph-like items before a heading)
    const nodes = item("board", item("col1", item("parent", item.p("body child"), item.section("heading"))))
    const { board } = testEnv(() => nodes, { columns: 60, rows: 20 })

    // Navigate to the "parent" card
    board.expect("#parent[data-cursor]").toExist()

    // Find "body child" position in display mode
    const displayBox = board.screen.nodeBox("body child")
    expect(displayBox, "body child should be visible in display mode").not.toBeNull()
    const displayX = displayBox!.x

    // Enter edit mode on "body child" (cursor down into body, then Enter)
    board.command("cursor_down") // move to body child
    board.press("Enter") // enter edit

    // Find "body child" position in edit mode
    const editRow = board.screen.findRow("body child")
    expect(editRow, "body child should be visible in edit mode").not.toBeNull()
    if (!editRow) return
    const editLine = board.screen.row(editRow)
    const editX = editLine.indexOf("body child")

    // Indentation should be the same (±1 char for cursor/gutter)
    expect(
      Math.abs(editX - displayX),
      `edit indent (${editX}) should be close to display indent (${displayX})`,
    ).toBeLessThanOrEqual(2)
  })

  // =============================================================================
  // BUG: BodyBlockEditor flattens tree structure (km-tui.body-edit-structure)
  // =============================================================================
  // When editing a card title, body sub-items (tasks/list items) lost their
  // bullets/checkboxes/indentation because BodyBlockEditor rendered them as
  // raw <Text dimColor>{InlineText}</Text> instead of via TreeNode.
  //
  // Fix: render non-active body blocks via TreeNode (display mode) so they
  // preserve bullets, checkboxes, indentation, and width constraints.
  // =============================================================================

  test("editing card title preserves checkbox icons on non-active body sub-items", () => {
    // Card with body sub-items that are tasks (have checkboxes)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("parent-card", item.task("subtask one", "todo"), item.task("subtask two", "todo"))),
        ),
      { columns: 60, rows: 20 },
    )

    // Verify checkboxes are present in display mode (sanity check)
    const displayShot = board.screenshot()
    expect(displayShot, "display mode should contain checkbox glyph for sub-tasks").toContain("\u25A1")
    expect(displayShot).toContain("subtask one")
    expect(displayShot).toContain("subtask two")

    // Enter edit mode on the parent-card title (block 0)
    board.expect("#parent-card[data-cursor]").toExist()
    board.press("Enter")

    // While editing the TITLE, non-active body sub-items must still render
    // with their checkbox glyph — they should look like display mode, not flat text.
    const editShot = board.screenshot()
    expect(editShot, "edit mode must still show subtask one").toContain("subtask one")
    expect(editShot, "edit mode must still show subtask two").toContain("subtask two")
    expect(editShot, "edit mode must preserve the checkbox glyph (\u25A1) on non-active body sub-items").toContain(
      "\u25A1",
    )
  })
})

// =============================================================================
// BUG: Ctrl+N from last card jumps to column header (km-tui.edit-nav-column-jump)
// =============================================================================

describe("edit block navigate: Ctrl+N from last card should not jump to column header", () => {
  test("Ctrl+N from last card in col1 navigates to first card of col2, not col2 header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("card-a"), item("card-b")), item("col2", item("card-c"), item("card-d"))),
    )

    // Navigate to last card in col1
    board.navigateTo("card-b")
    board.press("Enter") // enter edit mode

    // Ctrl+N past last card should go to first card of next column, not the column header
    board.press("ctrl+n")
    board.expectEditing("card-c") // should be first card of col2, NOT "col2"
  })
})

// =============================================================================
// BUG: Ctrl+Z in edit mode crashes TUI (km-tui.edit-undo-crash)
// =============================================================================

describe("edit undo: Ctrl+Z during inline edit should not crash", () => {
  test("Ctrl+Z in edit mode cleanly exits edit without crash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("card-a"), item("card-b"))))

    board.expect("#card-a[data-cursor]").toExist()

    // Enter edit mode
    board.press("Enter")
    board.expectEditing("card-a")

    // Ctrl+Z during edit mode should exit edit cleanly (no crash)
    board.press("ctrl+z")

    // Should no longer be editing
    board.expectNotEditing()

    // Board should still be functional — cursor navigation works
    board.command("cursor_down")
    board.expect("#card-b[data-cursor]").toExist()
  })

  test("Ctrl+Z during active typing in edit mode discards unsaved changes", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("card-a"))))

    board.expect("#card-a[data-cursor]").toExist()

    // Enter edit mode and start typing (changes are in-flight, not saved)
    board.press("Enter")
    for (const c of "-new") board.press(c)

    // Ctrl+Z during active edit — should exit edit mode without crash
    // and discard unsaved changes (cancel, not confirm)
    board.press("ctrl+z")

    // Should exit edit mode cleanly
    board.expectNotEditing()

    // Content should be unchanged (the typing was never saved via confirm/Escape)
    expect(repo.getNode("card-a")?.content).toBe("card-a")
  })

  test("undo after structural operation works when triggered from edit mode", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("card-a"), item("card-b"))))

    // Make a structural change (priority) that creates an undo entry
    board.expect("#card-a[data-cursor]").toExist()
    board.command("set_priority") // creates undo entry via undoable repo

    // Enter edit mode
    board.press("Enter")
    board.expectEditing("card-a")

    // Ctrl+Z during edit should exit edit and undo the priority change
    board.press("ctrl+z")

    board.expectNotEditing()
  })
})

// =============================================================================
// BUG: Shift+Tab outdent promotes subitem to column level (km-tui.edit-outdent-promote)
// =============================================================================

describe("edit outdent: Shift+Tab should not promote subitem beyond card", () => {
  test("Shift+Tab on direct card child during edit does not promote to column level", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("card", item("sub1"), item("sub2")))))

    // Navigate to the card, then block-nav into sub1
    board.expect("#card[data-cursor]").toExist()
    board.command("block_nav_down") // → sub1
    board.expect("#sub1[data-cursor]").toExist()

    board.press("Enter") // enter edit mode on sub1
    board.expectEditing("sub1")

    // sub1 is a direct child of card. Shift+Tab should NOT promote it to column level.
    board.press("shift+Tab")

    // sub1 should still be a child of card, NOT promoted to col1
    const sub1 = repo.getNode("sub1")
    expect(sub1?.parent_id, "sub1 should stay inside card during edit").toBe("card")
  })
})

// =============================================================================
// Empty card heading: navigation keys must NOT corrupt data (km-tui.empty-card-key-capture)
// =============================================================================

describe("Enter on heading card with children zooms instead of editing (km-tui.enter-heading-insert)", () => {
  test("Enter on heading card with children zooms in, does not enter INSERT mode", () => {
    // A heading card (type "h") with children — pressing Enter should zoom in,
    // not enter inline edit mode. Edit mode hides checkbox indicators and is
    // unexpected behavior on a section heading.
    const { board } = testEnv(() =>
      item("board", item("col1", item("Tasks", item("task1"), item("task2")), item("leaf"))),
    )

    // Cursor starts on "Tasks" — the first card in col1
    board.expect("#Tasks[data-cursor]").toExist()

    // Press Enter — should zoom in, not enter edit mode
    board.press("Enter")

    // Should NOT be in edit mode (INSERT)
    board.expectNotEditing()
    expect(board.screenshot()).not.toContain("INSERT")

    // The heading's children should now be visible as columns (zoomed in)
    // After zoom, "Tasks" becomes the root and task1/task2 become the visible items
    board.expect("#task1").toExist()
    board.expect("#task2").toExist()
  })

  test("Enter on leaf card (no children) still enters inline edit", () => {
    // Leaf cards should retain the existing Enter=edit behavior
    const { board } = testEnv(() =>
      item("board", item("col1", item("Tasks", item("task1"), item("task2")), item("leaf"))),
    )

    // Navigate to the leaf card
    board.navigateTo("leaf")
    board.expect("#leaf[data-cursor]").toExist()

    // Press Enter — should enter inline edit
    board.press("Enter")
    board.expectEditing("leaf")
  })

  test("i on heading card with children still enters inline edit (rename)", () => {
    // 'i' is the explicit edit key — it should always enter edit mode,
    // even on heading cards. Only Enter changes behavior.
    const { board } = testEnv(() => item("board", item("col1", item("Tasks", item("task1"), item("task2")))))

    board.press("j")
    board.expect("#Tasks[data-cursor]").toExist()

    // 'i' should enter inline edit (rename) even on heading cards
    board.press("i")
    board.expectEditing("Tasks")
  })
})

describe("Empty card heading: navigation keys must not corrupt data", () => {
  test("orphaned text selection cleared on cursor move (P1 bug)", () => {
    // When sel.text() is non-null but no InlineEditField is mounted
    // (orphaned edit state), cursor movement should clear the stale text
    // selection so subsequent keys navigate instead of being captured as text.
    const { board, repo, store } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2"), item("task3"))),
    )

    board.expect("#task1[data-cursor]").toExist()
    board.expectNotEditing()

    // Manually set an orphaned text selection (simulates a state where
    // the edit field was never mounted — e.g., card scrolled off screen)
    const pane = getActiveBoardPane(store.getState())
    pane!.sel.text.edit("task1" as any, 0)

    // Now j should still navigate (the orphaned edit state should be cleared)
    board.press("j")

    // task1 content must be unchanged
    expect(repo.getNode("task1")?.content, "j must not modify task1").toBe("task1")

    // Cursor should have moved to task2
    board.expect("#task2[data-cursor]").toExist()

    // Should no longer be in edit mode
    board.expectNotEditing()
  })

  test("j/k on heading card with no children navigates instead of typing", () => {
    // A heading card (type: "h") that has no children — like an empty section
    // heading in a real vault. j/k should navigate, NOT enter edit mode.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("task1"), item("task2")))
      // Replace task1 with a heading-type node (simulating an empty section heading)
      const task1 = nodes.find((n) => n.id === "task1")!
      task1.type = "h"
      task1.item = {}
      task1.data = { name: "Section Heading" }
      task1.content = undefined
      task1.name = "section-heading"
      task1.fstype = "mdsection"
      return nodes
    })

    // cursor starts on the heading card
    board.expectCursorVisible()
    board.expectNotEditing()

    // Press 'j' to move down — should navigate, not type
    board.press("j")

    // The heading content must be unchanged
    const headingNode = repo.getNode("task1")
    expect(headingNode?.data?.name, "j key corrupted heading text").toBe("Section Heading")

    // Cursor should have moved to task2
    board.expect("#task2[data-cursor]").toExist()
  })
})
