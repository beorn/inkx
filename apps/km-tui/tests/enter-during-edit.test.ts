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
import type { KNode } from "@km/core"
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

// =============================================================================
// Enter on link_to (transclusion) nodes — mimics @next board
// =============================================================================

describe("Outliner Enter — link_to nodes (transclusion)", () => {
  /** Build a board with a column containing link_to nodes, like @next */
  function linkBoard() {
    const nodes = item("board", item("col1", item("link-a"), item("link-b"), item("link-c")))
    // Create target nodes that the links point to
    const targetA: KNode = {
      id: "target-a",
      type: "task",
      content: "Target task A",
      parent_id: "other-file",
      parent_idx: 0,
      link_to: null,
      task_status: "todo",
      task_mark: " ",
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const targetB: KNode = { ...targetA, id: "target-b", content: "Target task B", parent_idx: 1 }
    const targetC: KNode = { ...targetA, id: "target-c", content: "Target task C", parent_idx: 2 }
    const otherFile: KNode = {
      id: "other-file",
      type: "folder",
      content: undefined,
      data: { name: "Other File" },
      parent_id: ".",
      parent_idx: 100,
      link_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    // Make the card nodes into links
    for (const n of nodes) {
      if (n.id === "link-a") {
        n.link_to = "target-a"
        n.content = "Target task A"
        n.task_status = "todo"
        n.task_mark = " "
      }
      if (n.id === "link-b") {
        n.link_to = "target-b"
        n.content = "Target task B"
        n.task_status = "todo"
        n.task_mark = " "
      }
      if (n.id === "link-c") {
        n.link_to = "target-c"
        n.content = "Target task C"
        n.task_status = "todo"
        n.task_mark = " "
      }
    }

    return [...nodes, otherFile, targetA, targetB, targetC]
  }

  const colItems = (col: string) => `#${col} [data-view='item']`

  test("Enter on link_to card creates new sibling and shows it", () => {
    const { board, repo } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a (shows Target task A)
    board.press("Enter") // save + create sibling

    // DOM: 4 items in column (was 3)
    board.expect(colItems("col1")).toHaveCount(4)
  })

  test("Enter on link_to card: new sibling is a regular node, not a link", () => {
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
    expect(newNode!.link_to).toBeNull()
    expect(newNode!.content).toBe("") // empty new node
  })

  test("Multiple Enters on link_to board create chain of siblings", () => {
    const { board } = testEnv(linkBoard)

    board.expect(colItems("col1")).toHaveCount(3)

    board.press("Enter") // edit link-a
    board.press("Enter") // save + sibling1
    board.press("Enter") // save sibling1 + sibling2
    board.press("Enter") // save sibling2 + sibling3

    // DOM: 3 original links + 3 new siblings
    board.expect(colItems("col1")).toHaveCount(6)
  })

  test("keybindings work after Enter on link_to node", () => {
    const { board } = testEnv(linkBoard)

    board.press("Enter") // edit
    board.press("Enter") // save + create sibling (now editing new node)
    board.press("Escape") // exit edit

    // Should be able to navigate normally after
    board.press("j") // move down
    board.expect("[data-cursor]").toExist()
  })
})
