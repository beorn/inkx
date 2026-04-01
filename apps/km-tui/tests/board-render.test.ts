/**
 * Board Render Tests (Pure Data)
 *
 * Fast tests for rendering functions that work with pure data - no database required.
 * These tests run in parallel and are much faster than tests requiring SQLite setup.
 *
 * Also includes useChildren hook tests (from use-children.test.ts).
 */

import React, { act } from "react"
import { describe, test, it, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"

import { createEmptyState } from "../src/state.ts"
import { renderCard, renderStatusBar, renderHelp, renderStatusIcon } from "../src/render.ts"
import { useChildren } from "../src/hooks/use-children.ts"
import { createCardNode } from "./fixtures/board-fixtures.ts"
import { item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import type { Repo } from "@km/storage"

// Minimal mock repo for pure rendering tests - only needs getChildren for display name
function createMockRepo(childrenMap?: Map<string, KNode[]>): Repo {
  return {
    getChildren: (id: string) => childrenMap?.get(id) ?? [],
  } as unknown as Repo
}

describe("Board Pure Rendering", () => {
  test("renderStatusBar shows keybinding hints", () => {
    const state = createEmptyState()
    const output = renderStatusBar(state, 80)
    expect(output).toContain("h/l:cols")
    expect(output).toContain("j/k:cards")
  })

  test("renderHelp contains keybindings", () => {
    const output = renderHelp(80)
    expect(output).toContain("Navigation")
    expect(output).toContain("h / Ctrl+B")
    expect(output).toContain("Move to left column")
  })

  test("renderStatusIcon returns correct icons (width-1 style)", () => {
    expect(renderStatusIcon("todo")).toContain("□") // white square
    expect(renderStatusIcon("wip")).toContain("□") // white square (yellow)
    expect(renderStatusIcon("blocked")).toContain("✗") // ballot X (red)
    expect(renderStatusIcon("done")).toContain("✓") // check mark (green)
    expect(renderStatusIcon("dropped")).toContain("✗") // ballot X (gray)
    // undefined/null status shows red warning triangle
    expect(renderStatusIcon(undefined)).toContain("⚠")
  })

  test("renderCard includes content", () => {
    const repo = createMockRepo()
    const card: KNode = {
      id: "test-card",
      type: "p",
      item: { list: "-" },
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
    const childNode: KNode = {
      id: "child-1",
      type: "p",
      item: { list: "-" },
      parent_id: "test-card",
      parent_idx: 0,
      embed_source: null,
      content: "Child Task 1",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const childrenMap = new Map([["test-card", [childNode]]])
    const repo = createMockRepo(childrenMap)
    const card: KNode = {
      id: "test-card",
      type: "p",
      item: { list: "-" },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      content: "Parent Task",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    const output = renderCard(repo, card, 40, false, false, false)
    expect(output).toContain("Child Task 1")
  })

  test("renderCard shows item count when folded", () => {
    const child1: KNode = {
      id: "child-1",
      type: "p",
      item: { list: "-" },
      parent_id: "test-card",
      parent_idx: 0,
      embed_source: null,
      content: "Child 1",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const child2: KNode = {
      id: "child-2",
      type: "p",
      item: { list: "-" },
      parent_id: "test-card",
      parent_idx: 1,
      embed_source: null,
      content: "Child 2",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const childrenMap = new Map([["test-card", [child1, child2]]])
    const repo = createMockRepo(childrenMap)
    const card: KNode = {
      id: "test-card",
      type: "p",
      item: { list: "-" },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      content: "Parent Task",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    const output = renderCard(repo, card, 40, false, false, true)
    expect(output).toContain("▸ 2") // Collapsed indicator with count
    expect(output).not.toContain("Child 1")
  })

  test("renderCard using fixture helper", () => {
    const repo = createMockRepo()
    // createCardNode returns KNode directly
    const card = createCardNode({
      content: "Fixture Card",
      type: "p",
      item: {},
    })

    const output = renderCard(repo, card, 40, false, false, false)
    expect(output).toContain("Fixture Card")
  })
})

// =============================================================================
// useChildren hook — from use-children.test.ts
// =============================================================================

/** Simple wrapper component that renders children IDs for assertion */
function ChildrenDisplay({ repo, parentId }: { repo: Parameters<typeof useChildren>[0]; parentId: string | null }) {
  const children = useChildren(repo, parentId)
  return React.createElement(Text, null, children.map((c) => c.id).join(","))
}

const render = createRenderer()

describe("useChildren", () => {
  it("returns children of a parent node", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })

    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: "col1" }))

    expect(app.text).toContain("1a,1b")
  })

  it("returns empty array for leaf node", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: "task1" }))

    // Leaf node has no children — empty string from join
    expect(app.text).toBe("")
  })

  it("returns root children when parentId is null", () => {
    const nodes = item("board", item("col1"), item("col2"))
    const repo = createFakeRepo({ nodes })

    // "board" has parent_id: null, so getChildren(null) returns [board]
    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: null }))

    expect(app.text).toContain("board")
  })

  it("updates when repo is mutated", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const el = React.createElement(ChildrenDisplay, {
      repo,
      parentId: "col1",
    })
    const app = render(el)

    expect(app.text).toBe("task1")

    // Mutate and trigger re-render via rerender
    repo.addNode("col1", { type: "p", item: {}, content: "task2" })
    act(() => {
      app.rerender(el)
    })

    // Should now show both children (task1 + the new fake-1 id)
    expect(app.text).toContain("task1")
    expect(app.text).toContain("fake-1")
  })
})
