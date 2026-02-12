/**
 * Outliner Enter Behavior
 *
 * Enter during editing: save current content + create new empty sibling + enter edit on it.
 * This matches Decker/WorkFlowy-style outliner behavior.
 *
 * Flow:
 *   1. save() — persist current content
 *   2. setUI({ inlineEditBlock: null }) — exit current edit
 *   3. handleAddNodeAfter(ctx) — create new sibling + refreshBoardState + enter edit
 *
 * Escape during editing: discard changes + exit edit mode (no new node).
 *
 * Assertions use DOM selectors for structural checks (count, ordering, parent-child)
 * and repo queries for data-level checks (content, metadata).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

/** Select all item nodes inside a column (in render order) */
const colItems = (col: string) => `#${col} [data-view='item']`

describe("Outliner Enter — save + new sibling", () => {
  test("Enter saves content and creates new sibling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter") // enter edit mode on 1a
    board.press("X") // type "X" → content should be "1aX"
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
    board.press("H")
    board.press("i")
    board.press("Escape") // cancel (discard typed content on new sibling)

    // DOM: 3 items in column
    board.expect(colItems("col1")).toHaveCount(3)
    // Data: original content preserved
    expect(repo.getNode("1a")?.content).toBe("1a")
  })

  test("Escape exits edit without creating sibling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.expect(colItems("col1")).toHaveCount(2)

    board.press("Enter") // edit 1a
    board.press("X") // type
    board.press("Escape") // cancel

    // DOM: no new items
    board.expect(colItems("col1")).toHaveCount(2)

    // Data: content unchanged (cancelled)
    expect(repo.getNode("1a")?.content).toBe("1a")

    // DOM: cursor navigates normally (back in normal mode)
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("new sibling inherits data.depth from current card", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("1a"), item("1b")))
      // Set depth=2 on the cards (simulates H2 sections parsed from markdown)
      for (const n of nodes) {
        if (n.id === "1a" || n.id === "1b") {
          n.data = { ...n.data, depth: 2 }
        }
      }
      return nodes
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

    // Data: new sibling inherited depth=2
    expect(repo.getNode(newNodeId!)?.data?.depth).toBe(2)
  })

  test("new sibling is inserted AFTER current card, not before", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))

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
    board.press("j")
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
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))))

    // Navigate to middle card (1b)
    board.press("j")
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
