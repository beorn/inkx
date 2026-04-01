/**
 * Board Slow Tests - Integration tests using createFakeRepo test double
 * Run with: bun run test:all (includes slow tests)
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { createEmptyState, initBoardState, buildBoardState, getNodeDisplayName } from "../src/state.ts"
import { renderCard } from "../src/render.ts"
import { testEnv, item } from "./helpers/board-test.ts"

describe("State", () => {
  test("buildBoardState creates columns from children", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })
    const state = buildBoardState(repo, "board")
    expect(state.rootId).toBe("board")
    expect(state.columns).toHaveLength(2)
    expect(state.columns[0]?.cardNodes).toHaveLength(2)
    expect(state.columns[1]?.cardNodes).toHaveLength(1)
  })

  test("initBoardState builds state from repo root", () => {
    const nodes = item.root("repo-root", item.folder("Projects"), item.folder("Archive"))
    const repo = createFakeRepo({ nodes })
    const state = initBoardState(repo, "repo-root")
    expect(state).not.toBeNull()
    expect(state!.rootId).toBe("repo-root")
    expect(state!.columns).toHaveLength(2)
  })

  test("initBoardState handles nested folders", () => {
    const nodes = item.root(
      "repo-root",
      item.folder("ref", item.folder("Projects"), item.folder("Archive"), item.folder("Work")),
    )
    const repo = createFakeRepo({ nodes })
    const state = initBoardState(repo, "ref")
    expect(state).not.toBeNull()
    expect(state!.rootId).toBe("ref")
    expect(state!.columns).toHaveLength(3)
    const cardNames = state!.columns.map((c) => c.node.content || c.node.data?.name)
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
    expect(state.columns[0]!.cardNodes).toHaveLength(1)
    expect(state.columns[0]!.cardNodes[0]!.type).toBe("p")
    expect(state.columns[1]!.node.type).toBe("h")
    expect(state.columns[2]!.node.type).toBe("h")
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
    // Each body node is its own navigable card
    expect(state.columns[0]!.cardNodes).toHaveLength(2)
    expect(state.columns[1]!.node.id).toBe("Getting Started")
  })
})

describe("Render", () => {
  test("Board renders columns and cards", () => {
    const { board } = testEnv(() => item("board", item("Todo", item.task("Task 1")), item("Done")))
    const text = board.screenshot()
    expect(text).toContain("Todo")
    expect(text).toContain("Done")
    expect(text).toContain("Task 1")
  })

  test("Board handles empty board", () => {
    const { board } = testEnv(() => item("board"))
    const text = board.screenshot()
    expect(text).toContain("Empty board")
  })

  test("renderCard includes content", () => {
    const repo = createFakeRepo()
    const card: KNode = {
      id: "test-card",
      type: "p",
      item: {},
      list_marker: "-",
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      content: "My Test Task",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const output = renderCard(repo, card, 40, false, false, false)
    expect(output).toContain("My Test Task")
  })

  test("renderCard shows children when not folded", () => {
    const repo = createFakeRepo({
      nodes: [
        {
          id: "test-card",
          type: "p",
          item: {},
          list_marker: "-",
          parent_id: null,
          parent_idx: 0,
          embed_source: null,
          content: "Parent Task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        {
          id: "child-1",
          type: "p",
          item: {},
          list_marker: "-",
          parent_id: "test-card",
          parent_idx: 0,
          embed_source: null,
          content: "Child Task 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    })
    const card = repo.getNode("test-card")!
    const output = renderCard(repo, card, 40, false, false, false)
    expect(output).toContain("Child Task 1")
  })

  test("renderCard shows item count when folded", () => {
    const repo = createFakeRepo({
      nodes: [
        {
          id: "test-card",
          type: "p",
          item: {},
          list_marker: "-",
          parent_id: null,
          parent_idx: 0,
          embed_source: null,
          content: "Parent Task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        {
          id: "child-1",
          type: "p",
          item: {},
          list_marker: "-",
          parent_id: "test-card",
          parent_idx: 0,
          embed_source: null,
          content: "Child 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        {
          id: "child-2",
          type: "p",
          item: {},
          list_marker: "-",
          parent_id: "test-card",
          parent_idx: 1,
          embed_source: null,
          content: "Child 2",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    })
    const card = repo.getNode("test-card")!
    const output = renderCard(repo, card, 40, false, false, true)
    expect(output).toContain("\u25b8 2")
    expect(output).not.toContain("Child 1")
  })
})

// =============================================================================
// Console toggle (Bug: backtick doesn't work due to stale pause/resume refs)
// =============================================================================

describe("Console toggle", () => {
  test("backtick sets showConsole to true", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    // Initially console is hidden
    expect(store.getState().ui.showConsole).toBe(false)

    // Press backtick to toggle console
    board.press("`")

    // showConsole should be true
    expect(store.getState().ui.showConsole).toBe(true)

    // Press backtick again to toggle back
    board.press("`")
    expect(store.getState().ui.showConsole).toBe(false)
  })
})
