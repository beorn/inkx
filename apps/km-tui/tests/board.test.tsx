/**
 * Board Slow Tests - Integration tests using createFakeRepo test double
 * Run with: bun run test:all (includes slow tests)
 */

import { describe, test, expect } from "vitest"
import React from "react"
import { createFakeRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import {
  createEmptyState,
  initBoardState,
  buildBoardState,
  getNodeDisplayName,
} from "../src/state.ts"
import { renderCard } from "../src/render.ts"
import { renderStatic } from "inkx"
import { StoreContext } from "inkx/runtime"
import { createStore, type StoreApi } from "zustand"
import type { CardState } from "../src/types.ts"
import { BoardCore } from "../src/views/Board.tsx"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { TreeRenderProvider, deriveTreeConfig } from "../src/ui-context.tsx"
import type { TUIBoardState } from "../src/types.ts"
import { testEnv, item } from "./helpers/board-test.ts"

function renderBoardCore(
  state: TUIBoardState,
  repo: Repo,
  options: { width?: number; height?: number } = {},
) {
  const { width = 80, height = 24 } = options
  const boardCoreElement = React.createElement(BoardCore, {
    state,
    layout: {
      columns: state.columns,
      colIndex: 0,
      cardIndex: 0,
      subPath: [],
      isAtCardLevel: true,
      isInOutlineMode: false,
    },
    ui: createInitialUIState("cards", [], { columns: width, rows: height }),
    derivedSelectionLevel: "card" as const,
    dimensions: { columns: width, rows: height },
    layoutRegistry: createLayoutRegistry(),
    setUI: () => {},
    dialogHandlers: {
      handleProjectSelect: () => {},
      handleProjectCancel: () => {},
      handleNewItemCreate: () => {},
      handleNewItemCancel: () => {},
      handleSearchSelect: () => {},
      handleSearchCancel: () => {},
    },
    moveMode: false,
    colScrollOffset: 0,
  })
  // Wrap in StoreContext + TreeRenderProvider so TreeNode's hooks work
  const initialUI = createInitialUIState("cards", [], {
    columns: width,
    rows: height,
  })
  const store = createStore(() => ({
    foldedNodes: new Set<string>(),
    ui: initialUI,
    layoutRegistry: null,
    setUI: () => {},
  }))
  const treeConfig = deriveTreeConfig(initialUI)
  const wrappedElement = React.createElement(
    TreeRenderProvider,
    { treeConfig, setUI: () => {}, rootBoardId: null },
    boardCoreElement,
  )
  return React.createElement(
    StoreContext.Provider,
    { value: store as StoreApi<unknown> },
    React.createElement(RepoProvider, {
      repo,
      children: wrappedElement,
    }),
  )
}

describe("State", () => {
  test("buildBoardState creates columns from children", () => {
    const nodes = item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a")),
    )
    const repo = createFakeRepo({ nodes })
    const state = buildBoardState(repo, "board")
    expect(state.rootId).toBe("board")
    expect(state.columns).toHaveLength(2)
    expect(state.columns[0]?.cards).toHaveLength(2)
    expect(state.columns[1]?.cards).toHaveLength(1)
  })

  test("initBoardState builds state from repo root", () => {
    const nodes = item.root(
      "repo-root",
      item.folder("Projects"),
      item.folder("Archive"),
    )
    const repo = createFakeRepo({ nodes })
    const state = initBoardState(repo, "repo-root")
    expect(state).not.toBeNull()
    expect(state!.rootId).toBe("repo-root")
    expect(state!.columns).toHaveLength(2)
  })

  test("initBoardState handles nested folders", () => {
    const nodes = item.root(
      "repo-root",
      item.folder(
        "ref",
        item.folder("Projects"),
        item.folder("Archive"),
        item.folder("Work"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const state = initBoardState(repo, "ref")
    expect(state).not.toBeNull()
    expect(state!.rootId).toBe("ref")
    expect(state!.columns).toHaveLength(3)
    const cardNames = state!.columns.map(
      (c) => c.node.content || c.node.data?.name,
    )
    expect(cardNames).toEqual(["Projects", "Archive", "Work"])
  })

  test("initBoardState returns null for empty database", () => {
    const repo = createFakeRepo({ nodes: [] })
    const state = initBoardState(repo)
    expect(state).toBeNull()
  })

  test("getNodeDisplayName returns content", () => {
    const nodes = item.task("Test Task")
    const repo = createFakeRepo({ nodes })
    const node = repo.getNode("Test Task")!
    expect(getNodeDisplayName(repo, node)).toBe("Test Task")
  })

  test("getNodeDisplayName returns data.name if present", () => {
    const nodes = item.folder("My Folder", item("child"))
    const repo = createFakeRepo({ nodes })
    const node = repo.getNode("My Folder")!
    expect(getNodeDisplayName(repo, node)).toBe("My Folder")
  })

  test("buildBoardState filters out paragraph nodes as columns (km-1tho)", () => {
    const nodes = item.file(
      "@issue.md",
      item.paragraph("All issues tracked with the @issue tag."),
      item.section("Open Issues", item("Fix bug #1")),
      item.section("Closed Issues", item("Fix bug #2")),
    )
    const repo = createFakeRepo({ nodes })
    const state = buildBoardState(repo, "@issue.md")
    expect(state.columns).toHaveLength(3)
    expect(state.columns[0]!.isVirtual).toBe(true)
    expect(state.columns[0]!.cards).toHaveLength(1)
    expect(state.columns[0]!.cards[0]!.node.type).toBe("paragraph")
    expect(state.columns[1]!.node.type).toBe("section")
    expect(state.columns[2]!.node.type).toBe("section")
  })

  test("buildBoardState filters out code and quote nodes as columns", () => {
    const nodes = item.file(
      "readme.md",
      item.code("const x = 1;"),
      item.quote("Some quote text"),
      item.section("Getting Started", item("Install dependencies")),
    )
    const repo = createFakeRepo({ nodes })
    const state = buildBoardState(repo, "readme.md")
    expect(state.columns).toHaveLength(2)
    expect(state.columns[0]!.isVirtual).toBe(true)
    expect(state.columns[0]!.cards).toHaveLength(2)
    expect(state.columns[1]!.node.id).toBe("Getting Started")
  })
})

describe("Render", () => {
  test("BoardCore renders columns", async () => {
    // Build nodes using tree builder for cleaner fixture
    const nodes = item("board", item("Todo", item.task("Task 1")), item("Done"))
    const repo = createFakeRepo({ nodes })
    const state = buildBoardState(repo, "board")
    const element = renderBoardCore(state, repo, { width: 80, height: 24 })
    const output = await renderStatic(element, { width: 80 })
    expect(output).toContain("Todo")
    expect(output).toContain("Done")
    expect(output).toContain("Task 1")
  })

  test("BoardCore handles empty board", async () => {
    const repo = createFakeRepo()
    const state = createEmptyState()
    const element = renderBoardCore(state, repo, { width: 80, height: 24 })
    const output = await renderStatic(element, { width: 80 })
    expect(output).toContain("Empty board")
  })

  test("renderCard includes content", () => {
    const repo = createFakeRepo()
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "My Test Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [],
    }
    const output = renderCard(repo, cardState, 40, false, false, false)
    expect(output).toContain("My Test Task")
  })

  test("renderCard shows children when not folded", () => {
    const repo = createFakeRepo()
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "Parent Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [
        {
          id: "child-1",
          type: "task",
          parent_id: "test-card",
          parent_idx: 0,
          link_to: null,
          content: "Child Task 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    }
    const output = renderCard(repo, cardState, 40, false, false, false)
    expect(output).toContain("Child Task 1")
  })

  test("renderCard shows item count when folded", () => {
    const repo = createFakeRepo()
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "Parent Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [
        {
          id: "child-1",
          type: "task",
          parent_id: "test-card",
          parent_idx: 0,
          link_to: null,
          content: "Child 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        {
          id: "child-2",
          type: "task",
          parent_id: "test-card",
          parent_idx: 1,
          link_to: null,
          content: "Child 2",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    }
    const output = renderCard(repo, cardState, 40, false, false, true)
    expect(output).toContain("\u25b6 2")
    expect(output).not.toContain("Child 1")
  })
})
