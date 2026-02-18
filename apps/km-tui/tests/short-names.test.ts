/**
 * Short-name codes for assignee display
 *
 * Feature: km-tui.short-names
 * Assignee names like "@bjorn-stabell" display as short codes like "@BS"
 * in the TUI info suffix.
 */

import { describe, it, expect } from "vitest"
import type { KNode } from "@km/core"
import { shortName, formatInfoSuffix } from "../src/views/tree-node-helpers.ts"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Unit: shortName()
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
// Unit: formatInfoSuffix with short names
// =============================================================================

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
// Integration: visual rendering
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
