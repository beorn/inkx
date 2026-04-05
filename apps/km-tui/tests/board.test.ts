/**
 * Board State & App API Tests
 *
 * Consolidated from:
 * - board-state.test.ts (pure state/logic tests)
 * - board-app.spec.ts (board.app() ergonomic API)
 */

import { describe, expect, test, vi } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createEmptyState } from "../src/state.ts"
import { checkInvariants, InvariantViolationError } from "../src/invariants.ts"
import { type BoardApp, board } from "./helpers/board-app.ts"
import { item, testEnv } from "./helpers/board-test.ts"
import { createSelection, type ID } from "@silvery/selection"

/** Create a mock SelectionStore for test contexts that don't use createApp. */
function createMockSel() {
  return createSelection({
    tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
  })
}

// =============================================================================
// Empty State
// =============================================================================

describe("createEmptyState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyState()
    expect(state.rootId).toBeNull()
    expect(state.columns).toHaveLength(0)
    expect(state.collapsedColumns.size).toBe(0)
    expect(state.collapsedNodeIds.size).toBe(0)
  })
})

// =============================================================================
// board.app() API
// =============================================================================

describe("board.app() API", () => {
  test("string DSL creates proper hierarchy", () => {
    const app = board.app(["Inbox > Task 1", "Inbox > Task 2", "Projects > Alpha"])

    expect(app.text).toContain("Inbox")
    expect(app.viewMode).toBe("cards")

    // Navigate - invariants run automatically
    app.press("j")
    app.press("l")

    // Fluent assertions
    app.shouldHave({ text: ["Inbox", "Projects"] })
  })

  test("fixtures work", () => {
    const app = board.fixture("kanban")

    // Only first 2 columns visible in 80-col terminal
    app.shouldHave({ text: ["Todo", "In Progress"] })
    app.press("j").press("j") // Fluent chaining
  })

  test("search flow with automatic invariants", () => {
    const app = board.app(["Col > Alpha", "Col > Beta", "Col > Gamma"])

    app.search("Beta")
    // Invariants checked automatically after search

    expect(app.text).toContain("Beta")
  })

  test("custom invariants", () => {
    let customCalled = false
    const customCheck = (_app: BoardApp) => {
      customCalled = true
    }

    const app = board.app(["Col > Task"], { invariants: [customCheck] })
    app.press("j")

    expect(customCalled).toBe(true)
  })

  test("all invariants via check()", () => {
    const app = board.app(["Col > Task 1", "Col > Task 2"])

    // Manually run all invariants
    app.check(...board.invariants.all)
  })

  test("sequence() for multiple keys", () => {
    const app = board.app(["Col > A", "Col > B", "Col > C"])

    app.sequence("j", "j", "k") // Down, down, up
    // Invariants run once at the end
  })

  test("type() for text input", () => {
    const app = board.app(["Col > Task"])

    app.press("cmd+f") // Open search
    app.type("test")
    app.press("Escape")
    // Invariants checked after each action
  })

  test("noCheck option disables invariants", () => {
    let invCalled = false
    const inv = () => {
      invCalled = true
    }

    const app = board.app(["Col > Task"], { noCheck: true, invariants: [inv] })
    app.press("j")

    expect(invCalled).toBe(false)
  })
})

// =============================================================================
// Runtime Invariants (km-tui.runtime-invariants)
// =============================================================================

describe("Runtime invariants", () => {
  test("clean state passes all invariants", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Verify no violations by navigating with invariants enabled
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
    // If invariants were violated, the press would have thrown
  })

  test("InvariantViolationError has correct properties", () => {
    const err = new InvariantViolationError("cursor-exists", "Cursor gone", { cursor: "abc" })
    expect(err.check).toBe("cursor-exists")
    expect(err.ids).toEqual({ cursor: "abc" })
    expect(err.message).toContain("cursor-exists")
    expect(err.message).toContain("Cursor gone")
    expect(err.name).toBe("InvariantViolationError")
  })

  test("invariants throw on cursor pointing to deleted node", () => {
    // Suppress log.error output that fires before the throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"))),
    })

    // Create a sel that has "nonexistent-node" in its walk order so we can select it as cursor.
    // checkInvariants reads ctx.cursor (from sel.node.cursor()).
    const sel = createSelection({
      tree: {
        walkOrder: () => ["nonexistent-node" as ID],
        parent: () => undefined,
        children: () => [],
      },
    })
    sel.node.select(["nonexistent-node" as ID])

    const ctx = {
      repo,
      sel,
      selectedIds: sel.node.ids(),
      rootId: "board",
      cursor: "nonexistent-node", // <-- this doesn't exist
      ui: { inlineEditBlock: null, multiSelected: new Set<string>() },
      columns: [],
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      viewIndex: new Map(), // empty — cursor not visible
      viewTree: { id: "board", role: "board", children: [] },
      moveState: { active: false },
    } as any

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-exists/)

    spy.mockRestore()
  })

  test("invariants throw on edit targeting deleted node", () => {
    // Suppress log.error output that fires before the throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"))),
    })

    const sel = createMockSel()
    // Put sel into text editing mode targeting a deleted node
    sel.text.edit("deleted-node" as any, 0)
    const ctx = {
      repo,
      sel,
      selectedIds: sel.node.ids(),
      rootId: "board",
      cursor: "1a",
      ui: {
        multiSelected: new Set<string>(),
      },
      columns: [],
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      viewIndex: new Map([["1a", {}]]), // cursor is visible
      viewTree: { id: "board", role: "board", children: [] },
      moveState: { active: false },
    } as any

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/edit-node-exists/)

    spy.mockRestore()
  })

  test("invariants pass for valid state", () => {
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"))),
    })

    const sel = createMockSel()
    const ctx = {
      repo,
      sel,
      selectedIds: sel.node.ids(),
      rootId: "board",
      cursor: "1a",
      ui: { multiSelected: new Set<string>() },
      columns: [],
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      viewIndex: new Map([["1a", {}]]), // cursor is visible
      viewTree: { id: "board", role: "board", children: [] },
      moveState: { active: false },
    } as any

    const violations = checkInvariants(ctx)
    // cursor-exists: 1a exists ✓
    // cursor-under-root: 1a is descendant of board ✓
    // cursor-visible: 1a in viewIndex ✓
    // edit-node-exists: no edit ✓
    // No column violations (empty columns)
    expect(violations).toEqual([])
  })
})
