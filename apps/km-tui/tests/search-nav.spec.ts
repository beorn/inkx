/**
 * Search Navigation Tests
 *
 * Tests for search-then-navigate behavior: when a user selects a search result,
 * the board zooms to make the target visible and places the cursor on it.
 *
 * Bug 1 (km-tui.search-board): Search lands on single-column body board when
 *   the zoom target has no oi children. findZoomTarget always returns the
 *   original target as cursorTarget, but if the target is a descendant of a
 *   body card, j/k navigation breaks because the navigation layer resolves the
 *   wrong ancestor level.
 *
 * Bug 2: Cursor stuck on single-column board after search. When cursorNodeId
 *   is a descendant of a body card, navigateVertical resolves the card ancestor
 *   at depth 2 (column→card pattern), but body cards are at depth 1. This means
 *   j/k navigates at the descendant level instead of the body card level.
 */

import { describe, test, expect, vi } from "vitest"
import { act } from "react"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { findZoomTarget } from "../src/views/use-board-dialogs.ts"
import { navigateToNode } from "../src/navigate-to-node.ts"
import type { KNode } from "@km/core"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"
import type { StoreApi } from "zustand"
import type { BoardAppStore } from "../src/board-app-store.ts"

// Helper to create li nodes with li children (item() converts parents to oi)
function makeLiNode(id: string, parentId: string | null, parentIdx: number, children?: string[]): KNode[] {
  const node: KNode = {
    id,
    type: "li",
    list_marker: "-",
    task_marker: "[ ]",
    task_status: "todo",
    content: id,
    data: {},
    parent_id: parentId,
    parent_idx: parentIdx,
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  const result: KNode[] = [node]
  if (children) {
    for (let i = 0; i < children.length; i++) {
      result.push(...makeLiNode(children[i]!, id, i))
    }
  }
  return result
}

function makeOiNode(id: string, parentId: string | null, parentIdx: number): KNode {
  return {
    id,
    type: "oi",
    fstype: "folder",
    content: undefined,
    data: { name: id },
    parent_id: parentId,
    parent_idx: parentIdx,
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

/** Dispatch a board action and flush React so DOM reflects the state change. */
function dispatchAndFlush(store: StoreApi<BoardAppStore>, action: Parameters<BoardAppStore["dispatchBoard"]>[0]) {
  act(() => {
    store.getState().dispatchBoard(action)
    store.setState((s) => s)
  })
}

/** Derive layout from store state on demand (layout is no longer stored). */
function derivedState(store: StoreApi<BoardAppStore>) {
  const s = store.getState()
  const columns = deriveColumnsFromRepo(s.repo, s.rootId, s.foldedNodes)
  const nodeIndex = buildNodeIndex(columns)
  const cursor = deriveCursorIndices(columns, s.cursorNodeId, nodeIndex)
  const col = columns[cursor.colIndex]
  const card = col?.cardNodes[cursor.cardIndex]
  const selectedNode = card ?? col?.node ?? null
  const selectionLevel: "board" | "column" | "card" =
    cursor.colIndex === -1 ? "board" : cursor.cardIndex === -1 ? "column" : "card"
  return {
    columns,
    colIndex: cursor.colIndex,
    cardIndex: cursor.cardIndex,
    nodeIndex,
    selectedNode,
    selectionLevel,
  }
}

describe("findZoomTarget", () => {
  test("returns grandparent for depth-2 target", () => {
    const nodes = item("root", item("parent", item("child1"), item("child2")))
    const repo = createFakeRepo({ nodes })
    const child1 = repo.getNode("child1")!

    const result = findZoomTarget(child1, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("child1")
  })

  test("returns parent when no grandparent", () => {
    const nodes = item("root", item("child1"), item("child2"))
    const repo = createFakeRepo({ nodes })
    const child1 = repo.getNode("child1")!

    const result = findZoomTarget(child1, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("child1")
  })

  test("returns target itself when at root level", () => {
    const nodes = item("root")
    const repo = createFakeRepo({ nodes })
    const root = repo.getNode("root")!

    const result = findZoomTarget(root, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("root")
  })

  test("body-only grandparent with great-grandparent: zooms to great-grandparent", () => {
    // When grandparent (flatList) has no oi children → body-only board.
    // If a great-grandparent exists, zoom there instead so flatList becomes
    // a column and task1 becomes a visible card. Cursor lands on task1
    // (the parent of subtask1, which is the navigable card).
    const vaultNode = makeOiNode("vault", null, 0)
    const flatListNode = makeOiNode("flatList", "vault", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1", "subtask2"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [vaultNode, flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    const result = findZoomTarget(subtask1, repo)
    // Zoom to vault (great-grandparent) so flatList is a column, task1 is a card
    expect(result.zoomTarget.id).toBe("vault")
    expect(result.cursorTarget.id).toBe("task1")
  })

  test("body-only grandparent without great-grandparent: walks cursor up to parent", () => {
    // When grandparent has no oi children and there's NO great-grandparent,
    // we must zoom to grandparent (only option) and walk cursor to parent.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    // ancestors: [subtask1, task1, flatList] (length 3)
    // grandparent = flatList (no oi children), no great-grandparent
    const result = findZoomTarget(subtask1, repo)
    expect(result.zoomTarget.id).toBe("flatList")
    expect(result.cursorTarget.id).toBe("task1")
  })

  test("deep target (ancestors >= 4): zooms to grandparent with cursor on target", () => {
    // Structure: root > section1 > section2 > deep-task
    // ancestors: [deep-task, section2, section1, root] (length 4)
    // grandparent = section1, which has oi children (section2) → normal multi-column board
    // Expected: zoom to grandparent (section1), cursor on target (deep-task)
    const nodes = item("root", item("section1", item("section2", item("deep-task"), item("other-task"))))
    const repo = createFakeRepo({ nodes })
    const deepTask = repo.getNode("deep-task")!

    const result = findZoomTarget(deepTask, repo)
    expect(result.zoomTarget.id).toBe("section1")
    expect(result.cursorTarget.id).toBe("deep-task")
  })

  test("deep target in body-only grandparent: zooms to great-grandparent", () => {
    // Structure: root > section1 > flatList(li-only) > task1 > subtask1
    // Bug scenario: flatList has no oi children, only li. Zooming to flatList
    // produces a single-column board with many flat cards.
    // For ancestors.length >= 4 with body-only grandparent, zoom to great-grandparent
    // so flatList becomes a column and task1 is a card.
    const rootNode = makeOiNode("root", null, 0)
    const section1Node = makeOiNode("section1", "root", 0)
    const flatListNode = makeOiNode("flatList", "section1", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [rootNode, section1Node, flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    // ancestors: [subtask1, task1, flatList, section1, root] (length 5)
    // grandparent = flatList (no oi children → body-only)
    // great-grandparent = section1
    // Should zoom to section1 (great-grandparent) so flatList is a column
    // and task1 is a visible card
    const result = findZoomTarget(subtask1, repo)
    expect(result.zoomTarget.id).toBe("section1")
    expect(result.cursorTarget.id).toBe("task1")
  })
})

describe("ZOOM_IN to body-only board: cursor + navigation", () => {
  test("cursor lands on card level after zoom to body-only board", () => {
    const { store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "flatNode",
      cursorNodeId: "task2",
    })

    const state = store.getState()
    expect(state.rootId).toBe("flatNode")
    expect(state.cursorNodeId).toBe("task2")
    expect(derivedState(store).selectionLevel).toBe("card")
  })

  test("j/k navigation works after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "flatNode",
      cursorNodeId: "task1",
    })

    expect(store.getState().cursorNodeId).toBe("task1")

    board.press("j")
    expect(store.getState().cursorNodeId).toBe("task2")

    board.press("j")
    expect(store.getState().cursorNodeId).toBe("task3")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("task2")
  })

  test("cursor + DOM visible after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "flatNode",
      cursorNodeId: "task2",
    })

    board.expect("#task2[data-cursor]").toExist()
    board.expectScreen("task2")
  })

  test("j/k with DOM assertions after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "flatNode",
      cursorNodeId: "task1",
    })

    board.expect("#task1[data-cursor]").toExist()

    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    board.press("j")
    board.expect("#task3[data-cursor]").toExist()

    board.press("k")
    board.expect("#task2[data-cursor]").toExist()
  })
})

describe("BUG: j/k broken when cursor is on body-card descendant", () => {
  test("j/k navigates between body cards when cursor is on a descendant", () => {
    // This is the core bug scenario:
    //
    // After search navigates to a subtask, the board zooms to the subtask's
    // grandparent (flatList). flatList has only li children (no oi), so
    // the board is a single Description column. The cursor lands on task1
    // (the parent body card), but if cursorTarget was the subtask, j/k
    // tries to navigate at the subtask level, not the body card level.
    //
    // With the fix, findZoomTarget should walk cursorTarget up to the
    // body card level. But even without that fix, navigateVertical should
    // handle this case by detecting body-card descendants and resolving
    // them to the body card for navigation.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1", "subtask2"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const task3Nodes = makeLiNode("task3", "flatList", 2)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes, ...task3Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const { board, store } = testEnv(() => allNodes, { checkIncremental: false })

    // ZOOM_IN to flatList with cursor on subtask1 (a descendant of body card task1)
    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "flatList",
      cursorNodeId: "subtask1",
    })

    const stateAfterZoom = store.getState()
    expect(stateAfterZoom.rootId).toBe("flatList")

    // With the fix in findZoomTarget, cursorNodeId should be walked up to task1
    // (or the navigation layer handles it). Either way, j should move to task2.
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("task2")

    board.press("j")
    expect(store.getState().cursorNodeId).toBe("task3")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("task2")
  })
})

describe("paragraph-only board: cursor + navigation", () => {
  test("cursor + j/k work on paragraph body board", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item("docs", item("readme", item.paragraph("intro"), item.paragraph("setup"), item.paragraph("usage"))),
        ),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "readme",
      cursorNodeId: "setup",
    })

    expect(store.getState().rootId).toBe("readme")
    expect(store.getState().cursorNodeId).toBe("setup")
    expect(derivedState(store).selectionLevel).toBe("card")

    board.press("j")
    expect(store.getState().cursorNodeId).toBe("usage")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("setup")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("intro")
  })
})

describe("full search flow integration", () => {
  test("search in deep tree: zoom + cursor + j/k navigation", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item(
            "projects",
            item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
            item("project-b", item("taskB1")),
          ),
        ),
      { checkIncremental: false },
    )

    const repo = store.getState().repo
    const taskA2 = repo.getNode("taskA2")!
    const { zoomTarget, cursorTarget } = findZoomTarget(taskA2, repo)

    expect(zoomTarget.id).toBe("projects")
    expect(cursorTarget.id).toBe("taskA2")

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: zoomTarget.id,
      cursorNodeId: cursorTarget.id,
    })

    expect(store.getState().rootId).toBe("projects")
    expect(store.getState().cursorNodeId).toBe("taskA2")
    expect(derivedState(store).selectionLevel).toBe("card")

    board.expect("#taskA2[data-cursor]").toExist()

    board.press("j")
    expect(store.getState().cursorNodeId).toBe("taskA3")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("taskA2")
  })

  test("SELECT on already-visible card", () => {
    const { board, store } = testEnv(
      () => item("root", item("col1", item("taskA"), item("taskB")), item("col2", item("taskC"))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, { type: "SELECT", nodeId: "taskB" })

    expect(store.getState().cursorNodeId).toBe("taskB")
    board.expect("#taskB[data-cursor]").toExist()
  })
})

describe("scroll to selection after zoom", () => {
  test("ZOOM_IN scrolls to cursor card when it would be off-screen", () => {
    // Create a board with many items in a column — enough to require scrolling
    // on a small terminal (rows=15). With header + breadcrumb + separator,
    // only ~3 cards are visible (card height=4). Card at index 12 is off-screen.
    const tasks = Array.from({ length: 15 }, (_, i) => item(`task${i}`))
    const { board, store } = testEnv(() => item("root", item("big-col", ...tasks), item("small-col", item("other"))), {
      rows: 15,
      checkIncremental: false,
    })

    // Zoom to root with cursor on task12 (deep in the list, off-screen)
    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "root",
      cursorNodeId: "task12",
    })

    expect(store.getState().cursorNodeId).toBe("task12")

    // Press j to trigger a render cycle (dispatchAndFlush doesn't run doRender).
    // j moves cursor to task13, which should also be in the scrolled view.
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("task13")

    // After navigating from task12 to task13, both should be in the scrolled view
    board.expectScreen("task13")
  })

  test("search navigate to off-screen card scrolls it into view", () => {
    // Simulate the search flow: deep tree where target is a grandchild of root,
    // but far enough down the column to be off-screen
    const tasks = Array.from({ length: 20 }, (_, i) => item(`deep${i}`))
    const { board, store } = testEnv(() => item("root", item("section", ...tasks)), {
      rows: 15,
      checkIncremental: false,
    })

    const repo = store.getState().repo
    const deep15 = repo.getNode("deep15")!
    const { zoomTarget, cursorTarget } = findZoomTarget(deep15, repo)

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: zoomTarget.id,
      cursorNodeId: cursorTarget.id,
    })

    // Press j to trigger render and move cursor
    board.press("j")

    // deep15 or its neighbor should be visible
    board.expectScreen("deep16")
  })

  test("SELECT on off-screen card in current view scrolls it into view", () => {
    // Target is already a grandchild of root (visible in layout model),
    // but far enough down the column to be off-screen. SELECT should scroll.
    const tasks = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board, store } = testEnv(() => item("root", item("col1", ...tasks), item("col2", item("x"))), {
      rows: 15,
      checkIncremental: false,
    })

    // SELECT a card deep in col1 — should scroll to make it visible
    dispatchAndFlush(store, { type: "SELECT", nodeId: "card15" })

    // Press j to trigger render and move cursor
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("card16")

    board.expectScreen("card16")
  })

  test("ZOOM_IN scrolls to cursor in columns view", () => {
    // Columns view uses single-row items, so more items fit. Still need to scroll
    // when target is deep enough. 30 items in a column with 15-row terminal.
    const tasks = Array.from({ length: 30 }, (_, i) => item(`ctask${i}`))
    const { board, store } = testEnv(() => item("root", item("big-col", ...tasks), item("small-col", item("other"))), {
      rows: 15,
      viewMode: "columns",
      checkIncremental: false,
    })

    // Zoom with cursor on ctask25 (far off-screen in columns view)
    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "root",
      cursorNodeId: "ctask25",
    })

    expect(store.getState().cursorNodeId).toBe("ctask25")

    // Press j to trigger render and move cursor
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("ctask26")

    board.expectScreen("ctask26")
  })

  test("cursor state is correct in DOM after ZOOM_IN (no render needed)", () => {
    // Verify that the cursor DOM element is correct after ZOOM_IN,
    // even before a render cycle runs (DOM is updated by React, not inkx pipeline)
    const tasks = Array.from({ length: 15 }, (_, i) => item(`dtask${i}`))
    const { board, store } = testEnv(() => item("root", item("col", ...tasks)), { rows: 15, checkIncremental: false })

    dispatchAndFlush(store, {
      type: "ZOOM_IN",
      nodeId: "root",
      cursorNodeId: "dtask12",
    })

    // DOM should have cursor on dtask12
    board.expect("#dtask12[data-cursor]").toExist()
    expect(store.getState().cursorNodeId).toBe("dtask12")
    expect(derivedState(store).cardIndex).toBe(12)
  })
})

// =============================================================================
// navigateToNode() — unified navigate function
// =============================================================================

describe("navigateToNode", () => {
  test("target is current root → SELECT on itself", () => {
    const nodes = item("root", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("root", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "root" })
  })

  test("target not found → returns null", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const nodes = item("root", item("col1"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("nonexistent", "root", repo)
    expect(result).toBeNull()
    spy.mockRestore()
  })

  test("target is direct child of root (column level) → SELECT", () => {
    const nodes = item("root", item("col1", item("task1")), item("col2", item("task2")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("col1", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "col1" })
  })

  test("target is grandchild of root (card level) → SELECT", () => {
    const nodes = item("root", item("col1", item("task1"), item("task2")), item("col2"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("task2", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "task2" })
  })

  test("target is one level deep → ZOOM_IN to parent", () => {
    // Structure: root > projects > project-a > taskA1
    // Current root = root, target = taskA1
    // taskA1's parent = project-a (child of projects), grandparent = projects
    // projects is not a child/grandchild of root → need ZOOM_IN
    // resolveZoomTarget: grandparent = projects → zoom to projects, cursor on taskA1
    const nodes = item("root", item("projects", item("project-a", item("taskA1"), item("taskA2"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("taskA1", "root", repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "projects",
      cursorTarget: "taskA1",
    })
  })

  test("target is deeply nested → ZOOM_IN to appropriate ancestor", () => {
    // Structure: root > area > projects > project-a > task > subtask
    // Current root = root, target = subtask
    // subtask's grandparent = project-a, which has oi children
    // → zoom to project-a (grandparent), cursor on subtask
    const nodes = item("root", item("area", item("projects", item("project-a", item("task", item("subtask"))))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("subtask", "root", repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "project-a",
      cursorTarget: "subtask",
    })
  })

  test("target with body-only grandparent → zooms to great-grandparent", () => {
    // Structure: vault(oi) > flatList(oi, no oi children) > task1(li) > subtask1(li)
    // flatList has only li children (body-only board).
    // great-grandparent = vault → zoom there so flatList becomes a column
    const vaultNode = makeOiNode("vault", null, 0)
    const flatListNode = makeOiNode("flatList", "vault", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [vaultNode, flatListNode, ...task1Nodes, ...task2Nodes]
    const repo = createFakeRepo({ nodes: allNodes })

    const result = navigateToNode("subtask1", null, repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "vault",
      cursorTarget: "task1",
    })
  })

  test("body-only grandparent without great-grandparent → DETAIL_VIEW (flat list fallback)", () => {
    // Structure: flatList(oi, no oi children) > task1(li) > subtask1(li)
    // No great-grandparent → flatList is the zoom target but has no structure.
    // Returns DETAIL_VIEW so the caller opens the detail pane instead of
    // landing on a single-column flat board.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes]
    const repo = createFakeRepo({ nodes: allNodes })

    const result = navigateToNode("subtask1", null, repo)
    expect(result).toEqual({
      action: "DETAIL_VIEW",
      zoomTarget: "flatList",
      cursorTarget: "task1",
    })
  })

  test("target already visible after zoom → SELECT without re-zoom", () => {
    // Structure: root > col1 > task1, task2
    // If we're already zoomed to root, and target is task1 (grandchild) → just SELECT
    const nodes = item("root", item("col1", item("task1"), item("task2")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("task1", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "task1" })
  })

  test("target visible at zoomed-in level → SELECT", () => {
    // Structure: root > projects > project-a > taskA1, taskA2
    // Current root = projects (already zoomed in)
    // target = taskA1 → grandchild of projects → SELECT
    const nodes = item("root", item("projects", item("project-a", item("taskA1"), item("taskA2"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("taskA1", "projects", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "taskA1" })
  })

  test("rootId is null (top-level) with depth-2 target → SELECT", () => {
    // When rootId is null, the board shows root nodes as columns
    // and their children as cards. A grandchild of null (i.e., child of
    // a root node) is visible at card level → SELECT.
    const nodes = item("root", item("child"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("child", null, repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "child" })
  })

  test("rootId is null with deeply nested target → ZOOM_IN", () => {
    // When rootId is null and target is deep, ZOOM_IN is needed.
    // Structure: root > col > task > subtask
    // subtask's grandparent = col, col's parent = root, root's parent = null
    // subtask is NOT a child or grandchild of null → ZOOM_IN
    const nodes = item("root", item("col", item("task", item("subtask"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("subtask", null, repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "col",
      cursorTarget: "subtask",
    })
  })
})

// =============================================================================
// Full search flow (key presses): / → type → Enter → cursor lands on match
// =============================================================================

describe("search flow via key presses", () => {
  test("search + Enter navigates cursor to the matched card (deep tree)", () => {
    // Structure: root > projects > project-a > taskA1, taskA2, taskA3
    //                            > project-b > taskB1
    // User searches for "taskA2" and expects cursor to land on it.
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item(
            "projects",
            item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
            item("project-b", item("taskB1")),
          ),
        ),
      { checkIncremental: false },
    )

    // Open search dialog
    board.press("/")
    expect(store.getState().ui.showSearchDialog).toBe(true)

    // Type search query
    for (const ch of "taskA2") board.press(ch)

    // Confirm search result
    board.press("Enter")

    // Dialog should be closed
    expect(store.getState().ui.showSearchDialog).toBe(false)

    // Cursor should be on the matched card
    expect(store.getState().cursorNodeId).toBe("taskA2")
    expect(derivedState(store).selectionLevel).toBe("card")
    board.expect("#taskA2[data-cursor]").toExist()
  })

  test("search + Enter for already-visible card uses SELECT (no zoom)", () => {
    // Structure: root > col1 > taskA, taskB > col2 > taskC
    // User is at root, taskB is already visible (grandchild of root).
    const { board, store } = testEnv(
      () => item("root", item("col1", item("taskA"), item("taskB")), item("col2", item("taskC"))),
      { checkIncremental: false },
    )

    // Open search dialog
    board.press("/")
    expect(store.getState().ui.showSearchDialog).toBe(true)

    // Type search query
    for (const ch of "taskB") board.press(ch)

    // Confirm search result
    board.press("Enter")

    // Cursor should be on the matched card, root unchanged
    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(store.getState().rootId).toBe("root")
    expect(store.getState().cursorNodeId).toBe("taskB")
    board.expect("#taskB[data-cursor]").toExist()
  })

  test("search + Enter for deeply nested node zooms to make it a card", () => {
    // Structure: root > projects > project-a > task1 > subtask1
    // subtask1 is depth 4 from root. After search, board should zoom so that
    // subtask1 (or its parent task1) is a visible card, not just a descendant.
    const { board, store } = testEnv(
      () => item("root", item("projects", item("project-a", item("task1", item("subtask-xyz"))))),
      { checkIncremental: false },
    )

    // Search for the deeply nested subtask
    board.press("/")
    for (const ch of "subtask-xyz") board.press(ch)
    board.press("Enter")

    expect(store.getState().ui.showSearchDialog).toBe(false)

    // The cursor should be on a visible card — either the subtask itself
    // (if the board zoomed deep enough) or its nearest card ancestor.
    // Most importantly, j/k should work from here.
    const cursorId = store.getState().cursorNodeId
    expect(cursorId).not.toBeNull()
    expect(derivedState(store).selectionLevel).toBe("card")

    // The cursor should be navigable with j/k
    const cursorBefore = store.getState().cursorNodeId
    board.press("j")
    // If j works, cursor moved (or hit boundary). Either way, it didn't break.
    // The key assertion is that selectionLevel stayed at "card".
    expect(derivedState(store).selectionLevel).toBe("card")
  })

  test("search for depth-3 node zooms and places cursor on exact card", () => {
    // Structure: vault > section > project > my-task, other-task
    // my-task is at depth 3 from vault. Search should zoom to section
    // and place cursor on my-task (now a card under project column).
    const { board, store } = testEnv(
      () => item("vault", item("section", item("project", item("my-task"), item("other-task")))),
      { checkIncremental: false },
    )

    // Search for the depth-3 node
    board.press("/")
    for (const ch of "my-task") board.press(ch)
    board.press("Enter")

    expect(store.getState().ui.showSearchDialog).toBe(false)
    // Should have zoomed to section (grandparent of my-task)
    expect(store.getState().rootId).toBe("section")
    // Cursor should be on the exact matched card
    expect(store.getState().cursorNodeId).toBe("my-task")
    expect(derivedState(store).selectionLevel).toBe("card")
    board.expect("#my-task[data-cursor]").toExist()
  })

  test("search from zoomed-in view navigates to correct card", () => {
    // User is zoomed into "projects" and searches for a task in a sub-project.
    // Structure: root > projects > project-a > taskA1, taskA2
    //                             > project-b > taskB1
    // User zooms to "projects" first, then searches for "taskA2".
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item("projects", item("project-a", item("taskA1"), item("taskA2")), item("project-b", item("taskB1"))),
        ),
      { checkIncremental: false },
    )

    // Zoom into "projects" first
    dispatchAndFlush(store, { type: "ZOOM_IN", nodeId: "projects" })
    expect(store.getState().rootId).toBe("projects")

    // Now search for taskA2
    board.press("/")
    for (const ch of "taskA2") board.press(ch)
    board.press("Enter")

    // Should select taskA2 in the current view (it's a grandchild of "projects")
    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(store.getState().rootId).toBe("projects") // No zoom needed
    expect(store.getState().cursorNodeId).toBe("taskA2")
    expect(derivedState(store).selectionLevel).toBe("card")
    board.expect("#taskA2[data-cursor]").toExist()
  })

  test("search with multiple results selects the first match", () => {
    // When search returns multiple results, pressing Enter selects the first one.
    const { board, store } = testEnv(
      () => item("root", item("col1", item("alpha-task"), item("beta-task")), item("col2", item("alpha-note"))),
      { checkIncremental: false },
    )

    board.press("/")
    for (const ch of "alpha") board.press(ch)
    board.press("Enter")

    // First result should be selected (order depends on repo.search)
    expect(store.getState().ui.showSearchDialog).toBe(false)
    const cursorId = store.getState().cursorNodeId
    // Either alpha-task or alpha-note — both are valid first matches
    expect(cursorId === "alpha-task" || cursorId === "alpha-note").toBe(true)
    expect(derivedState(store).selectionLevel).toBe("card")
  })

  test("search for oi file node (non-folder) selects it correctly", () => {
    // oi nodes with fstype="file" are NOT skipped by search.
    // When selected, they may be at column level or card level.
    const fileNode: KNode = {
      id: "readme-file",
      type: "oi",
      fstype: "file",
      content: "README",
      data: { name: "README" },
      parent_id: "docs",
      parent_idx: 0,
      link_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const { board, store } = testEnv(
      () => {
        const nodes = item("root", item("docs", item("other-file")))
        // Insert the file node as child of docs
        nodes.push(fileNode)
        return nodes
      },
      { checkIncremental: false },
    )

    board.press("/")
    for (const ch of "README") board.press(ch)
    board.press("Enter")

    expect(store.getState().ui.showSearchDialog).toBe(false)
    // README file is a grandchild of root → SELECT
    expect(store.getState().cursorNodeId).toBe("readme-file")
  })

  test("search SELECT within same column updates selectedNode correctly", () => {
    // When cursor is already on a card in col1 and search selects a different
    // card in the same column, selectedNode should update to the new card.
    // This tests the cursorPosition memo dependency chain.
    const { board, store } = testEnv(
      () => item("root", item("col1", item("taskA"), item("taskB"), item("taskC")), item("col2", item("taskD"))),
      { checkIncremental: false },
    )

    // Initial cursor is on taskA (first card of first column)
    expect(store.getState().cursorNodeId).toBe("taskA")

    // Search for taskC (different card in the same column)
    board.press("/")
    for (const ch of "taskC") board.press(ch)
    board.press("Enter")

    // Cursor should be on taskC
    expect(store.getState().cursorNodeId).toBe("taskC")
    board.expect("#taskC[data-cursor]").toExist()
    // Previous cursor should NOT have data-cursor
    board.expect("#taskA[data-cursor]").not.toExist()

    // selectedNode should be taskC (tests the Board's derived state)
    expect(derivedState(store).selectedNode?.id).toBe("taskC")
  })

  test("search + Enter + j/k navigation works after search", () => {
    // Structure: root > projects > project-a > taskA1, taskA2, taskA3
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item(
            "projects",
            item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
            item("project-b", item("taskB1")),
          ),
        ),
      { checkIncremental: false },
    )

    // Search and select taskA2
    board.press("/")
    for (const ch of "taskA2") board.press(ch)
    board.press("Enter")

    expect(store.getState().cursorNodeId).toBe("taskA2")

    // j/k should work from the search result position
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("taskA3")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("taskA2")

    board.press("k")
    expect(store.getState().cursorNodeId).toBe("taskA1")
  })

  test("search selects correct card when target is oi task under oi section (Asana-like)", () => {
    // Asana import structure: all nodes are oi
    // Project (oi) > Section (oi) > Task A (oi), Task B (oi)
    // User views Project, searches for Task B — cursor should land on Task B card
    const { board, store } = testEnv(
      () => item("project", item("section", item("task-alpha"), item("task-beta"), item("task-gamma"))),
      { checkIncremental: false },
    )

    expect(store.getState().rootId).toBe("project")

    board.press("/")
    for (const ch of "task-beta") board.press(ch)
    board.press("Enter")

    expect(store.getState().ui.showSearchDialog).toBe(false)
    expect(store.getState().cursorNodeId).toBe("task-beta")
    expect(derivedState(store).selectionLevel).toBe("card")
    board.expect("#task-beta[data-cursor]").toExist()
    // selectedNode should be the searched card, not the section/column
    expect(derivedState(store).selectedNode?.id).toBe("task-beta")
  })

  test("search for oi subtask zooms correctly and lands cursor on subtask", () => {
    // Asana-like: Project > Section > Task > Subtask
    // User views Project, searches for Subtask — should zoom to Section,
    // making Task a column and Subtask a card.
    const { board, store } = testEnv(
      () => item("project", item("section", item("parent-task", item("my-subtask"), item("other-subtask")))),
      { checkIncremental: false },
    )

    expect(store.getState().rootId).toBe("project")

    board.press("/")
    for (const ch of "my-subtask") board.press(ch)
    board.press("Enter")

    expect(store.getState().ui.showSearchDialog).toBe(false)
    // Should zoom to section (grandparent of my-subtask)
    expect(store.getState().rootId).toBe("section")
    // Cursor should be on the subtask itself
    expect(store.getState().cursorNodeId).toBe("my-subtask")
    expect(derivedState(store).selectionLevel).toBe("card")
    board.expect("#my-subtask[data-cursor]").toExist()
    // selectedNode should be the subtask, not the parent task
    expect(derivedState(store).selectedNode?.id).toBe("my-subtask")
  })

  test("search selectedNode matches cursorNodeId after same-column SELECT", () => {
    // Regression: when search SELECTs a card in the same column,
    // selectedNode should update to the new card (not stay on the old one).
    // This verifies the store's selectedNode is consistent with cursorNodeId.
    const { board, store } = testEnv(() => item("root", item("col", item("first"), item("second"), item("third"))), {
      checkIncremental: false,
    })

    // Initial cursor on first
    expect(store.getState().cursorNodeId).toBe("first")
    expect(derivedState(store).selectedNode?.id).toBe("first")

    // Search for third (same column, different card)
    board.press("/")
    for (const ch of "third") board.press(ch)
    board.press("Enter")

    expect(store.getState().cursorNodeId).toBe("third")
    // Key assertion: selectedNode must match cursorNodeId
    expect(derivedState(store).selectedNode?.id).toBe("third")
    board.expect("#third[data-cursor]").toExist()
  })
})
