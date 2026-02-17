/**
 * Board Zoom, History, Layout, and View Mode Tests
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { buildBoardState } from "../src/state.ts"
import type { KNode } from "@km/core"
import { ulid } from "ulid"

describe("Layout", () => {
  test("columns are horizontal", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
    expect(col2Box!.y).toBe(col1Box!.y)
  })

  test("cards stack vertically", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(bBox!.y).toBeGreaterThan(aBox!.y)
    expect(bBox!.x).toBe(aBox!.x)
  })
})

describe("Zooming", () => {
  test("e zooms into card with children, Escape returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("subcard")))))

    // e zooms in
    board.expect("#card").toExist()
    board.expect("#subcard").toExist()
    board.press("e")
    board.expect("#subcard").toExist()

    // Escape returns to previous level
    board.press("\x1B")
    board.expect("#col").toExist()
    board.expect("#card").toExist()
  })

  test("e on card without children does nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("leaf"))))
    board.expect("#leaf[data-cursor]").toExist()
    board.press("e")
    // Should stay in board view
    board.expect("#leaf[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).not.toMatch(/detail pane/i)
  })

  test("zoom into column shows column as board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("taskA"), item("taskB"))),
    )
    // Move to column header and press e to zoom
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("e")

    // Now col1 should be treated as board with tasks as columns
    board.expect("#task1").toExist()
    board.expect("#task2").toExist()
    board.expect("#col2").not.toExist() // col2 no longer visible
  })

  test("zoom into card shows card's children as columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("project", item("todo", item("t1"), item("t2")), item("done", item("d1"))))),
    )
    board.expect("#project[data-cursor]").toExist()
    board.press("e")

    // Should show todo and done as columns
    board.expect("#todo").toExist()
    board.expect("#done").toExist()
    board.expect("#t1").toExist()
    board.expect("#d1").toExist()
  })

  test("nested zoom - zoom into multiple levels", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("level1", item("level2", item("level3", item("deepest")))))),
    )
    // Zoom into level1
    board.press("e")
    board.expect("#level2").toExist()

    // Zoom into level2
    board.press("e")
    board.expect("#level3").toExist()

    // Zoom into level3
    board.press("e")
    board.expect("#deepest").toExist()
  })

  test("Escape after multiple zooms - returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("level1", item("level2", item("level3"))))))
    board.press("e") // Zoom to level1
    board.expect("#level2").toExist()
    board.press("e") // Zoom to level2
    board.expect("#level3").toExist()

    // Escape once - back to level1
    // At level1: level2 is a column, level3 is a card (grandchild visible)
    board.press("\x1B")
    board.expect("#level2").toExist()
    // Note: level3 IS visible at level1 (as a card in level2 column)
    board.expect("#level3").toExist()

    // Escape again - back to board
    // At board: col is a column, level1 is a card
    board.press("\x1B")
    board.expect("#level1").toExist()
    // Note: level2 IS visible at board level (as a grandchild card)
    board.expect("#level2").toExist()
  })

  test("cursor preserved on zoom in/out, u zooms out, zoom out returns cursor to parent", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1"), item("card2", item("sub1"), item("sub2")))),
    )

    // --- cursor position preserved when zooming in and out ---
    // Move to card2
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()

    // Zoom in
    board.press("e")
    board.expect("#sub1").toExist()

    // Zoom out - should still be at card2
    board.press("\x1B")
    board.expect("#card2[data-cursor]").toExist()

    // --- u zooms out one level ---
    // Zoom back in to card2
    board.press("e")
    board.expect("#sub1").toExist()
    board.expect("#col").not.toExist()

    // u zooms out one level (back to col as root)
    board.press("u")
    board.expect("#card1").toExist()
    board.expect("#card2").toExist()

    // --- zoom out returns cursor to parent ---
    // After u, cursor may be on card2 (the node we zoomed into).
    // Navigate to card2 via G (last card), then zoom in.
    board.press("G")
    board.expect("#card2[data-cursor]").toExist()
    board.press("e")
    board.expect("#sub1[data-cursor]").toExist()

    // Zoom out - cursor should return to card2
    board.press("\x1B")
    board.expect("#card2[data-cursor]").toExist()
  })

  test("zoom shows path in header", () => {
    const { board } = testEnv(() => item("board", item("col", item("parent", item("child")))))
    board.press("e")
    const output = board.screenshot()
    // Should show breadcrumb: board > col > parent
    expect(output).toMatch(/board.*col.*parent/i)
  })

  test("i zooms one level toward cursor, not all the way", () => {
    // board > col > level1 > level2 > level3
    // With cursor on level1 (which has children), pressing 'i' should zoom
    // into col (one level deeper from root toward cursor), not jump to level1
    const { board } = testEnv(() =>
      item("board", item("col", item("level1", item("level2", item("level3"))), item("other"))),
    )
    // Cursor starts at level1 (first card in col)
    board.expect("#level1[data-cursor]").toExist()

    // Press i - should zoom one level inward (root becomes col)
    // col is the child of board on the path to level1
    board.press("i")

    // Now we're zoomed to col. level1 and other should be visible as columns.
    board.expect("#level1").toExist()
    board.expect("#other").toExist()
    // board should NOT be visible as a column anymore (we zoomed past it)
    board.expect("#board").not.toExist()
  })

  test("i at cursor's parent level acts like o (zoom to cursor)", () => {
    // When cursor is already a direct child of root, i = one level = zoom to cursor
    const { board } = testEnv(() => item("board", item("col", item("card", item("sub")))))
    board.expect("#card[data-cursor]").toExist()

    // col is direct child of board, and card is child of col.
    // i should zoom to col (one level toward card).
    board.press("i")
    board.expect("#card").toExist()
    board.expect("#board").not.toExist()
  })

  describe("cursor position after zooming", () => {
    test("zoom in preserves cursor on first child", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in - cursor should go to first child
      board.press("e")
      board.expect("#child1[data-cursor]").toExist()
    })

    test("navigate in zoomed view, then zoom out", () => {
      // Fixture: child1 and child2 are folders (have children)
      // so they become columns with cards when zoomed to parent
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("child1", item("c1")), item("child2", item("c2"))))),
      )
      board.press("e") // Zoom in to parent
      // After zoom, cursor is on first card (grandchild) for immediate j/k navigation
      board.expect("#c1[data-cursor]").toExist()

      // Navigate horizontally to child2 column's first card (l = right)
      board.press("l")
      board.expect("#c2[data-cursor]").toExist()

      // Zoom out - cursor returns to parent (preserved from history)
      board.press("\x1B")
      board.expect("#parent[data-cursor]").toExist()
    })
  })
})

describe("History", () => {
  test("back navigation with [ after zooming", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1"), item("card2", item("sub1"), item("sub2")))),
    )
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()
    board.press("e")
    board.expect("#sub1").toExist()
    board.press("[")
    board.expect("#card1").toExist()
    board.expect("#card2[data-cursor]").toExist()
  })

  test("forward navigation with ] restores zoom view", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("childA"), item("childB")))))
    board.press("e")
    board.expect("#childA").toExist()
    board.press("[")
    board.expect("#card").toExist()
    board.press("]")
    board.expect("#childA").toExist()
    board.expect("#childB").toExist()
  })

  // NOTE: Navigation history is only pushed by ZOOM operations, not cursor movement.
  // Tests for [ and ] must use zoom (i) to create history entries.
  describe("cursor position after history navigation", () => {
    test("[ restores cursor after zoom, ] restores zoom state", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      // Move to parent card
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in (creates history entry with cursor on parent)
      board.press("e")
      // Now at zoom parent, cursor on child1
      board.expect("#child1").toExist()

      // Go back with [ - should return to board with cursor on parent
      board.press("[")
      board.expect("#parent[data-cursor]").toExist()

      // Go forward with ] - should restore zoom state
      board.press("]")
      board.expect("#child1").toExist()
    })

    test("history preserves zoom cursor position", () => {
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("c1", item("gc1")), item("c2", item("gc2"))))),
      )
      // Zoom to parent (c1 and c2 become columns, cursor on first card = gc1)
      board.press("e")
      board.expect("#gc1[data-cursor]").toExist()

      // Navigate to c2's first card
      board.press("l")
      board.expect("#gc2[data-cursor]").toExist()

      // Zoom deeper into c2
      board.press("e")
      board.expect("#gc2").toExist()

      // Go back twice to return to board
      board.press("[")
      board.press("[")
      board.expect("#parent[data-cursor]").toExist()
    })

    test("[ at start of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()

      // Repeatedly try [ with no history - should stay put
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
    })

    test("] at end of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))
      // Create some history
      board.press("j")
      board.press("[") // Go back
      board.press("]") // Go forward

      // Now at end of history
      board.expect("#card2[data-cursor]").toExist()

      // Repeatedly try ] - should stay put
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
    })
  })
})

describe("View Modes", () => {
  test("switching view modes preserves cursor on same node", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    )
    // Navigate to specific card
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Switch view mode (v cycles view modes)
    board.press("v")

    // Cursor should still be on task2 (same logical node)
    // Note: x/y coordinates may differ because layouts vary by view mode
    board.expect("#task2[data-cursor]").toExist()
  })

  // Note: Individual view mode cursor tests covered by "switching between cards/list/columns/tabs views" below

  test("switching between cards/list/columns/tabs views", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))
    // Start in cards view at task2
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Cycle through views - cursor should stay on task2
    board.press("v") // To list view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To columns view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To tabs view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // Back to cards view
    board.expect("#task2[data-cursor]").toExist()
  })
})

// --- Merged from zoom-exit-j.test.ts (bead: km-tui.zoom-exit-j) ---

describe("zoom: j at column header should not exit zoom", () => {
  it("j at column header preserves zoom state", () => {
    const nodes = item(
      "vault",
      item(
        "next",
        item("inbox", item("task1"), item("task2")),
        item("today", item("task3")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "next")

    expect(driver.store.getState().rootId).toBe("next")

    // Navigate to column header of second column
    driver.press("k") // inbox column header
    driver.press("l") // today column header
    expect(driver.getState().selectedNodeId).toBe("today")

    // Press j — zoom should NOT change
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("next")
  })

  it("j at column header of empty column preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "project",
        item("backlog", item("item1")),
        item("empty-col"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate to empty column
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("empty-col")

    // Press j — should hit boundary, NOT exit zoom
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("project")
  })

  it("j at column header with body-only content preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "project",
        item("active", item("task1")),
        item("notes", item.paragraph("some notes"), item.paragraph("more notes")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate right to notes column
    driver.press("l")

    // Press j — should NOT exit zoom
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("project")
  })

  it("j at last card preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "board",
        item("col1", item("card1"), item("card2")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to last card
    driver.press("j") // card2
    driver.press("j") // boundary

    // zoom should NOT change
    expect(driver.store.getState().rootId).toBe("board")
  })

  it("repeated j presses never exit zoom", () => {
    const nodes = item(
      "vault",
      item(
        "root",
        item("col", item("a"), item("b"), item("c")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "root")

    // Press j many times — should never exit zoom
    for (let i = 0; i < 10; i++) {
      driver.press("j")
      expect(driver.store.getState().rootId).toBe("root")
    }
  })
})

// --- Merged from zoom-inwards-body-only.test.ts (bead: km-tui.inline-edit-body) ---

describe("zoom on body-only nodes", () => {
  it("should zoom via handleZoomIn on a body-only node", () => {
    // bodyOnlyNode has only paragraph/code children — these are now navigable cards
    const nodes = item(
      "board",
      item("col1", item("bodyOnlyNode", item.paragraph("text1"), item.code("code1"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    expect(driver.getState().selectedNodeId).toBe("bodyOnlyNode")

    // Press 'e' (zoom_in) — should zoom since body cards are navigable
    driver.press("e")

    const after = driver.store.getState()
    expect(after.rootId).toBe("bodyOnlyNode")
  })

  it("should zoom via handleZoomInwards into a body-only node", () => {
    const nodes = item(
      "board",
      item("col1", item("task1")),
      item("bodyCol", item("bodyNode", item.paragraph("some text"), item.paragraph("more text"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to bodyCol's bodyNode
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("bodyNode")

    // Press 'i' (zoom_inwards) — should zoom into bodyCol
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("bodyCol")
  })

  it("should zoom into a node that has structural children", () => {
    const nodes = item(
      "board",
      item("col1", item("card-with-children", item("sub1"), item("sub2"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Press 'i' (zoom_inwards) on the first card which has structural children
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("col1")
  })

  it("should zoom into a node with mixed body and structural children", () => {
    const nodes = item(
      "board",
      item("col1", item("mixed", item.paragraph("intro text"), item("real-child"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Press 'i' on mixed node (has both body and structural children)
    driver.press("i")

    const after = driver.store.getState()
    expect(after.rootId).toBe("col1")
  })
})

// --- Merged from zoom-view-diff.test.ts ---

function makeNode(partial: Partial<KNode> & { id: string; type: KNode["type"] }): KNode {
  return {
    id: partial.id,
    type: partial.type,
    ...(partial.fstype ? { fstype: partial.fstype } : {}),
    ...(partial.list_marker ? { list_marker: partial.list_marker } : {}),
    ...(partial.embed ? { embed: partial.embed } : {}),
    parent_id: partial.parent_id ?? null,
    parent_idx: partial.parent_idx ?? 0,
    link_to: partial.link_to ?? null,
    title: partial.title,
    content: partial.content ?? partial.title ?? "",
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "mock",
  }
}

describe("Zoom View Diff - embed cards should not be virtual", () => {
  test("embed cards in a column are NOT marked virtual", () => {
    // Simulate: file node "@next" with sections containing embeds
    const rootId = ulid()
    const sectionId = ulid()
    const embed1Id = ulid()
    const embed2Id = ulid()
    const targetId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Next Actions", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Processing", parent_id: rootId, parent_idx: 0 }),
      makeNode({
        id: embed1Id,
        type: "link",
        embed: true,
        content: "Embed 1",
        parent_id: sectionId,
        parent_idx: 0,
        link_to: targetId,
      }),
      makeNode({
        id: embed2Id,
        type: "link",
        embed: true,
        content: "Embed 2",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      // Target node for embeds
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Some task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })

    // Derive columns as if zoomed into the file node (rootId is the zoom root)
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    // Should have 1 column: "Processing"
    expect(columns.length).toBe(1)
    const processingCol = columns[0]!
    expect(processingCol.node.id).toBe(sectionId)

    // Cards should be the embeds
    expect(processingCol.cards.length).toBe(2)

    // BUG: embeds were marked as virtual because they're not tasks and not structural
    // FIX: embeds should NOT be virtual — they are discrete items
    for (const card of processingCol.cards) {
      expect(card.isVirtual).toBeFalsy()
    }
  })

  test("paragraph cards in a column without structural children ARE virtual", () => {
    // Paragraphs are genuine body content — they should remain virtual
    const rootId = ulid()
    const sectionId = ulid()
    const para1Id = ulid()
    const para2Id = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Notes", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Intro", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: para1Id, type: "p", content: "First paragraph", parent_id: sectionId, parent_idx: 0 }),
      makeNode({ id: para2Id, type: "p", content: "Second paragraph", parent_id: sectionId, parent_idx: 1 }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    expect(columns.length).toBe(1)
    const col = columns[0]!

    // Paragraphs in a column with no structural children and no tasks = all virtual
    for (const card of col.cards) {
      expect(card.isVirtual).toBe(true)
    }
  })

  test("mixed embed + paragraph column: embeds not virtual, paragraphs are body", () => {
    // When a column has both paragraphs (before structural) and embeds,
    // the embeds should still not be virtual
    const rootId = ulid()
    const sectionId = ulid()
    const paraId = ulid()
    const embedId = ulid()
    const targetId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Mixed", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Section", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: paraId, type: "p", content: "Intro text", parent_id: sectionId, parent_idx: 0 }),
      makeNode({
        id: embedId,
        type: "link",
        embed: true,
        content: "Embed ref",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Target", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    expect(columns.length).toBe(1)
    const col = columns[0]!
    expect(col.cards.length).toBe(2)

    // Both are non-structural and there are no structural children,
    // so extractBody returns all in body with empty items.
    // With the fix, embed cards should NOT be virtual even in this case.
    const paraCard = col.cards.find((c) => c.node.id === paraId)
    const embedCard = col.cards.find((c) => c.node.id === embedId)

    // After fix: embed should not be virtual
    expect(embedCard?.isVirtual).toBeFalsy()
  })
})

describe("Zoom View Diff - deriveColumnsFromRepo matches buildBoardState", () => {
  test("li nodes before sections become body, not columns", () => {
    // When a file has list items before sections, they should NOT become columns.
    // Previously, deriveColumnsFromRepo used !isBlock() which made li/link into columns.
    const rootId = ulid()
    const taskId = ulid()
    const sectionId = ulid()
    const cardId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({ id: taskId, type: "li", list_marker: "-", content: "Leading task", parent_id: rootId, parent_idx: 0 }),
      makeNode({
        id: sectionId,
        type: "oi",
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({
        id: cardId,
        type: "li",
        list_marker: "-",
        content: "Card in section",
        parent_id: sectionId,
        parent_idx: 0,
      }),
    ]

    const repo = createFakeRepo({ nodes })

    // deriveColumnsFromRepo should produce the same structure as buildBoardState
    const derived = deriveColumnsFromRepo(repo, rootId, new Set())
    const built = buildBoardState(repo, rootId)

    // Both should have: 1 virtual body column + 1 structural column = 2 columns
    expect(derived.length).toBe(2)
    expect(built.columns.length).toBe(2)

    // First column should be virtual body
    expect(derived[0]!.isVirtual).toBe(true)
    expect(built.columns[0]!.isVirtual).toBe(true)

    // Second column should be the section
    expect(derived[1]!.node.id).toBe(sectionId)
    expect(built.columns[1]!.node.id).toBe(sectionId)
  })

  test("only oi nodes become columns in deriveColumnsFromRepo", () => {
    // Verify that link nodes are not turned into columns
    const rootId = ulid()
    const embedId = ulid()
    const targetId = ulid()
    const sectionId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({
        id: embedId,
        type: "link",
        embed: true,
        content: "Leading embed",
        parent_id: rootId,
        parent_idx: 0,
        link_to: targetId,
      }),
      makeNode({
        id: sectionId,
        type: "oi",
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Target task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    // Should have 2 columns: virtual body (with embed) + Section
    // NOT 3 columns (embed as column + section as column)
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true)
    expect(columns[1]!.node.id).toBe(sectionId)
  })

  test("file with only sections produces same columns from both paths", () => {
    // Common case: .md file with only section children (no leading body)
    const rootId = ulid()
    const sec1Id = ulid()
    const sec2Id = ulid()
    const task1Id = ulid()
    const task2Id = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({ id: sec1Id, type: "oi", fstype: "mdsection", title: "Todo", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: sec2Id, type: "oi", fstype: "mdsection", title: "Done", parent_id: rootId, parent_idx: 1 }),
      makeNode({ id: task1Id, type: "li", list_marker: "-", content: "Task 1", parent_id: sec1Id, parent_idx: 0 }),
      makeNode({ id: task2Id, type: "li", list_marker: "-", content: "Task 2", parent_id: sec2Id, parent_idx: 0 }),
    ]

    const repo = createFakeRepo({ nodes })

    const derived = deriveColumnsFromRepo(repo, rootId, new Set())
    const built = buildBoardState(repo, rootId)

    // Both should have exactly 2 columns (no body column)
    expect(derived.length).toBe(2)
    expect(built.columns.length).toBe(2)

    // Column structure should match
    expect(derived[0]!.node.id).toBe(sec1Id)
    expect(derived[1]!.node.id).toBe(sec2Id)
    expect(built.columns[0]!.node.id).toBe(sec1Id)
    expect(built.columns[1]!.node.id).toBe(sec2Id)

    // Card counts should match
    expect(derived[0]!.cards.length).toBe(built.columns[0]!.cards.length)
    expect(derived[1]!.cards.length).toBe(built.columns[1]!.cards.length)
  })
})

// --- Merged from zoom-cursor-fallback.test.ts (bead: km-tui.zoom-cursor-fallback) ---

describe("zoom-out fallback: cursor moves up when at repo root", () => {
  it("moves cursor from card to column header when at repo root", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1"), item("task2")),
        item("col2", item("task3")),
      ),
    )

    // Cursor starts on first card (task1)
    board.expect("#task1[data-cursor]").toExist()

    // Press u — can't zoom out from repo root, so cursor should move up
    board.press("u")

    // Should now be at column header level
    board.expect("#col1[data-cursor]").toExist()
  })

  it("moves cursor from column header to board root when at repo root", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1")),
        item("col2", item("task3")),
      ),
    )

    // Move to column header first
    board.press("k") // card → column header

    board.expect("#col1[data-cursor]").toExist()

    // Press u — should move to board level
    board.press("u")

    board.expect("#board[data-cursor]").toExist()
  })

  it("rings bell at board level when at repo root (nowhere to go)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task1")),
      ),
    )

    // Navigate up to board level
    board.press("k") // column header
    board.press("k") // board level

    board.expect("#board[data-cursor]").toExist()

    // Press u at board level — should ring bell
    board.press("u")
    expect(board.bell).toBe(true)
  })

  it("moves cursor to parent: card → column → board", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("a"), item("b"), item("c")),
      ),
    )

    // Start at first card, navigate to third card
    board.press("j").press("j")
    board.expect("#c[data-cursor]").toExist()

    // u goes to PARENT (not prev sibling): c → col1 → board
    board.press("u")
    board.expect("#col1[data-cursor]").toExist()

    board.press("u") // column header → board
    board.expect("#board[data-cursor]").toExist()

    board.press("u") // at board level, should ring bell
    expect(board.bell).toBe(true)
  })
})
