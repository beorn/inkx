/**
 * Board State & App API Tests
 *
 * Consolidated from:
 * - board-state.test.ts (pure state/logic tests)
 * - board-app.spec.ts (board.app() ergonomic API)
 */

import { describe, test, expect } from "vitest"
import { createEmptyState } from "../src/state.ts"
import { board } from "./helpers/board-app.ts"

// =============================================================================
// Empty State
// =============================================================================

describe("createEmptyState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyState()
    expect(state.rootId).toBeNull()
    expect(state.columns).toHaveLength(0)
    expect(state.selectedNodes.size).toBe(0)
    expect(state.visualMode).toBe(false)
    expect(state.searchMode).toBe(false)
    expect(state.helpMode).toBe(false)
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
    const customCheck = (_app: any) => {
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

    app.press("/") // Open search
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
