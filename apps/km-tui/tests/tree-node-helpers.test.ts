/**
 * Tree node helper tests
 *
 * Consolidated from:
 * - implicit-task.test.ts (hasTaskProperties, getNodeStyle, formatInfoSuffix, visual rendering)
 * - short-names.test.ts (shortName, formatInfoSuffix with short names, visual rendering)
 *
 * Tests for the display helpers in tree-node-helpers.tsx:
 * - hasTaskProperties: detects implicit tasks (due_at, priority, start_at, assigned_to, rrule)
 * - getNodeStyle: task status icons, dimming
 * - shortName: assignee name abbreviation
 * - formatInfoSuffix: info suffix with board pills, assignee codes
 */
import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { hasTaskProperties } from "@km/core"
import { formatDateBadge, formatInfoSuffix, getNodeStyle, shortName } from "../src/views/tree-node-helpers.tsx"
import { makeSelectionKey, parseSelectionKey } from "../src/types.ts"
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
// Unit tests: shortName
// =============================================================================

describe("shortName", () => {
  it("converts hyphenated name to initials", () => {
    expect(shortName("bjorn-stabell")).toBe("BS")
  })

  it("converts single word to first letter", () => {
    expect(shortName("beorn")).toBe("B")
  })

  it("handles multiple hyphens", () => {
    expect(shortName("alice-bob-charlie")).toBe("ABC")
  })

  it("handles underscores", () => {
    expect(shortName("john_doe")).toBe("JD")
  })

  it("handles spaces", () => {
    expect(shortName("Jane Smith")).toBe("JS")
  })

  it("handles mixed separators", () => {
    expect(shortName("foo-bar_baz qux")).toBe("FBBQ")
  })

  it("uppercases lowercase input", () => {
    expect(shortName("alice")).toBe("A")
  })

  it("preserves already uppercase", () => {
    expect(shortName("Alice-Bob")).toBe("AB")
  })

  it("handles single character", () => {
    expect(shortName("x")).toBe("X")
  })

  it("handles leading/trailing separators", () => {
    expect(shortName("-alice-")).toBe("A")
  })
})

// =============================================================================
// Unit tests: formatInfoSuffix
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

describe("formatInfoSuffix with short names", () => {
  const noopGetBoardPills = () => []

  it("shows short code for hyphenated assignee", () => {
    const node = { assigned_to: "bjorn-stabell", task_status: "todo" } as KNode
    const suffix = formatInfoSuffix(node, false, new Set(), noopGetBoardPills)
    expect(suffix).toContain("@BS")
    expect(suffix).not.toContain("bjorn-stabell")
  })

  it("shows short code for single-word assignee", () => {
    const node = { assigned_to: "beorn", task_status: "todo" } as KNode
    const suffix = formatInfoSuffix(node, false, new Set(), noopGetBoardPills)
    expect(suffix).toContain("@B")
    expect(suffix).not.toContain("@beorn")
  })

  it("compact mode does not show assignee", () => {
    const node = { assigned_to: "bjorn-stabell", task_status: "todo" } as KNode
    const suffix = formatInfoSuffix(node, true, new Set(), noopGetBoardPills)
    expect(suffix).not.toContain("@")
  })
})

// =============================================================================
// Integration: implicit task rendering
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

  it("node with due_at shows task icon (\u25A1)", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.due_at = "2026-03-20"
    taskNode.task_status = undefined
    taskNode.task_marker = undefined

    const { board } = testEnv(() => nodes)
    // The \u25A1 (white square) todo icon should appear
    board.expectScreen("\u25A1")
  })

  it("plain node without task properties has no task icon", () => {
    const nodes = item("board", item("col", item.paragraph("plain text")))
    const { board } = testEnv(() => nodes)
    // Should NOT have the \u25A1 task icon
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

// =============================================================================
// Integration: short-names rendering
// =============================================================================

describe("short-names integration", () => {
  it("columns view shows short assignee code", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.assigned_to = "bjorn-stabell"

    const { board } = testEnv(() => nodes, { viewMode: "columns" })
    board.expectScreen("@BS")
    board.expectScreenNot("bjorn-stabell")
  })

  it("single-word assignee shows first letter", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.assigned_to = "alice"

    const { board } = testEnv(() => nodes, { viewMode: "columns" })
    board.expectScreen("@A")
  })
})

// =============================================================================
// Selection key helpers (from views/TreeNode.test.ts)
// =============================================================================

describe("makeSelectionKey", () => {
  it("creates key from nodeId", () => {
    expect(makeSelectionKey("node-abc")).toBe("node-abc")
    expect(makeSelectionKey("node-xyz")).toBe("node-xyz")
  })

  it("handles node IDs with special characters", () => {
    expect(makeSelectionKey("a:b:c")).toBe("a:b:c")
  })

  it("creates unique keys for different nodes", () => {
    const keys = new Set([makeSelectionKey("node-1"), makeSelectionKey("node-2"), makeSelectionKey("node-3")])
    expect(keys.size).toBe(3)
  })
})

describe("parseSelectionKey", () => {
  it("parses nodeId from key", () => {
    const result = parseSelectionKey("node-abc")
    expect(result.nodeId).toBe("node-abc")
  })

  it("handles node IDs with colons", () => {
    const result = parseSelectionKey("a:b:c")
    expect(result.nodeId).toBe("a:b:c")
  })
})
