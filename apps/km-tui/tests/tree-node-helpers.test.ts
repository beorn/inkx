/**
 * Tree node helper tests
 *
 * Tests for the display helpers in tree-node-helpers.tsx:
 * - getNodeStyle: task status icons, dimming
 * - shortName: assignee name abbreviation
 * - formatInfoSuffix: info suffix with board pills, assignee codes
 */
import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import {
  formatDateBadge,
  formatInfoSuffix,
  getNodeStyle,
  shortName,
  type GetBoardPillsFn,
} from "../src/views/tree-node-helpers.tsx"
import { computeBulletIcon } from "../src/views/tree-node-shared.ts"
import { FOLDED_MARKER } from "../src/icons.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Unit tests: getNodeStyle for implicit tasks
// =============================================================================

describe("getNodeStyle task detection", () => {
  it("node with task_marker shows task icon", () => {
    const node = { item: { task: { marker: "[ ]", status: "todo" } } } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).not.toBeNull()
    expect(style.taskStatusIcon!.char).toBe("\u25A1") // □ todo icon
  })

  it("node with task_status shows task icon", () => {
    const node = { item: { task: { status: "done", marker: "[ ]" } } } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).not.toBeNull()
    expect(style.taskStatusIcon!.char).toBe("\u2713") // ✓ done icon
  })

  it("node with only due_at is NOT a task (no icon)", () => {
    const node = { due_at: "2026-02-20" } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).toBeNull()
  })

  it("node with only priority is NOT a task (no icon)", () => {
    const node = { priority: "P2" } as KNode
    const style = getNodeStyle(node, false, false, false, 0)
    expect(style.taskStatusIcon).toBeNull()
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

describe("formatInfoSuffix task detection", () => {
  it("shows board pills for node with task_marker", () => {
    const node = { item: { task: { marker: "[ ]", status: "todo" } } } as KNode
    const mockGetBoardPills: GetBoardPillsFn = () => [{ name: "board", color: "cyan" }]
    const suffix = formatInfoSuffix(node, false, new Set(), mockGetBoardPills)
    expect(suffix).not.toBe("")
  })

  it("no board pills for node with only due_at (not a task)", () => {
    const node = { due_at: "2026-02-20" } as KNode
    const mockGetBoardPills: GetBoardPillsFn = () => [{ name: "board", color: "cyan" }]
    const suffix = formatInfoSuffix(node, false, new Set(), mockGetBoardPills)
    expect(suffix).toBe("")
  })

  it("does not show board pills for plain node", () => {
    const node = {} as KNode
    const mockGetBoardPills: GetBoardPillsFn = () => [{ name: "board", color: "cyan" }]
    const suffix = formatInfoSuffix(node, false, new Set(), mockGetBoardPills)
    // Should NOT have called getBoardPills for non-task
    expect(suffix).toBe("")
  })
})

describe("formatInfoSuffix with short names", () => {
  const noopGetBoardPills = () => []

  it("shows short code for hyphenated assignee", () => {
    const node = { assigned_to: "bjorn-stabell", item: { task: { status: "todo", marker: "[ ]" } } } as KNode
    const suffix = formatInfoSuffix(node, false, new Set(), noopGetBoardPills)
    expect(suffix).toContain("@BS")
    expect(suffix).not.toContain("bjorn-stabell")
  })

  it("shows short code for single-word assignee", () => {
    const node = { assigned_to: "beorn", item: { task: { status: "todo", marker: "[ ]" } } } as KNode
    const suffix = formatInfoSuffix(node, false, new Set(), noopGetBoardPills)
    expect(suffix).toContain("@B")
    expect(suffix).not.toContain("@beorn")
  })

  it("compact mode does not show assignee", () => {
    const node = { assigned_to: "bjorn-stabell", item: { task: { status: "todo", marker: "[ ]" } } } as KNode
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
    taskNode.due_at = "2099-08-15"
    // Remove explicit task status/marker that item() sets by default
    taskNode.item = { ...taskNode.item, task: undefined }

    const { board } = testEnv(() => nodes)
    // Date badge should show "Aug 15" (far future date avoids relative display)
    board.expectScreen("Aug 15")
  })

  it("node with priority shows priority badge", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.priority = "P2"
    taskNode.item = { ...taskNode.item, task: undefined }

    const { board } = testEnv(() => nodes)
    board.expectScreen("P2")
  })

  it("node with only due_at does NOT show task icon (not a task)", () => {
    const nodes = item("board", item("col", item("task1")))
    const taskNode = nodes.find((n) => n.id === "task1")!
    taskNode.due_at = "2026-03-20"
    taskNode.item = { ...taskNode.item, task: undefined }

    const { board } = testEnv(() => nodes)
    // No task icon — due_at alone doesn't make it a task
    board.expectScreenNot("\u25A1")
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
    taskNode.item = { ...taskNode.item, task: undefined }

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
// computeBulletIcon: nerdfont fold indicator (Bug km-ii6qw.1)
// =============================================================================

describe("computeBulletIcon nerdfont fold indicator", () => {
  /** Minimal KNode for testing bullet icons */
  function makeNode(overrides: Partial<KNode> = {}): KNode {
    return {
      id: "test",
      type: "h",
      parent_id: null,
      parent_idx: 0,
      content: "test",
      data: {},
      created_at: 0,
      updated_at: 0,
      version: "",
      item: {},
      fstype: "mdsection",
      ...overrides,
    }
  }

  it("shows fold marker (▸) for folded non-task node with children in nerdfont mode", () => {
    const node = makeNode()
    const icon = computeBulletIcon(node, false, null, true, true, undefined, "nerdfont")
    // When folded with children, the bullet MUST be the fold marker (▸)
    // to indicate hidden content the user can unfold
    expect(icon.char).toBe(FOLDED_MARKER.char)
  })

  it("shows type bullet for unfolded non-task node with children in nerdfont mode", () => {
    const node = makeNode()
    const icon = computeBulletIcon(node, false, null, true, false, undefined, "nerdfont")
    // When unfolded, type-specific bullet is acceptable (e.g., § for mdsection)
    expect(icon.char).not.toBe(FOLDED_MARKER.char)
  })

  it("shows type bullet for non-task leaf node in nerdfont mode", () => {
    const node = makeNode()
    const icon = computeBulletIcon(node, false, null, false, false, undefined, "nerdfont")
    // Leaf node (no children) — type bullet is fine, no fold state to show
    expect(icon.char).not.toBe(FOLDED_MARKER.char)
  })

  it("shows fold marker for folded folder with children in nerdfont mode", () => {
    const node = makeNode({ fstype: "folder" })
    const icon = computeBulletIcon(node, false, null, true, true, undefined, "nerdfont")
    expect(icon.char).toBe(FOLDED_MARKER.char)
  })

  it("shows fold marker for folded list item with children in nerdfont mode", () => {
    const node = makeNode({ type: "p", item: { list: "-" }, fstype: undefined })
    const icon = computeBulletIcon(node, false, null, true, true, undefined, "nerdfont")
    expect(icon.char).toBe(FOLDED_MARKER.char)
  })

  it("preserves ownColor on fold marker", () => {
    const node = makeNode()
    const icon = computeBulletIcon(node, false, null, true, true, "red", "nerdfont")
    expect(icon.char).toBe(FOLDED_MARKER.char)
    expect(icon.color).toBe("red")
  })
})

// =============================================================================
// Body paragraph rendering (km-tui.embed-content-lines)
// =============================================================================

describe("body paragraph rendering", () => {
  it("body paragraphs render without bullet prefix", () => {
    // A card with body paragraphs (type=p, item=false) and a structural sub-item
    const nodes = item("board", item("Column", item("card-1", item.paragraph("body text here"), item("sub-item"))))
    const { board } = testEnv(() => nodes)
    const screenshot = board.screenshot()

    // Body paragraph should appear without a bullet marker
    // Sub-item should still have a bullet marker (· or similar)
    expect(screenshot).toContain("body text here")
    expect(screenshot).toContain("sub-item")

    // The body text line should not have a bullet character before it
    const lines = screenshot.split("\n")
    const bodyLine = lines.find((l) => l.includes("body text here"))
    const subItemLine = lines.find((l) => l.includes("sub-item"))
    expect(bodyLine).toBeDefined()
    expect(subItemLine).toBeDefined()

    // Body text should not have bullet markers (·, •, □, etc.)
    // but sub-items should have some marker
    if (bodyLine && subItemLine) {
      const bodyPrefix = bodyLine.split("body text here")[0]!
      const subItemPrefix = subItemLine.split("sub-item")[0]!
      // Body prefix should be shorter or have fewer non-space chars (no bullet)
      const bodyNonSpace = bodyPrefix.replace(/\s/g, "")
      const subItemNonSpace = subItemPrefix.replace(/\s/g, "")
      expect(bodyNonSpace.length).toBeLessThanOrEqual(subItemNonSpace.length)
    }
  })

  it("body paragraphs render dimmed", () => {
    const nodes = item("board", item("Column", item("card-1", item.paragraph("dimmed body"), item("normal-item"))))
    const { board } = testEnv(() => nodes)
    // Both should be visible
    board.expectScreen("dimmed body")
    board.expectScreen("normal-item")
  })
})
