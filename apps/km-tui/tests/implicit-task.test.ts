/**
 * Implicit task detection tests
 *
 * Nodes with task-related properties (due_at, priority, start_at,
 * assigned_to, rrule) should be treated as implicit tasks even without
 * an explicit task_status. They should show task icons and metadata badges.
 */
import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { hasTaskProperties } from "@km/core"
import { formatDateBadge, formatInfoSuffix, getNodeStyle } from "../src/views/tree-node-helpers.tsx"
import type { KNode } from "@km/core"

// =============================================================================
// Unit tests: hasTaskProperties helper
// =============================================================================

describe("hasTaskProperties", () => {
  it("returns false for node with no task properties", () => {
    expect(hasTaskProperties({} as KNode)).toBe(false)
  })

  const taskProps: Array<[string, Record<string, unknown>]> = [
    ["due_at", { due_at: "2026-02-20" }],
    ["priority", { priority: 2 }],
    ["start_at", { start_at: "2026-02-20" }],
    ["assigned_to", { assigned_to: "beorn" }],
    ["rrule", { rrule: "FREQ=WEEKLY" }],
  ]

  for (const [name, props] of taskProps) {
    it(`returns true for node with ${name}`, () => {
      expect(hasTaskProperties(props as KNode)).toBe(true)
    })
  }

  it("returns false for priority 0 (falsy but set)", () => {
    // priority 0 is not a valid priority (valid range is 1-4)
    expect(hasTaskProperties({ priority: 0 } as KNode)).toBe(false)
  })
})

// =============================================================================
// Unit tests: getNodeStyle for implicit tasks
// =============================================================================

describe("getNodeStyle with implicit tasks", () => {
  it("returns taskStatusIcon for node with due_at but no task_status", () => {
    const node = { due_at: "2026-02-20" } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).not.toBeNull()
    expect(style.taskStatusIcon!.char).toBe("\u25A1") // □ todo icon
  })

  it("returns taskStatusIcon for node with priority but no task_status", () => {
    const node = { priority: 2 } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).not.toBeNull()
  })

  it("explicit task_status takes precedence over implicit", () => {
    const node = { due_at: "2026-02-20", task_status: "done" } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).not.toBeNull()
    expect(style.taskStatusIcon!.char).toBe("\u2713") // ✓ done icon
  })

  it("implicit task with no status is not dimmed", () => {
    const node = { due_at: "2026-02-20" } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.shouldDim).toBe(false)
  })
})

// =============================================================================
// Unit tests: formatInfoSuffix shows board pills for implicit tasks
// =============================================================================

describe("formatInfoSuffix with implicit tasks", () => {
  it("shows board pills for node with task properties", () => {
    const node = { due_at: "2026-02-20" } as KNode
    // getBoardPills returns pills when called for a task
    const mockGetBoardPills = () => [{ boardId: "b1", boardName: "board", color: "cyan" }]
    const suffix = formatInfoSuffix(node, false, new Set(), mockGetBoardPills)
    // Should have called getBoardPills (non-empty suffix)
    expect(suffix).not.toBe("")
  })

  it("does not show board pills for plain node", () => {
    const node = {} as KNode
    const mockGetBoardPills = () => [{ boardId: "b1", boardName: "board", color: "cyan" }]
    const suffix = formatInfoSuffix(node, false, new Set(), mockGetBoardPills)
    // Should NOT have called getBoardPills for non-task
    expect(suffix).toBe("")
  })
})

// =============================================================================
// Integration: visual rendering
// =============================================================================

describe("implicit task rendering", () => {
  it("node with due_at shows date badge", () => {
    const nodes = item("board", item("col", item("task1")))
    // Modify the leaf node to be an implicit task (has due_at but no task_status)
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.due_at = "2026-03-20"
    // Remove explicit task status/marker that item() sets by default
    taskNode.task_status = undefined
    taskNode.task_marker = undefined

    const { board } = testEnv(() => nodes)
    // Date badge should show "Mar 20"
    board.expectScreen("Mar 20")
  })

  it("node with priority shows priority badge", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.priority = 2
    taskNode.task_status = undefined
    taskNode.task_marker = undefined

    const { board } = testEnv(() => nodes)
    board.expectScreen("P2")
  })

  it("node with due_at shows task icon (□)", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.due_at = "2026-03-20"
    taskNode.task_status = undefined
    taskNode.task_marker = undefined

    const { board } = testEnv(() => nodes)
    // The □ (white square) todo icon should appear
    board.expectScreen("\u25A1")
  })

  it("plain node without task properties has no task icon", () => {
    const nodes = item("board", item("col", item.paragraph("plain text")))
    const { board } = testEnv(() => nodes)
    // Should NOT have the □ task icon
    board.expectScreenNot("\u25A1")
  })

  it("node with assigned_to shows assignee in columns view", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.assigned_to = "beorn"
    taskNode.task_status = undefined
    taskNode.task_marker = undefined

    // Use columns view where assignee is shown inline (cards view only shows board pill dots)
    // shortName("beorn") → "B", so displays as "@B"
    const { board } = testEnv(() => nodes, { viewMode: "columns" })
    board.expectScreen("@B")
  })
})
