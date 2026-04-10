/**
 * Reproduction test: Enter during inline edit doesn't save text on newly created nodes.
 *
 * Bug: After pressing Enter (creates new sibling + enters edit mode),
 * typing text, and pressing Enter/Escape again, the typed text is NOT saved.
 * Nodes show "(untitled section)" instead of the typed text.
 *
 * Bead: km-tui.edit-save-broken
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("km-tui.edit-save-broken — Enter + type + Enter/Escape saves text on new node", () => {
  // === Scenario 1: Task cards (most common) ===

  test("Enter on task card → type → Escape: saves text to NEW sibling", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()

    // Enter edit mode on task1, then Enter at end → creates new task sibling
    app.press("Enter")
    app.press("Enter")

    // Type text into the new node
    for (const c of "hello world") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }

    // Escape → save and exit
    app.press("Escape")

    // Text should be on screen
    app.expectScreen("hello world")

    // Text should be in repo
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => (c.content ?? "").includes("hello world"))
    expect(newNode).toBeDefined()
  })

  test("Enter on task card → type → Enter: saves first node, creates second", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    app.expect("#task1[data-cursor]").toExist()
    app.press("Enter") // edit task1
    app.press("Enter") // new sibling A, edit A

    // Type in node A
    for (const c of "nodeA") app.press(c)

    // Enter again → save A, create node B, edit B
    app.press("Enter")

    // "nodeA" should be visible (saved before creating B)
    app.expectScreen("nodeA")

    // Verify in repo
    const children = app.repo.getChildren("col")
    const nodeA = children.find((c) => (c.content ?? "").includes("nodeA"))
    expect(nodeA).toBeDefined()

    // Escape from B
    app.press("Escape")
  })

  // === Scenario 2: 'o' insert creates mdsection for non-task parents ===

  test("'o' on non-task heading card → type → Escape: saves text (no untitled section)", () => {
    // Create a board where a card is a non-task heading (type: "h", item: {}, no task_marker).
    // This is common for markdown sections that aren't tasks.
    // When 'o' creates a new sibling, it inherits non-task → creates mdsection.
    using app = createTestApp(item("board", item("col", item.section("heading-card"), item("task2"))))

    app.expect("#heading-card[data-cursor]").toExist()

    // 'o' in normal mode → INSERT_BELOW → handleAddNodeAfter
    // Since heading-card has no task_marker, new sibling gets fstype: "mdsection"
    app.press("o")

    // Type text
    for (const c of "new text") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }

    // Escape
    app.press("Escape")

    // Verify text is saved and displayed
    app.expectScreen("new text")
    expect(app.text).not.toContain("(untitled section)")

    // Verify in repo
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => c.id !== "heading-card" && c.id !== "task2")
    expect(newNode).toBeDefined()
    expect(newNode!.content).toContain("new text")
  })

  // === Scenario 3: Multiple rapid Enter + type sequences ===

  test("rapid Enter-type-Enter-type chain preserves all text", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    app.press("Enter") // edit task1
    app.press("Enter") // new sibling A

    for (const c of "first") app.press(c)
    app.press("Enter") // save A, new sibling B

    for (const c of "second") app.press(c)
    app.press("Enter") // save B, new sibling C

    for (const c of "third") app.press(c)
    app.press("Escape") // save C

    app.expectScreen("first")
    app.expectScreen("second")
    app.expectScreen("third")
  })

  // === Scenario 4: extractProps data inheritance ===

  test("new node created via Enter does NOT inherit data.name from source node", () => {
    // Regression: extractProps used to copy `data` (including data.name) from the source
    // node. This caused getNodeDisplayName to return the source's name instead of the
    // typed text, since data.name takes priority over content.
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    // Manually set data.name on task1 to simulate real vault node
    app.repo.updateNode("task1", { data: { name: "Old Name" } })

    app.press("Enter") // edit task1
    app.press("Enter") // new sibling (extractProps should NOT copy data)

    // Type text into new node
    for (const c of "New Text") {
      if (c === " ") app.press("Space")
      else app.press(c)
    }
    app.press("Escape")

    // The new node should show "New Text", not "Old Name"
    app.expectScreen("New Text")

    // Check that the new node's data.name is NOT inherited from task1
    const children = app.repo.getChildren("col")
    const newNode = children.find((c) => c.id !== "task1" && c.id !== "task2")
    expect(newNode).toBeDefined()
    // The content should be saved
    expect(newNode!.content).toContain("New Text")
    // data should NOT be inherited from source — it's a system field
    expect(newNode!.data?.name).toBeUndefined()
  })
})
