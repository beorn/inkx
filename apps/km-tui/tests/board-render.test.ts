/**
 * Board Render Tests (Pure Data)
 *
 * Fast tests for rendering functions that work with pure data - no database required.
 * These tests run in parallel and are much faster than tests requiring SQLite setup.
 */

import { describe, test, expect } from "vitest"

import { createEmptyState } from "../src/state.ts"
import {
  renderCard,
  renderStatusBar,
  renderHelp,
  renderStatusIcon,
} from "../src/render.ts"
import { createCardState } from "./fixtures/board-fixtures.ts"
import type { CardState } from "../src/types.ts"
import type { Repo } from "@km/storage"

// Minimal mock repo for pure rendering tests - only needs getChildren for display name
function createMockRepo(): Repo {
  return {
    getChildren: () => [],
  } as unknown as Repo
}

describe("Board Pure Rendering", () => {
  test("renderStatusBar shows visual mode", () => {
    const state = createEmptyState()
    state.visualMode = true

    const output = renderStatusBar(state, 80)
    expect(output).toContain("VISUAL")
  })

  test("renderStatusBar shows selection count", () => {
    const state = createEmptyState()
    state.selectedCards.add("card-1")
    state.selectedCards.add("card-2")

    const output = renderStatusBar(state, 80)
    expect(output).toContain("2 selected")
  })

  test("renderHelp contains keybindings", () => {
    const output = renderHelp(80)
    expect(output).toContain("Navigation")
    expect(output).toContain("h / Ctrl+B")
    expect(output).toContain("Move to left column")
  })

  test("renderStatusIcon returns correct icons (ballot box style)", () => {
    expect(renderStatusIcon("todo")).toContain("☐") // ballot box (white)
    expect(renderStatusIcon("wip")).toContain("☐") // ballot box (yellow)
    expect(renderStatusIcon("blocked")).toContain("☒") // ballot box with X (red)
    expect(renderStatusIcon("done")).toContain("☑") // ballot box with check (green)
    expect(renderStatusIcon("dropped")).toContain("☒") // ballot box with X (gray)
    // undefined/null status shows red warning triangle
    expect(renderStatusIcon(undefined)).toContain("⚠")
  })

  test("renderCard includes content", () => {
    const repo = createMockRepo()
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
    const repo = createMockRepo()
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
    const repo = createMockRepo()
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
    expect(output).toContain("▶ 2") // Collapsed indicator with count
    expect(output).not.toContain("Child 1")
  })

  test("renderCard using fixture helper", () => {
    const repo = createMockRepo()
    // Demonstrate using the createCardState fixture
    const cardState = createCardState({
      content: "Fixture Card",
      type: "task",
    })

    const output = renderCard(repo, cardState, 40, false, false, false)
    expect(output).toContain("Fixture Card")
  })
})
