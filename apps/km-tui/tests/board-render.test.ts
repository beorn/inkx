/**
 * Board Render Tests (Pure Data)
 *
 * Fast tests for rendering functions that work with pure data - no database required.
 * These tests run in parallel and are much faster than tests requiring SQLite setup.
 */

import { describe, test, expect } from "vitest"

import { createEmptyState } from "../src/state.ts"
import { renderCard, renderStatusBar, renderHelp, renderStatusIcon } from "../src/render.ts"
import { createCardNode } from "./fixtures/board-fixtures.ts"
import type { KNode } from "@km/core"
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
      type: "li",
      list_marker: "-",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
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
      type: "li",
      list_marker: "-",
      parent_id: "test-card",
      parent_idx: 0,
      link_to: null,
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
      type: "li",
      list_marker: "-",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
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
      type: "li",
      list_marker: "-",
      parent_id: "test-card",
      parent_idx: 0,
      link_to: null,
      content: "Child 1",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const child2: KNode = {
      id: "child-2",
      type: "li",
      list_marker: "-",
      parent_id: "test-card",
      parent_idx: 1,
      link_to: null,
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
      type: "li",
      list_marker: "-",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      content: "Parent Task",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }

    const output = renderCard(repo, card, 40, false, false, true)
    expect(output).toContain("▶ 2") // Collapsed indicator with count
    expect(output).not.toContain("Child 1")
  })

  test("renderCard using fixture helper", () => {
    const repo = createMockRepo()
    // createCardNode returns KNode directly
    const card = createCardNode({
      content: "Fixture Card",
      type: "li",
    })

    const output = renderCard(repo, card, 40, false, false, false)
    expect(output).toContain("Fixture Card")
  })
})
