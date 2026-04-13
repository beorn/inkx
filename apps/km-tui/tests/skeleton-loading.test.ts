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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"

/** Derive layout from app's store state on demand. */
function derivedState(app: ReturnType<typeof createTestApp>) {
  return app.withStore((s) => {
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
  })
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
    embed_of: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

describe("Skeleton loading", () => {
  test("board renders normal content when isLoading is false", () => {
    using app = createTestApp(item("board", item("col1", item("Task Alpha")), item("col2", item("Task Beta"))))

    app.withStore((s) => {
      expect(s.ui.isLoading).toBe(false)
    })

    expect(app.text).toContain("Task Alpha")
    expect(app.text).toContain("Task Beta")
  })

  test("board stays interactive when isLoading is true (no global skeleton block)", () => {
    using app = createTestApp(item("board", item("col1", item("Task Alpha")), item("col2", item("Task Beta"))))

    // Verify normal content first
    expect(app.text).toContain("Task Alpha")

    // Set loading state and flush React
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Board still shows card content — columns with cards are unaffected by isLoading
    expect(app.text).toContain("Task Alpha")
    expect(app.text).toContain("Task Beta")
  })

  test("empty columns show skeleton cards when isLoading is true", () => {
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
      embed_of: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    colA.parent_id = "board"
    colA.parent_idx = 0
    colB.parent_id = "board"
    colB.parent_idx = 1

    using app = createTestApp([boardNode, colA, colB])

    // Without loading (watcher idle, no background parse), empty columns show "(empty)"
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({
            ...s,
            ui: { ...s.ui, watcherStatus: { state: "idle", pendingPaths: 0 } },
          }) as BoardAppStore,
      )
    })
    app.press("F20")
    app.withStore((s) => {
      expect(s.ui.isLoading).toBe(false)
    })
    expect(app.text).toContain("(empty)")

    // Set loading state
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Empty columns now show skeleton placeholder blocks
    expect(app.text).toContain("░")
    // "(empty)" text is replaced by skeleton
    expect(app.text).not.toContain("(empty)")
  })

  test("empty columns show skeleton during initial load (watcherStatus null)", () => {
    // Before any watcher events arrive, watcherStatus is null.
    // Empty columns should show skeleton, not "(empty)".
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
      embed_of: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    colA.parent_id = "board"
    colA.parent_idx = 0

    using app = createTestApp([boardNode, colA])

    // watcherStatus starts as null (no events received yet)
    app.withStore((s) => {
      expect(s.ui.watcherStatus).toBeNull()
      expect(s.ui.isLoading).toBe(false)
    })

    // Should show skeleton, not "(empty)", during initial load
    expect(app.text).toContain("░")
    expect(app.text).not.toContain("(empty)")
  })

  test("empty columns show skeleton when backgroundParsing is true", () => {
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
      embed_of: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    colA.parent_id = "board"
    colA.parent_idx = 0

    using app = createTestApp([boardNode, colA])

    // Simulate: watcher has gone idle but background parsing is still running
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({
            ...s,
            ui: {
              ...s.ui,
              isLoading: false,
              backgroundParsing: true,
              watcherStatus: { state: "idle", pendingPaths: 0 },
            },
          }) as BoardAppStore,
      )
    })
    app.press("F20")

    // backgroundParsing keeps skeleton visible even though watcher is idle
    expect(app.text).toContain("░")
    expect(app.text).not.toContain("(empty)")
  })

  test("skeleton persists during background parse even when watcher goes idle", () => {
    // Simulates the race condition: watcher completes its initial scan (idle)
    // while background deferred-file parsing is still running.
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
      embed_of: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    colA.parent_id = "board"
    colA.parent_idx = 0
    colB.parent_id = "board"
    colB.parent_idx = 1

    using app = createTestApp([boardNode, colA, colB])

    // Step 1: Background parse starts
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({
            ...s,
            ui: {
              ...s.ui,
              isLoading: true,
              backgroundParsing: true,
              loadingStartTime: Date.now(),
              watcherStatus: { state: "syncing", pendingPaths: 5 },
            },
          }) as BoardAppStore,
      )
    })
    app.press("F20")
    expect(app.text).toContain("░")

    // Step 2: Watcher completes initial scan, goes idle — but background parse continues
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({
            ...s,
            ui: {
              ...s.ui,
              isLoading: false, // watcher handler would set this to false
              // backgroundParsing remains true
              watcherStatus: { state: "idle", pendingPaths: 0 },
            },
          }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Skeleton should STILL show because backgroundParsing is true
    expect(app.text).toContain("░")
    expect(app.text).not.toContain("(empty)")

    // Step 3: Background parse finishes
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({
            ...s,
            ui: { ...s.ui, backgroundParsing: false },
          }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Now (empty) should show since everything is done and columns have no content
    expect(app.text).toContain("(empty)")
  })

  test("skeleton clears from empty column when isLoading is cleared", () => {
    const boardNode: KNode = {
      id: "board",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "board", is_repo_root: true },
      parent_id: null,
      parent_idx: 0,
      embed_of: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const col1 = emptyColumn("col1")
    col1.parent_id = "board"
    col1.parent_idx = 0
    const col2Nodes = item("col2", item("Task Beta")).map((n, i) => {
      if (i === 0) {
        n.parent_id = "board"
        n.parent_idx = 1
      }
      return n
    })

    using app = createTestApp([boardNode, col1, ...col2Nodes])

    // col1 is empty — with isLoading true, shows skeleton
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }) as BoardAppStore,
      )
    })
    app.press("F20")
    expect(app.text).toContain("░")

    // Background parse completes: add card to col1, clear isLoading
    act(() => {
      app.repo.addNode("col1", { content: "Parsed Task A1", type: "p", item: {} })
      app.driver.store.setState(
        (s: BoardAppStore) => ({ ...s, ui: { ...s.ui, isLoading: false, loadingStartTime: null } }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Skeleton gone, real content visible
    expect(app.text).toContain("Parsed Task A1")
    expect(app.text).toContain("Task Beta")
  })

  test("cursor survives skeleton load cycle: navigate during loading, position preserved after", () => {
    // Simulate discoverOnly mode: some columns have stub cards, one is empty (not yet parsed)
    const boardNode: KNode = {
      id: "board",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "board", is_repo_root: true },
      parent_id: null,
      parent_idx: 0,
      embed_of: null,
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

    using app = createTestApp([boardNode, ...col1Nodes, ...col2Nodes, col3])

    // Confirm initial cursor is on col1's first card
    expect(derivedState(app).colIndex).toBe(0)
    expect(derivedState(app).cardIndex).toBe(0)
    expect(derivedState(app).cursorDepth).toBe("card")

    // Set loading (simulates watcher-status "syncing" event from background parse)
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) =>
          ({ ...s, ui: { ...s.ui, isLoading: true, loadingStartTime: Date.now() } }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Board is still interactive — navigate right to col2
    app.press("l")
    expect(derivedState(app).colIndex).toBe(1)

    // Navigate right to col3 (empty column, shows skeleton)
    app.press("l")
    expect(derivedState(app).colIndex).toBe(2)

    // col3 shows skeleton since it's empty and isLoading is true
    expect(app.text).toContain("░")

    // Clear loading (simulates watcher-status "ready" event)
    act(() => {
      app.driver.store.setState(
        (s: BoardAppStore) => ({ ...s, ui: { ...s.ui, isLoading: false, loadingStartTime: null } }) as BoardAppStore,
      )
    })
    app.press("F20")

    // Cursor should still be on col3, not reset
    const afterClear = derivedState(app)
    expect(afterClear.cursorDepth).not.toBe("board")
    expect(afterClear.colIndex).toBe(2)
    expect(app.text).toContain("col3")

    // Simulate background parse completing: add parsed content to col3
    act(() => {
      app.repo.addNode("col3", { content: "Parsed Task C1", type: "p", item: {} })
      app.repo.addNode("col3", { content: "Parsed Task C2", type: "p", item: {} })
    })
    app.press("F20")

    // Cursor should still be on col3 after repo data update
    const afterTouch = derivedState(app)
    expect(afterTouch.cursorDepth).not.toBe("board")
    expect(afterTouch.colIndex).toBe(2)
    // New cards visible after parse
    expect(app.text).toContain("Parsed Task C2")
  })
})
