/**
 * Skeleton loading — per-column skeleton for empty columns during background parse.
 *
 * When ui.isLoading is true and a column has 0 cards, that column shows skeleton
 * placeholder cards (░ chars) instead of "(empty)". Columns that already have
 * cards show their real content — the board is always interactive.
 *
 * This implements the discoverOnly fast-render model:
 * 1. Column headers appear immediately (files discovered but not parsed)
 * 2. Empty columns show skeleton cards while background parse runs
 * 3. As each file is parsed, its column gets real cards; skeleton disappears
 * 4. User can navigate between columns the whole time
 */

import { describe, test, expect } from "vitest"
import { act } from "react"
import type { KNode } from "@km/core"
import { item, testEnv } from "/Users/beorn/Code/pim/km/apps/km-tui/tests/helpers/board-test.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"

/** Derive layout from store state on demand. */
function derivedState(store: StoreApi<BoardAppStore>) {
  const s = store.getState()
  const board = getActiveBoardPane(s)
  const rootId = board?.rootId ?? null
  const foldDepths = board?.foldDepths ?? new Map<string, number>()
  const cursorId = (board?.sel.node.cursor() as string | null) ?? null
  const columns = deriveColumnsFromRepo(s.repo, rootId, foldDepths)
  const nodeIndex = buildNodeIndex(columns)
  const cursor = deriveCursorIndices(columns, cursorId, nodeIndex)
  const cursorDepth: "board" | "column" | "card" =
    cursor.colIndex === -1 ? "board" : cursor.cardIndex === -1 ? "column" : "card"
  return {
    columns,
    colIndex: cursor.colIndex,
    cardIndex: cursor.cardIndex,
    nodeIndex,
    cursorDepth,
  }
}

/**
 * Helper: create an empty column node (oi/folder type) with no card children.
 * item() creates "p" when no children — we need "h" for it to be treated as a column.
 */
function emptyColumn(id: string): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "folder",
    content: undefined,
    data: { name: id },
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

describe("Skeleton loading", () => {
  test("board renders normal content when isLoading is false", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("Task Alpha")), item("col2", item("Task Beta"))),
    )

    expect(store.getState().ui.isLoading).toBe(false)

    const text = board.screenshot()
    expect(text).toContain("Task Alpha")
    expect(text).toContain("Task Beta")
  })

  test("board stays interactive when isLoading is true (no global skeleton block)", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("Task Alpha")), item("col2", item("Task Beta"))),
    )

    // Verify normal content first
    expect(board.screenshot()).toContain("Task Alpha")

    // Set loading state and flush React
    act(() => {
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }))
    })
    board.press("F20")

    // Board still shows card content — columns with cards are unaffected by isLoading
    const text = board.screenshot()
    expect(text).toContain("Task Alpha")
    expect(text).toContain("Task Beta")
  })

  test("empty columns show skeleton cards when isLoading is true", () => {
    // Simulate discoverOnly: empty oi/folder columns (headers visible, no cards yet)
    const { board, store } = testEnv(() => {
      const colA = emptyColumn("col-empty-a")
      const colB = emptyColumn("col-empty-b")
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      colA.parent_id = "board"
      colA.parent_idx = 0
      colB.parent_id = "board"
      colB.parent_idx = 1
      return [boardNode, colA, colB]
    })

    // Without loading (watcher idle, no background parse), empty columns show "(empty)"
    act(() => {
      store.setState((s) => ({
        ...s,
        ui: { ...s.ui, watcherStatus: { state: "idle", pendingPaths: 0 } },
      }))
    })
    board.press("F20")
    expect(store.getState().ui.isLoading).toBe(false)
    expect(board.screenshot()).toContain("(empty)")

    // Set loading state
    act(() => {
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }))
    })
    board.press("F20")

    const text = board.screenshot()
    // Empty columns now show skeleton placeholder blocks
    expect(text).toContain("░")
    // "(empty)" text is replaced by skeleton
    expect(text).not.toContain("(empty)")
  })

  test("empty columns show skeleton during initial load (watcherStatus null)", () => {
    // Before any watcher events arrive, watcherStatus is null.
    // Empty columns should show skeleton, not "(empty)".
    const { board, store } = testEnv(() => {
      const colA = emptyColumn("col-empty-a")
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      colA.parent_id = "board"
      colA.parent_idx = 0
      return [boardNode, colA]
    })

    // watcherStatus starts as null (no events received yet)
    expect(store.getState().ui.watcherStatus).toBeNull()
    expect(store.getState().ui.isLoading).toBe(false)

    const text = board.screenshot()
    // Should show skeleton, not "(empty)", during initial load
    expect(text).toContain("░")
    expect(text).not.toContain("(empty)")
  })

  test("empty columns show skeleton when backgroundParsing is true", () => {
    const { board, store } = testEnv(() => {
      const colA = emptyColumn("col-empty-a")
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      colA.parent_id = "board"
      colA.parent_idx = 0
      return [boardNode, colA]
    })

    // Simulate: watcher has gone idle but background parsing is still running
    act(() => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          isLoading: false,
          backgroundParsing: true,
          watcherStatus: { state: "idle", pendingPaths: 0 },
        },
      }))
    })
    board.press("F20")

    const text = board.screenshot()
    // backgroundParsing keeps skeleton visible even though watcher is idle
    expect(text).toContain("░")
    expect(text).not.toContain("(empty)")
  })

  test("skeleton persists during background parse even when watcher goes idle", () => {
    // Simulates the race condition: watcher completes its initial scan (idle)
    // while background deferred-file parsing is still running.
    const { board, store } = testEnv(() => {
      const colA = emptyColumn("col-empty-a")
      const colB = emptyColumn("col-empty-b")
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      colA.parent_id = "board"
      colA.parent_idx = 0
      colB.parent_id = "board"
      colB.parent_idx = 1
      return [boardNode, colA, colB]
    })

    // Step 1: Background parse starts
    act(() => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          isLoading: true,
          backgroundParsing: true,
          loadingStartTime: Date.now(),
          watcherStatus: { state: "syncing", pendingPaths: 5 },
        },
      }))
    })
    board.press("F20")
    expect(board.screenshot()).toContain("░")

    // Step 2: Watcher completes initial scan, goes idle — but background parse continues
    act(() => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          isLoading: false, // watcher handler would set this to false
          // backgroundParsing remains true
          watcherStatus: { state: "idle", pendingPaths: 0 },
        },
      }))
    })
    board.press("F20")

    // Skeleton should STILL show because backgroundParsing is true
    const text = board.screenshot()
    expect(text).toContain("░")
    expect(text).not.toContain("(empty)")

    // Step 3: Background parse finishes
    act(() => {
      store.setState((s) => ({
        ...s,
        ui: { ...s.ui, backgroundParsing: false },
      }))
    })
    board.press("F20")

    // Now (empty) should show since everything is done and columns have no content
    expect(board.screenshot()).toContain("(empty)")
  })

  test("skeleton clears from empty column when isLoading is cleared", () => {
    const { board, store, repo } = testEnv(() => {
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      const col1 = emptyColumn("col1")
      col1.parent_id = "board"
      col1.parent_idx = 0
      return [
        boardNode,
        col1,
        ...item("col2", item("Task Beta")).map((n, i) => {
          if (i === 0) {
            n.parent_id = "board"
            n.parent_idx = 1
          }
          return n
        }),
      ]
    })

    // col1 is empty — with isLoading true, shows skeleton
    act(() => {
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }))
    })
    board.press("F20")
    expect(board.screenshot()).toContain("░")

    // Background parse completes: add card to col1, clear isLoading
    act(() => {
      repo.addNode("col1", { content: "Parsed Task A1", type: "p", item: {} })
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: false, loadingStartTime: null } }))
    })
    board.press("F20")

    const text = board.screenshot()
    // Skeleton gone, real content visible
    expect(text).toContain("Parsed Task A1")
    expect(text).toContain("Task Beta")
  })

  test("cursor survives skeleton load cycle: navigate during loading, position preserved after", () => {
    // Simulate discoverOnly mode: some columns have stub cards, one is empty (not yet parsed)
    const { board, store, repo } = testEnv(() => {
      const boardNode: KNode = {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      }
      const col1Nodes = item("col1", item("stub-a1"), item("stub-a2"))
      const col2Nodes = item("col2", item("stub-b1"), item("stub-b2"))
      const col3 = emptyColumn("col3") // empty — will show skeleton when isLoading

      col1Nodes[0]!.parent_id = "board"
      col1Nodes[0]!.parent_idx = 0
      col2Nodes[0]!.parent_id = "board"
      col2Nodes[0]!.parent_idx = 1
      col3.parent_id = "board"
      col3.parent_idx = 2

      return [boardNode, ...col1Nodes, ...col2Nodes, col3]
    })

    // Confirm initial cursor is on col1's first card
    expect(derivedState(store).colIndex).toBe(0)
    expect(derivedState(store).cardIndex).toBe(0)
    expect(derivedState(store).cursorDepth).toBe("card")

    // Set loading (simulates watcher-status "syncing" event from background parse)
    act(() => {
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }))
    })
    board.press("F20")

    // Board is still interactive — navigate right to col2
    board.press("l")
    expect(derivedState(store).colIndex).toBe(1)

    // Navigate right to col3 (empty column, shows skeleton)
    board.press("l")
    expect(derivedState(store).colIndex).toBe(2)

    // col3 shows skeleton since it's empty and isLoading is true
    expect(board.screenshot()).toContain("░")

    // Clear loading (simulates watcher-status "ready" event)
    act(() => {
      store.setState((s) => ({ ...s, ui: { ...s.ui, isLoading: false, loadingStartTime: null } }))
    })
    board.press("F20")

    // Cursor should still be on col3, not reset
    const afterClear = derivedState(store)
    expect(afterClear.cursorDepth).not.toBe("board")
    expect(afterClear.colIndex).toBe(2)
    expect(board.screenshot()).toContain("col3")

    // Simulate background parse completing: add parsed content to col3
    act(() => {
      repo.addNode("col3", { content: "Parsed Task C1", type: "p", item: {} })
      repo.addNode("col3", { content: "Parsed Task C2", type: "p", item: {} })
    })
    board.press("F20")

    // Cursor should still be on col3 after repo data update
    const afterTouch = derivedState(store)
    expect(afterTouch.cursorDepth).not.toBe("board")
    expect(afterTouch.colIndex).toBe(2)
    // New cards visible after parse
    expect(board.screenshot()).toContain("Parsed Task C2")
  })
})
