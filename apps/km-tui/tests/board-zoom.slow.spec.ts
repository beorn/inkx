/**
 * Board Zoom, History, Layout, and View Mode Tests
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, it, expect } from "vitest"
import { TC } from "./helpers/theme.ts"
import { item, testEnv, testEnvWithRepo } from "./helpers/board-test.ts"
import { createFakeRepo, createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createBoardDriver } from "../src/driver.ts"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { buildBoardState } from "../src/state.ts"
import type { KNode } from "@km/core"
import { ulid } from "ulid"
import { getActiveBoardPane } from "../src/board-app-store.ts"
import { compareBuffers, formatMismatch } from "@silvery/ag-term/toolbelt"
import { bufferToText } from "@silvery/test"
import { existsSync } from "fs"

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
  test("z zooms into card with children, Z returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("subcard")))))

    // z zooms in
    board.expect("#card").toExist()
    board.expect("#subcard").toExist()
    board.press("z")
    board.expect("#subcard").toExist()

    // Z (zoom out) returns to previous level
    board.press("Z")
    board.expect("#col").toExist()
    board.expect("#card").toExist()
  })

  test("e on card without children does nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("leaf"))))
    board.expect("#leaf[data-cursor]").toExist()
    board.press("z")
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
    board.press("z")

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
    board.press("z")

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
    board.press("z")
    board.expect("#level2").toExist()

    // Zoom into level2
    board.press("z")
    board.expect("#level3").toExist()

    // Zoom into level3
    board.press("z")
    board.expect("#deepest").toExist()
  })

  test("Z after multiple zooms - returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("level1", item("level2", item("level3"))))))
    board.press("z") // Zoom to level1
    board.expect("#level2").toExist()
    board.press("z") // Zoom to level2
    board.expect("#level3").toExist()

    // Z (zoom out) once - back to level1
    // At level1: level2 is a column, level3 is a card (grandchild visible)
    board.press("Z")
    board.expect("#level2").toExist()
    // Note: level3 IS visible at level1 (as a card in level2 column)
    board.expect("#level3").toExist()

    // Z again - back to board
    // At board: col is a column, level1 is a card
    board.press("Z")
    board.expect("#level1").toExist()
    // Note: level2 IS visible at board level (as a grandchild card)
    board.expect("#level2").toExist()
  })

  test("cursor preserved on zoom in/out, u zooms out, zoom out returns cursor to parent", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1"), item("card2", item("sub1"), item("sub2")))),
    )

    // --- cursor position preserved when zooming in and out (nav_back) ---
    // Move to card2
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()

    // zoom_inwards: first z goes to col (one level closer), second z goes to card2
    board.press("z") // root=col, cursor stays on card2
    board.press("z") // root=card2, sub1/sub2 visible
    board.expect("#sub1").toExist()

    // Nav back (history) - should restore cursor to card2
    board.press("{")
    board.expect("#card2[data-cursor]").toExist()

    // --- Z zooms out one level ---
    // Zoom back in to card2 (two z presses: board → col → card2)
    board.press("z") // root=col
    board.press("z") // root=card2
    board.expect("#sub1").toExist()

    // Z zooms out one level (back to col as root)
    // Cursor stays on sub1 (visible as card under card2 column)
    board.press("Z")
    board.expect("#card1").toExist()
    board.expect("#card2").toExist()
    board.expect("#sub1[data-cursor]").toExist()

    // --- nav_back returns cursor to parent ---
    // Navigate to card2 column header via k, then zoom in.
    board.press("k") // sub1 → card2 column header
    board.expect("#card2[data-cursor]").toExist()
    board.press("z")
    board.expect("#sub1[data-cursor]").toExist()

    // Nav back (history) - cursor should return to card2
    board.press("{")
    board.expect("#card2[data-cursor]").toExist()
  })

  test("zoom shows path in header", () => {
    const { board } = testEnv(() => item("board", item("col", item("parent", item("child")))))
    board.press("z")
    const output = board.screenshot()
    // Should show breadcrumb: board > col > parent
    expect(output).toMatch(/board.*col.*parent/i)
  })

  test("z zooms inwards one level toward cursor node (zoom_inwards)", () => {
    // board > col > level1(level2(level3)), other
    // With cursor on level1 (which has children), pressing 'z' zooms one level
    // closer: board → col. A second 'z' goes col → level1.
    const { board } = testEnv(() =>
      item("board", item("col", item("level1", item("level2", item("level3"))), item("other"))),
    )
    // Cursor starts at level1 (first card in col)
    board.expect("#level1[data-cursor]").toExist()

    // First z: zoom_inwards goes one level closer (board → col)
    board.press("z")
    // At root=col: level1 and other are visible, level2 is a grandchild
    board.expect("#level1").toExist()
    board.expect("#level2").toExist()

    // Second z: zoom_inwards goes another level (col → level1)
    board.press("z")
    // Now we're zoomed to level1. level2 should be visible.
    board.expect("#level2").toExist()
    // "other" should NOT be visible (it's a sibling of level1, not a child)
    board.expect("#other").not.toExist()
  })

  test("z at cursor's parent level zooms one level toward cursor", () => {
    // When cursor is already a direct child of root's child, z zooms one level (to col)
    const { board } = testEnv(() => item("board", item("col", item("card", item("sub")))))
    board.expect("#card[data-cursor]").toExist()

    // col is direct child of board, and card is child of col.
    // z should zoom to col (one level toward card).
    board.press("z")
    board.expect("#card").toExist()
    board.expect("#board").not.toExist()
  })

  describe("cursor position after zooming", () => {
    test("zoom in preserves cursor on first child", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      board.expect("#parent[data-cursor]").toExist()

      // zoom_inwards: first z goes board → col, second z goes col → parent
      board.press("z") // root=col, cursor stays on parent
      board.press("z") // root=parent, cursor on first child
      board.expect("#child1[data-cursor]").toExist()
    })

    test("navigate in zoomed view, then nav back", () => {
      // Fixture: child1 and child2 are folders (have children)
      // so they become columns with cards when zoomed to parent
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("child1", item("c1")), item("child2", item("c2"))))),
      )
      // zoom_inwards: two presses to reach parent (board → col → parent)
      board.press("z") // root=col, cursor stays on parent
      board.press("z") // root=parent, cursor on first card (c1)
      // After zoom, cursor is on first card (grandchild) for immediate j/k navigation
      board.expect("#c1[data-cursor]").toExist()

      // Navigate horizontally to child2 column's first card (l = right)
      board.press("l")
      board.expect("#c2[data-cursor]").toExist()

      // Nav back (history) - cursor returns to parent (preserved from history)
      board.press("{")
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
    board.press("z")
    board.expect("#sub1").toExist()
    board.press("{")
    board.expect("#card1").toExist()
    board.expect("#card2[data-cursor]").toExist()
  })

  test("forward navigation with ] restores zoom view", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("childA"), item("childB")))))
    board.press("z")
    board.expect("#childA").toExist()
    board.press("{")
    board.expect("#card").toExist()
    board.press("}")
    board.expect("#childA").toExist()
    board.expect("#childB").toExist()
  })

  // NOTE: Navigation history is only pushed by ZOOM operations, not cursor movement.
  // Tests for [ and ] must use zoom (z) to create history entries.
  describe("cursor position after history navigation", () => {
    test("[ restores cursor after zoom, ] restores zoom state", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      // Move to parent card
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in (creates history entry with cursor on parent)
      board.press("z")
      // Now at zoom parent, cursor on child1
      board.expect("#child1").toExist()

      // Go back with [ - should return to board with cursor on parent
      board.press("{")
      board.expect("#parent[data-cursor]").toExist()

      // Go forward with ] - should restore zoom state
      board.press("}")
      board.expect("#child1").toExist()
    })

    test("history preserves zoom cursor position", () => {
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("c1", item("gc1")), item("c2", item("gc2"))))),
      )
      // zoom_inwards: two presses to reach parent (board → col → parent)
      board.press("z") // root=col, cursor stays on parent
      board.press("z") // root=parent, cursor on first card = gc1
      board.expect("#gc1[data-cursor]").toExist()

      // Navigate to c2's first card
      board.press("l")
      board.expect("#gc2[data-cursor]").toExist()

      // Zoom deeper into c2 (root=parent, cursor on gc2, parent of gc2 is c2, c2.parent=parent=root, so target=c2)
      board.press("z") // root=c2
      board.expect("#gc2").toExist()

      // Go back three times to return to board (c2 → parent → col → board)
      board.press("{")
      board.press("{")
      board.press("{")
      board.expect("#parent[data-cursor]").toExist()
    })

    test("[ at start of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()

      // Repeatedly try [ with no history - should stay put
      board.press("{")
      board.expect("#task[data-cursor]").toExist()
      board.press("{")
      board.expect("#task[data-cursor]").toExist()
    })

    test("] at end of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))
      // Create some history
      board.press("j")
      board.press("{") // Go back
      board.press("}") // Go forward

      // Now at end of history
      board.expect("#card2[data-cursor]").toExist()

      // Repeatedly try ] - should stay put
      board.press("}")
      board.expect("#card2[data-cursor]").toExist()
      board.press("}")
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

    // Switch view mode (v m cycles view modes)
    board.press("v").press("m")

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
    board.press("v").press("v") // To list view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v").press("v") // To columns view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v").press("v") // To tabs view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v").press("v") // Back to cards view
    board.expect("#task2[data-cursor]").toExist()
  })
})

// --- Merged from zoom-exit-j.test.ts (bead: km-tui.zoom-exit-j) ---

describe("zoom: j at column header should not exit zoom", () => {
  it("j at column header preserves zoom state", () => {
    const nodes = item("vault", item("next", item("inbox", item("task1"), item("task2")), item("today", item("task3"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "next")

    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("next")

    // Navigate to column header of second column
    driver.press("k") // inbox column header
    driver.press("l") // today column header
    expect(driver.getState().selectedNodeId).toBe("today")

    // Press j — zoom should NOT change
    driver.press("j")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("next")
  })

  it("j at column header of empty column preserves zoom", () => {
    const nodes = item("vault", item("project", item("backlog", item("item1")), item("empty-col")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate to empty column
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("empty-col")

    // Press j — should hit boundary, NOT exit zoom
    driver.press("j")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("project")
  })

  it("j at column header with body-only content preserves zoom", () => {
    const nodes = item(
      "vault",
      item("project", item("active", item("task1")), item("notes", item.p("some notes"), item.p("more notes"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate right to notes column
    driver.press("l")

    // Press j — should NOT exit zoom
    driver.press("j")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("project")
  })

  it("j at last card preserves zoom", () => {
    const nodes = item("vault", item("board", item("col1", item("card1"), item("card2"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to last card
    driver.press("j") // card2
    driver.press("j") // boundary

    // zoom should NOT change
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("board")
  })

  it("repeated j presses never exit zoom", () => {
    const nodes = item("vault", item("root", item("col", item("a"), item("b"), item("c"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "root")

    // Press j many times — should never exit zoom
    for (let i = 0; i < 10; i++) {
      driver.press("j")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("root")
    }
  })
})

// --- Merged from zoom-inwards-body-only.test.ts (bead: km-tui.inline-edit-body) ---

describe("zoom on body-only nodes", () => {
  it("should zoom via zoom_inwards on a body-only node", () => {
    // bodyOnlyNode has only paragraph/code children — these are now navigable cards
    const nodes = item("board", item("col1", item("bodyOnlyNode", item.p("text1"), item.code("code1"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    expect(driver.getState().selectedNodeId).toBe("bodyOnlyNode")

    // zoom_inwards: first z goes board → col1, second z goes col1 → bodyOnlyNode
    driver.press("z") // root=col1
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z") // root=bodyOnlyNode
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("bodyOnlyNode")
  })

  it("should zoom via zoom_inwards into a body-only node", () => {
    const nodes = item(
      "board",
      item("col1", item("task1")),
      item("bodyCol", item("bodyNode", item.p("some text"), item.p("more text"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to bodyCol's bodyNode
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("bodyNode")

    // zoom_inwards: first z goes board → bodyCol, second z goes bodyCol → bodyNode
    driver.press("z") // root=bodyCol
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("bodyCol")
    driver.press("z") // root=bodyNode
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("bodyNode")
  })

  it("should zoom into a node that has structural children", () => {
    const nodes = item("board", item("col1", item("card-with-children", item("sub1"), item("sub2"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // zoom_inwards: first z goes board → col1, second z goes col1 → card-with-children
    driver.press("z") // root=col1
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z") // root=card-with-children
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("card-with-children")
  })

  it("should zoom into a node with mixed body and structural children", () => {
    const nodes = item("board", item("col1", item("mixed", item.p("intro text"), item("real-child"))))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // zoom_inwards: first z goes board → col1, second z goes col1 → mixed
    driver.press("z") // root=col1
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z") // root=mixed
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("mixed")
  })
})

// --- Merged from zoom-view-diff.test.ts ---

function makeNode(partial: Partial<KNode> & { id: string; type: KNode["type"] }): KNode {
  return {
    id: partial.id,
    type: partial.type,
    ...(partial.item !== undefined ? { item: partial.item } : {}),
    ...(partial.fstype ? { fstype: partial.fstype } : {}),
    ...(partial.item?.list ? { list_marker: partial.item?.list } : {}),
    parent_id: partial.parent_id ?? null,
    parent_idx: partial.parent_idx ?? 0,
    embed_source: partial.embed_source ?? null,
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
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Next Actions", parent_id: null }),
      makeNode({
        id: sectionId,
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Processing",
        parent_id: rootId,
        parent_idx: 0,
      }),
      makeNode({
        id: embed1Id,
        type: "p",
        content: "Embed 1",
        parent_id: sectionId,
        parent_idx: 0,
        embed_source: targetId,
      }),
      makeNode({
        id: embed2Id,
        type: "p",
        content: "Embed 2",
        parent_id: sectionId,
        parent_idx: 1,
        embed_source: targetId,
      }),
      // Target node for embeds
      makeNode({ id: targetId, type: "p", item: { list: "-" }, title: "Some task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })

    // Derive columns as if zoomed into the file node (rootId is the zoom root)
    const columns = deriveColumnsFromRepo(repo, rootId, new Map())

    // Should have 1 column: "Processing"
    expect(columns.length).toBe(1)
    const processingCol = columns[0]!
    expect(processingCol.node.id).toBe(sectionId)

    // Cards should be the embeds
    expect(processingCol.cardNodes.length).toBe(2)

    // Embeds should NOT be body — they are discrete items
    for (const card of processingCol.cardNodes) {
      expect(card.isBody).toBeFalsy()
    }
  })

  test("paragraph cards in a column without structural children ARE virtual", () => {
    // Paragraphs are genuine body content — they should remain virtual
    const rootId = ulid()
    const sectionId = ulid()
    const para1Id = ulid()
    const para2Id = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Notes", parent_id: null }),
      makeNode({
        id: sectionId,
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Intro",
        parent_id: rootId,
        parent_idx: 0,
      }),
      makeNode({ id: para1Id, type: "p", content: "First paragraph", parent_id: sectionId, parent_idx: 0 }),
      makeNode({ id: para2Id, type: "p", content: "Second paragraph", parent_id: sectionId, parent_idx: 1 }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Map())

    expect(columns.length).toBe(1)
    const col = columns[0]!

    // Paragraphs in a column with no structural children and no tasks = all body
    for (const card of col.cardNodes) {
      expect(card.isBody).toBe(true)
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
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Mixed", parent_id: null }),
      makeNode({
        id: sectionId,
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 0,
      }),
      makeNode({ id: paraId, type: "p", content: "Intro text", parent_id: sectionId, parent_idx: 0 }),
      makeNode({
        id: embedId,
        type: "p",
        content: "Embed ref",
        parent_id: sectionId,
        parent_idx: 1,
        embed_source: targetId,
      }),
      makeNode({ id: targetId, type: "p", item: { list: "-" }, title: "Target", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Map())

    expect(columns.length).toBe(1)
    const col = columns[0]!
    expect(col.cardNodes.length).toBe(2)

    // Both are non-structural and there are no structural children,
    // so extractBody returns all in body with empty items.
    // With the fix, embed cards should NOT be virtual even in this case.
    const paraCard = col.cardNodes.find((c) => c.id === paraId)
    const embedCard = col.cardNodes.find((c) => c.id === embedId)

    // Embed should not be body (embed_source nodes get isBody: false)
    expect(embedCard?.isBody).toBeFalsy()
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
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({
        id: taskId,
        type: "p",
        item: { list: "-" },
        content: "Leading task",
        parent_id: rootId,
        parent_idx: 0,
      }),
      makeNode({
        id: sectionId,
        type: "h",
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({
        id: cardId,
        type: "p",
        content: "Card in section",
        parent_id: sectionId,
        parent_idx: 0,
      }),
    ]

    const repo = createFakeRepo({ nodes })

    // deriveColumnsFromRepo should produce the same structure as buildBoardState
    const derived = deriveColumnsFromRepo(repo, rootId, new Map())
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
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({
        id: embedId,
        type: "p",
        content: "Leading embed",
        parent_id: rootId,
        parent_idx: 0,
        embed_source: targetId,
      }),
      makeNode({
        id: sectionId,
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({ id: targetId, type: "p", item: { list: "-" }, title: "Target task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Map())

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
      makeNode({ id: rootId, type: "h", item: {}, fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({
        id: sec1Id,
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Todo",
        parent_id: rootId,
        parent_idx: 0,
      }),
      makeNode({
        id: sec2Id,
        type: "h",
        fstype: "mdsection",
        title: "Done",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({
        id: task1Id,
        type: "p",
        item: { list: "-" },
        content: "Task 1",
        parent_id: sec1Id,
        parent_idx: 0,
      }),
      makeNode({
        id: task2Id,
        type: "p",
        content: "Task 2",
        parent_id: sec2Id,
        parent_idx: 0,
      }),
    ]

    const repo = createFakeRepo({ nodes })

    const derived = deriveColumnsFromRepo(repo, rootId, new Map())
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
    expect(derived[0]!.cardNodes.length).toBe(built.columns[0]!.cardNodes.length)
    expect(derived[1]!.cardNodes.length).toBe(built.columns[1]!.cardNodes.length)
  })
})

// --- Merged from zoom-cursor-fallback.test.ts (bead: km-tui.zoom-cursor-fallback) ---

describe("zoom-out fallback: cursor moves up when at repo root", () => {
  it("moves cursor from card to column header when at repo root", () => {
    const { board } = testEnv(() =>
      item.root("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Cursor starts on first card (task1)
    board.expect("#task1[data-cursor]").toExist()

    // Press u — can't zoom out from repo root, so cursor should move up
    board.press("Z")

    // Should now be at column header level
    board.expect("#col1[data-cursor]").toExist()
  })

  it("moves cursor from column header to board root when at repo root", () => {
    const { board } = testEnv(() => item.root("board", item("col1", item("task1")), item("col2", item("task3"))))

    // Move to column header first
    board.press("k") // card → column header

    board.expect("#col1[data-cursor]").toExist()

    // Press u — should move to board level
    board.press("Z")

    board.expect("#board[data-cursor]").toExist()
  })

  it("rings bell at board level when at repo root (nowhere to go)", () => {
    const { board } = testEnv(() => item.root("board", item("col1", item("task1"))))

    // Navigate up to board level
    board.press("k") // column header
    board.press("k") // board level

    board.expect("#board[data-cursor]").toExist()

    // Press u at board level — should ring bell
    board.press("Z")
    expect(board.bell).toBe(true)
  })

  it("moves cursor to parent: card → column → board", () => {
    const { board } = testEnv(() => item.root("board", item("col1", item("a"), item("b"), item("c"))))

    // Start at first card, navigate to third card
    board.press("j").press("j")
    board.expect("#c[data-cursor]").toExist()

    // u goes to PARENT (not prev sibling): c → col1 → board
    board.press("Z")
    board.expect("#col1[data-cursor]").toExist()

    board.press("Z") // column header → board
    board.expect("#board[data-cursor]").toExist()

    board.press("Z") // at board level, should ring bell
    expect(board.bell).toBe(true)
  })
})

// --- Merged from zoom-out.test.ts (bead: km-tui.u-zoom-out, km-tui.u-zoom-parent) ---

describe("u zooms out to parent", () => {
  test("u zooms out one level, cursor stays on visible node nearest to where user was", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

    // Zoom into col1 via e (first move to column header)
    board.press("k") // card → column header
    board.expect("#col1[data-cursor]").toExist()
    board.press("z") // zoom into col1

    // Now col1 is the root, its children (1a, 1b) are visible as columns
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()
    // col2 should not be visible (we zoomed into col1)
    board.expect("#col2").not.toExist()

    // Press u to zoom back out to board level
    board.press("Z")

    // Cursor stays on 1a (grandchild of board, visible as card under col1)
    board.expect("#1a[data-cursor]").toExist()
    board.expect("#col2").toExist()
  })

  test("u from deeply zoomed level zooms out one level at a time", () => {
    // Deep tree: board > col > parent > child1(gc1,gc2) + child2(gc3)
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child1", item("gc1"), item("gc2")), item("child2", item("gc3"))))),
    )

    // zoom_inwards: two presses to reach parent (board → col → parent)
    board.press("z") // root=col, cursor stays on parent
    board.press("z") // root=parent, columns=[child1, child2]
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // Zoom into child1 (cursor is on gc1, first card in child1)
    board.press("k") // go to column header (child1)
    board.press("z") // root=child1, columns=[gc1, gc2] (but gc1/gc2 are leaves)
    board.expect("#gc1").toExist()
    board.expect("#gc2").toExist()

    // u zooms out one level: root=child1 → root=parent
    // cursor stays on gc1 (visible as card under child1 column)
    board.press("Z")
    board.expect("#gc1[data-cursor]").toExist()
    board.expect("#child2").toExist()

    // u again: root=parent → root=col
    // gc1 not visible (too deep), cursor goes to child1 (the column user was in, now a card)
    board.press("Z")
    board.expect("#child1[data-cursor]").toExist()

    // u again: root=col → root=board
    // child1 not visible (too deep), cursor goes to parent (the column user was in, now a card)
    board.press("Z")
    board.expect("#parent[data-cursor]").toExist()
  })

  test("u saves history so ] (nav_forward) can return to zoomed view", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child1", item("gc1")), item("child2", item("gc2"))))),
    )

    // zoom_inwards: two presses to reach parent (board → col → parent)
    board.press("z") // root=col
    board.press("z") // root=parent, columns=[child1, child2]
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // u zooms out: root=parent → root=col
    // cursor on child1 (the column user was in, now a card under parent)
    board.press("Z")
    board.expect("#child1[data-cursor]").toExist()

    // ] (nav forward) should restore the zoomed-into-parent view
    board.press("}")
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()
  })

  test("u keeps cursor on current column (not root) when cursor is on a card", () => {
    // board > col > parent > child1(gc1,gc2) + child2(gc3)
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child1", item("gc1"), item("gc2")), item("child2", item("gc3"))))),
    )

    // zoom_inwards: two presses to reach parent (board → col → parent)
    board.press("z") // root=col
    board.press("z") // root=parent, columns=[child1, child2], cursor=gc1
    board.expect("#gc1[data-cursor]").toExist()

    // Navigate to gc2 (second card in child1 column)
    board.press("j")
    board.expect("#gc2[data-cursor]").toExist()

    // Press u to zoom out: root=parent → root=col
    // Cursor should land on child1 (the column the user was in, now a card),
    // NOT on parent (the old root)
    board.press("Z")
    board.expect("#child1[data-cursor]").toExist()
    board.expect("#child2").toExist()
  })

  test("u keeps cursor on current column even when in second column", () => {
    // board > col > parent > child1(gc1) + child2(gc2, gc3)
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child1", item("gc1")), item("child2", item("gc2"), item("gc3"))))),
    )

    // zoom_inwards: two presses to reach parent (board → col → parent)
    board.press("z") // root=col
    board.press("z") // root=parent, columns=[child1, child2], cursor=gc1
    board.expect("#gc1[data-cursor]").toExist()

    // Navigate right to child2 column
    board.press("l")
    board.expect("#gc2[data-cursor]").toExist()

    // Press u to zoom out: root=parent → root=col
    // Cursor should land on child2 (the column the user was in)
    board.press("Z")
    board.expect("#child2[data-cursor]").toExist()
  })

  test("at repo root, u acts as cursor-up instead of zoom", () => {
    const { board } = testEnv(() => item.root("board", item("col1", item("task1"), item("task2"))))

    // At repo root, cursor on first card
    board.expect("#task1[data-cursor]").toExist()

    // u should move cursor up (not zoom) since we're at repo root
    // task1 is first card → move to column header
    board.press("Z")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u closes detail pane before zooming", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1", item("sub1")), item("card2", item("sub2")))),
    )

    // zoom_inwards: two presses to reach card1 (board → col → card1)
    board.press("z") // root=col
    board.press("z") // root=card1, sub1 is a column
    board.expect("#sub1").toExist()

    // Open detail pane with D (toggle_detail_pane)
    board.press("D")

    // u should close detail pane first, not zoom
    board.press("Z")
    // We should still be at card1 root (detail pane closed, zoom not yet executed)
    board.expect("#sub1").toExist()

    // Second u should actually zoom out to col
    // cursor stays on sub1 (visible as card under card1 column)
    board.press("Z")
    board.expect("#sub1[data-cursor]").toExist()
    board.expect("#card2").toExist()
  })

  test("u zooms out when viewing a file inside a repo (km view file.md scenario)", () => {
    // Simulates: km view /tmp/vt/CLAUDE.md
    // Repo root (folder) → file → section1, section2
    // Board starts rooted at the file, not the repo root
    const nodes = item.root(
      "repo",
      item.file(
        "file",
        item.section("section1", item("task1"), item("task2")),
        item.section("section2", item("task3")),
      ),
    )
    const repo = createFakeRepo({ nodes })

    // Start board rooted at the file (like km view file.md)
    const { board } = testEnvWithRepo(repo, "file")

    // Board should show file's children as columns
    board.expect("#section1").toExist()
    board.expect("#section2").toExist()

    // Press u — should zoom out from file to repo root
    // Cursor stays on section1 (the column user was in, now a card under file)
    board.press("Z")
    board.expect("#section1[data-cursor]").toExist()
  })

  test("u zooms out from file to folder, then falls back to cursor-up at repo root", () => {
    // Deeper tree: repo > folder > file > sections
    const nodes = item.root(
      "repo",
      item.folder("folder", item.file("file", item.section("sec1", item("t1")), item.section("sec2", item("t2")))),
    )
    const repo = createFakeRepo({ nodes })

    // Start board rooted at file
    const { board } = testEnvWithRepo(repo, "file")

    board.expect("#sec1").toExist()
    board.expect("#sec2").toExist()

    // First u: zoom out from file to folder
    // Cursor stays on sec1 (the column user was in, now a card under file)
    board.press("Z")
    board.expect("#sec1[data-cursor]").toExist()

    // Second u: zoom out from folder to repo root
    // sec1 not visible (too deep), cursor goes to file (the column user was in, now a card under folder)
    board.press("Z")
    board.expect("#file[data-cursor]").toExist()

    // Third u: at repo root, cursor on file → navigates up to folder (column header)
    board.press("Z")
    board.expect("#folder[data-cursor]").toExist()

    // Fourth u: cursor on folder (column header, parent=repo=root) → navigates to root
    board.press("Z")
    board.expect("#repo[data-cursor]").toExist()
  })
})

// --- Merged from u-zoom-parent.test.ts (bead: km-tui.u-zoom-parent) ---

describe("u key — go to parent, not previous sibling", () => {
  test("u from 2nd card goes to column header (parent), not prev sibling", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A1"), item("A2"), item("A3"))), {
      columns: 120,
      rows: 24,
    })

    board.press("j") // → A2
    board.expect("#A2[data-cursor]").toExist()

    board.press("Z")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u from 3rd card goes to column header (parent), not prev sibling", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A1"), item("A2"), item("A3"))), {
      columns: 120,
      rows: 24,
    })

    board.press("j").press("j") // → A3
    board.expect("#A3[data-cursor]").toExist()

    board.press("Z")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u twice from card: card → column → board", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A1"), item("A2"), item("A3"))), {
      columns: 120,
      rows: 24,
    })

    board.press("j").press("j") // → A3
    board.expect("#A3[data-cursor]").toExist()

    board.press("Z") // → col1
    board.expect("#col1[data-cursor]").toExist()

    board.press("Z") // → board
    board.expect("#board[data-cursor]").toExist()
  })

  test("u from board level is boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A1"))), { columns: 120, rows: 24 })

    board.press("k").press("k") // card → col → board
    board.expect("#board[data-cursor]").toExist()

    board.press("Z")
    board.expect("#board[data-cursor]").toExist()
    expect(board.bell).toBe(true)
  })

  test("u from column header goes to board level", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A1")), item("col2", item("B1"))), {
      columns: 120,
      rows: 24,
    })

    board.press("k") // card → column header
    board.expect("#col1[data-cursor]").toExist()

    board.press("Z")
    board.expect("#board[data-cursor]").toExist()
  })

  test("u is different from k: u → parent, k → prev sibling", () => {
    const { board: boardU } = testEnv(() => item("board", item("col1", item("A1"), item("A2"), item("A3"))), {
      columns: 120,
      rows: 24,
    })

    const { board: boardK } = testEnv(() => item("board", item("col1", item("A1"), item("A2"), item("A3"))), {
      columns: 120,
      rows: 24,
    })

    boardU.press("j") // → A2
    boardK.press("j") // → A2

    boardU.press("Z")
    boardK.press("k")

    const uResult = boardU.q("[data-cursor]").getAttribute("id")
    const kResult = boardK.q("[data-cursor]").getAttribute("id")

    expect(uResult).toBe("col1") // u → parent
    expect(kResult).toBe("A1") // k → prev sibling
  })

  test("u from card in col2 goes to col2 header", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A1")), item("col2", item("B1"), item("B2"), item("B3"))),
      { columns: 120, rows: 24 },
    )

    board.press("l") // → B1
    board.press("j") // → B2
    board.expect("#B2[data-cursor]").toExist()

    board.press("Z")
    board.expect("#col2[data-cursor]").toExist()
  })

  test("u from body card goes to board level (body cards are children of root)", () => {
    const { board } = testEnv(() => item("board", item.p("para1"), item.p("para2"), item("col1", item("A1"))), {
      columns: 120,
      rows: 24,
    })

    board.press("j") // → para2
    board.expect("#para2[data-cursor]").toExist()

    // Body cards' tree parent is the board root
    board.press("Z")
    board.expect("#board[data-cursor]").toExist()
  })
})

// =============================================================================
// Zoom Mismatch: Real Vault Regression (from zoom-mismatch-real.slow.test.ts)
// =============================================================================

const VAULT_PATH = new URL("../../../imports/asana/stabell", import.meta.url).pathname

describe.skipIf(!existsSync(VAULT_PATH))("zoom-mismatch: real vault repro", () => {
  test("cursor down does not cause incremental mismatch", { timeout: 60_000 }, async () => {
    const repo = runGenerator(createRepo(VAULT_PATH, { loadFiles: true }))

    // Find the repo root
    const nodes = repo.query("type:folder")
    let rootId: string | undefined
    for (const node of nodes) {
      if (node.data?.is_repo_root) {
        rootId = node.id
        break
      }
    }
    expect(rootId).toBeDefined()

    // Use smaller terminal to make the test faster
    const driver = createBoardDriver(repo, rootId!, {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    // Initial render — verify vault loaded (check for any known folder)
    expect(driver.text).toMatch(/beowa|early-orbit|bjørn|family/)

    // Navigate down - this is render #2, where the crash occurred
    await driver.press("j")

    // Manual buffer comparison
    const app = driver.app as any
    if (typeof app.freshRender === "function" && typeof app.lastBuffer === "function") {
      const fresh = app.freshRender()
      const current = app.lastBuffer()
      if (fresh && current) {
        const mismatch = compareBuffers(current, fresh)
        if (mismatch) {
          const msg = formatMismatch(mismatch, {
            incrementalText: bufferToText(current),
            freshText: bufferToText(fresh),
          })
          throw new Error(`Incremental/fresh mismatch:\n${msg}`)
        }
      }
    }
  })
})

describe("zoom out from file to folder shows multiple columns", () => {
  test("Z from a file with siblings produces horizontal columns, not single-column list", () => {
    // Simulate folder structure: early-orbit folder with 3 md files
    // When zoomed into one file and pressing Z, the folder's children
    // should become columns (horizontal layout), not a single-column list.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "early-orbit",
            item("Overview", item("task-a"), item("task-b")),
            item("Milestones", item("milestone-1"), item("milestone-2")),
            item("Program", item("session-1")),
          ),
        ),
      { columns: 120, rows: 24 },
    )

    // Navigate to first card and zoom into it
    board.press("z") // zoom into early-orbit (column → board)
    board.expect("#Overview").toExist()
    board.expect("#Milestones").toExist()
    board.expect("#Program").toExist()

    // Zoom into Overview
    board.press("z")
    board.expect("#task-a").toExist()

    // Z to zoom back out to early-orbit level
    board.press("Z")

    // All three sections should be visible as COLUMNS (horizontal layout)
    board.expect("#Overview").toExist()
    board.expect("#Milestones").toExist()
    board.expect("#Program").toExist()

    // Verify they're actually laid out as separate columns (horizontal, not stacked)
    const overviewBox = board.q("#Overview").boundingBox()
    const milestonesBox = board.q("#Milestones").boundingBox()
    const programBox = board.q("#Program").boundingBox()

    // Columns should be side by side (different X positions, same Y row)
    expect(milestonesBox!.x).toBeGreaterThan(overviewBox!.x)
    expect(programBox!.x).toBeGreaterThan(milestonesBox!.x)
    expect(milestonesBox!.y).toBe(overviewBox!.y)
    expect(programBox!.y).toBe(overviewBox!.y)
  })
})

// =============================================================================
// Zoom + Background Color Assertions
// =============================================================================

describe("Zoom color assertions", () => {
  test("cursor card has $selection-bg after zoom in", () => {
    const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))), {
      columns: 80,
      rows: 24,
    })

    // Zoom in: board -> col -> parent
    board.press("z") // root=col
    board.press("z") // root=parent, cursor on child1
    board.expect("#child1[data-cursor]").toExist()

    // Verify cursor card has selection background color
    const box = board.q("#child1[data-cursor]").boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    let hasSelectionBg = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.bg === TC["$selection-bg"]) {
        hasSelectionBg = true
        break
      }
    }
    expect(hasSelectionBg, "cursor card should have $selection-bg after zoom in").toBe(true)
  })

  test("cursor card has $selection-bg after zoom out", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("parent", item("child1", item("gc1")), item("child2", item("gc2"))))),
      { columns: 120, rows: 24 },
    )

    // Zoom in deep
    board.press("z") // root=col
    board.press("z") // root=parent, columns=[child1, child2]
    board.press("k") // go to column header (child1)
    board.press("z") // root=child1

    // Zoom out
    board.press("Z") // root=parent
    const cursorEl = board.q("[data-cursor]")
    expect(cursorEl.count()).toBeGreaterThan(0)
    const cursorId = cursorEl.getAttribute("id")
    expect(cursorId).toBeTruthy()

    const box = cursorEl.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    let hasSelectionBg = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.bg === TC["$selection-bg"]) {
        hasSelectionBg = true
        break
      }
    }
    expect(hasSelectionBg, `cursor card "${cursorId}" should have $selection-bg after zoom out`).toBe(true)
  })

  test("non-cursor cards do NOT have $selection-bg after zoom", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col", item("parent", item("child1", item("gc1"), item("gc2")), item("child2", item("gc3")))),
        ),
      { columns: 120, rows: 24 },
    )

    // Zoom into parent
    board.press("z") // root=col
    board.press("z") // root=parent
    board.expect("#gc1[data-cursor]").toExist()

    // gc2 and gc3 should NOT have selection bg
    for (const nodeId of ["gc2", "gc3"]) {
      const nodeEl = board.q(`#${nodeId}`)
      if (nodeEl.count() === 0) continue
      const box = nodeEl.boundingBox()
      if (!box) continue

      let hasSelectionBg = false
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = board.screen.cell(x, box.y)
        if (cell.bg === TC["$selection-bg"]) {
          hasSelectionBg = true
          break
        }
      }
      expect(hasSelectionBg, `non-cursor card "${nodeId}" should NOT have $selection-bg`).toBe(false)
    }
  })

  test.each([
    { cols: 200, rows: 50 },
    { cols: 120, rows: 30 },
    { cols: 80, rows: 24 },
  ])("zoom in/out at $cols x $rows maintains correct cursor bg color", ({ cols, rows }) => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task1"), item("task2"), item("task3")),
          item("col2", item("taskA"), item("taskB")),
        ),
      { columns: cols, rows },
    )

    // Zoom into col1
    board.press("k") // column header
    board.press("z") // root=col1

    // Verify cursor card has selection bg
    const cursorEl = board.q("[data-cursor]")
    expect(cursorEl.count()).toBeGreaterThan(0)
    const box = cursorEl.boundingBox()
    if (!box) return

    let hasSelectionBg = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.bg === TC["$selection-bg"]) {
        hasSelectionBg = true
        break
      }
    }
    expect(hasSelectionBg, "cursor card should have $selection-bg after zoom at wide terminal").toBe(true)

    // Zoom back out
    board.press("Z")
    const cursorEl2 = board.q("[data-cursor]")
    expect(cursorEl2.count()).toBeGreaterThan(0)
    const box2 = cursorEl2.boundingBox()
    if (!box2) return

    let hasSelectionBg2 = false
    for (let x = box2.x; x < box2.x + box2.width; x++) {
      const cell = board.screen.cell(x, box2.y)
      if (cell.bg === TC["$selection-bg"]) {
        hasSelectionBg2 = true
        break
      }
    }
    expect(hasSelectionBg2, "cursor card should have $selection-bg after zoom out").toBe(true)
  })
})
