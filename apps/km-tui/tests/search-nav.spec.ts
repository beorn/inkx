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

import { describe, test, expect } from "vitest"
import { act } from "react"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { findZoomTarget } from "../src/views/use-board-dialogs.ts"
import type { KNode } from "@km/core"
import { deriveColumnsFromRepo, buildNodeIndex } from "../src/hooks/use-columns.ts"
import { deriveCursorPosition } from "../src/hooks/use-cursor-position.ts"
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

  test("walks cursorTarget up to direct card when target is body-card descendant", () => {
    // BUG: findZoomTarget returns the raw target (subtask1) as cursorTarget,
    // but after zoom, subtask1 is a descendant of a body card. The navigation
    // layer then breaks because it resolves the card at the wrong depth.
    //
    // FIX: findZoomTarget should detect when the zoom target (grandparent)
    // has no oi children and walk cursorTarget up to a direct child that
    // would be visible as a card.
    const vaultNode = makeOiNode("vault", null, 0)
    const flatListNode = makeOiNode("flatList", "vault", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1", "subtask2"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [vaultNode, flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    const result = findZoomTarget(subtask1, repo)
    expect(result.zoomTarget.id).toBe("flatList")

    // After the fix, cursorTarget should be walked up to task1 (the body card
    // that contains subtask1), because flatList has no oi children and subtask1
    // would be a descendant of a body card, not a direct card.
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
    expect(state.selectionLevel).toBe("card")
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
    expect(store.getState().selectionLevel).toBe("card")

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
    expect(store.getState().selectionLevel).toBe("card")

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
