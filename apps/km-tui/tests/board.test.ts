/**
 * Board Slow Tests - Integration tests using createFakeRepo test double
 * Run with: bun run test:all (includes slow tests)
 */

/* eslint-disable @typescript-eslint/no-unsafe-call -- Vitest test functions return any */

import { describe, test, expect } from "vitest"
import { createTestRenderer } from "inkx/testing"
const render = createTestRenderer()
import React from "react"
import { createFakeRepo } from "@km/storage"
import type { Repo } from "@km/storage"
import type { KNode, NodeType } from "@km/core"
import {
  createEmptyState,
  initBoardState,
  buildBoardState,
  getNodeDisplayName,
} from "../src/state.ts"
import { renderBoardStatic, renderCard } from "../src/render.ts"
import type { CardState } from "../src/types.ts"
import { BoardCore } from "../src/views/Board.tsx"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { RepoProvider } from "../src/repo-context.tsx"
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
    dispatch: () => {},
    dialogHandlers: {
      handleProjectSelect: () => {},
      handleProjectCancel: () => {},
      handleNewItemCreate: () => {},
      handleNewItemCancel: () => {},
      handleSearchSelect: () => {},
      handleSearchCancel: () => {},
    },
    moveMode: false,
  })
  return React.createElement(RepoProvider, {
    repo,
    children: boardCoreElement,
  })
}

function makeNode(
  id: string,
  type: NodeType,
  content: string | undefined,
  parentId: string | null,
  parentIdx: number,
  extra?: Partial<KNode>,
): KNode {
  const now = Date.now()
  return {
    id,
    type,
    parent_id: parentId,
    parent_idx: parentIdx,
    link_to: null,
    content,
    data: {},
    created_at: now,
    updated_at: now,
    version: "v1",
    ...extra,
  }
}

describe.serial("State", () => {
  test("buildBoardState creates columns from children", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "board", "Test Board", null, 0),
        makeNode("col1", "folder", "Column 1", "root", 0),
        makeNode("col2", "folder", "Column 2", "root", 1),
        makeNode("card1", "task", "Card 1.1", "col1", 0),
        makeNode("card2", "task", "Card 1.2", "col1", 1),
        makeNode("card3", "task", "Card 2.1", "col2", 0),
      ],
    })
    const state = buildBoardState(repo, "root")
    expect(state.rootId).toBe("root")
    expect(state.columns).toHaveLength(2)
    expect(state.columns[0]?.cards).toHaveLength(2)
    expect(state.columns[1]?.cards).toHaveLength(1)
  })

  test("initBoardState groups root nodes by name", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("proj1", "folder", "Projects", null, 0),
        makeNode("proj2", "folder", "Projects", null, 1),
        makeNode("arch", "folder", "Archive", null, 2),
      ],
    })
    const state = initBoardState(repo)
    expect(state).not.toBeNull()
    expect(state!.rootId).toBeNull()
    expect(state!.columns).toHaveLength(2)
  })

  test("initBoardState deduplicates cards by name within grouped columns", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("ref1", "folder", "ref", null, 0),
        makeNode("ref2", "folder", "ref", null, 1),
        makeNode("ref3", "folder", "ref", null, 2),
        makeNode("p1", "folder", "Projects", "ref1", 0),
        makeNode("p2", "folder", "Projects", "ref2", 0),
        makeNode("p3", "folder", "Projects", "ref3", 0),
        makeNode("a1", "folder", "Archive", "ref1", 1),
        makeNode("w1", "folder", "Work", "ref2", 1),
      ],
    })
    const state = initBoardState(repo)
    expect(state).not.toBeNull()
    expect(state!.columns).toHaveLength(1)
    const cardNames = state!.columns[0]!.cards.map(
      (c) => c.node.content || c.node.data?.name,
    )
    const uniqueNames = new Set(cardNames)
    expect(uniqueNames.size).toBe(3)
    expect(cardNames.length).toBe(3)
  })

  test("initBoardState returns null for empty database", () => {
    const repo = createFakeRepo({ nodes: [] })
    const state = initBoardState(repo)
    expect(state).toBeNull()
  })

  test("getNodeDisplayName returns content", () => {
    const repo = createFakeRepo({
      nodes: [makeNode("task1", "task", "Test Task", null, 0)],
    })
    const node = repo.getNode("task1")!
    expect(getNodeDisplayName(repo, node)).toBe("Test Task")
  })

  test("getNodeDisplayName returns data.name if present", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("folder1", "folder", undefined, null, 0, {
          data: { name: "My Folder" },
        }),
      ],
    })
    const node = repo.getNode("folder1")!
    expect(getNodeDisplayName(repo, node)).toBe("My Folder")
  })

  test("buildBoardState filters out paragraph nodes as columns (km-1tho)", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "file", "@issue.md", null, 0),
        makeNode(
          "para",
          "paragraph",
          "All issues tracked with the @issue tag.",
          "root",
          0,
        ),
        makeNode("col1", "section", "Open Issues", "root", 1),
        makeNode("col2", "section", "Closed Issues", "root", 2),
        makeNode("task1", "task", "Fix bug #1", "col1", 0),
        makeNode("task2", "task", "Fix bug #2", "col2", 0),
      ],
    })
    const state = buildBoardState(repo, "root")
    expect(state.columns).toHaveLength(3)
    expect(state.columns[0]!.isVirtual).toBe(true)
    expect(state.columns[0]!.cards).toHaveLength(1)
    expect(state.columns[0]!.cards[0]!.node.type).toBe("paragraph")
    expect(state.columns[1]!.node.type).toBe("section")
    expect(state.columns[2]!.node.type).toBe("section")
  })

  test("buildBoardState filters out code and quote nodes as columns", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("root", "file", "readme.md", null, 0),
        makeNode("code", "code", "const x = 1;", "root", 0),
        makeNode("quote", "quote", "Some quote text", "root", 1),
        makeNode("col", "section", "Getting Started", "root", 2),
        makeNode("task", "task", "Install dependencies", "col", 0),
      ],
    })
    const state = buildBoardState(repo, "root")
    expect(state.columns).toHaveLength(2)
    expect(state.columns[0]!.isVirtual).toBe(true)
    expect(state.columns[0]!.cards).toHaveLength(2)
    expect(state.columns[1]!.node.id).toBe("col")
  })
})

describe.serial("Render", () => {
  test("renderBoardStatic renders columns", () => {
    const repo = createFakeRepo({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col1", "folder", "Todo", "board", 0),
        makeNode("col2", "folder", "Done", "board", 1),
        makeNode("task1", "task", "Task 1", "col1", 0),
      ],
    })
    const state = buildBoardState(repo, "board")
    const output = renderBoardStatic(repo, state, 80)
    expect(output).toContain("Todo")
    expect(output).toContain("Done")
    expect(output).toContain("Task 1")
  })

  test("renderBoardStatic handles empty board", () => {
    const repo = createFakeRepo()
    const state = createEmptyState()
    const output = renderBoardStatic(repo, state, 80)
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
