/**
 * NodeView Component Tests
 *
 * Tests the unified rendering components:
 * - ColumnHeader (board style) — column header rendering
 * - NodeLineView (line style) — compact one-line display
 * - NodeCardView (card style) — card with subitems
 * - NodeColumnView (column style) — section header
 * - NodeTabView (tab style) — tab bar pill
 * - NodeDetailView (detail style) — full detail pane
 *
 * Integration tests use createTestApp() for full board rendering.
 * Unit tests use renderString() for isolated component testing.
 */

import { describe, test, expect } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { renderString } from "@silvery/ag-react"
import React from "react"
import { NodeLineView, NodeCardView, NodeColumnView, NodeTabView, NodeDetailView } from "../../src/views/NodeView.tsx"
import type { KNode } from "@km/core"

// Helper to create a minimal KNode for unit tests
function makeNode(overrides: Partial<KNode> = {}): KNode {
  return {
    id: "test-node-1",
    content: "Test Node",
    type: "p",
    item: {},
    parent_id: null,
    parent_idx: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    data: {},
    ...overrides,
  } as KNode
}

// =============================================================================
// Integration: Column header rendering via ColumnHeader component
// =============================================================================

describe("ColumnHeader (cards view)", () => {
  test("column header shows name without count (no WIP limit)", () => {
    using app = createTestApp(item("board", item("Todo", item("task1"), item("task2"), item("task3"))), {
      cols: 60,
      rows: 20,
    })

    const output = app.text
    // Column name should be visible
    expect(output).toContain("Todo")
    // Count is hidden without WIP limit — only shown as count/wip
  })

  test("column header shows count/wip when WIP limit set", () => {
    using app = createTestApp(item("board", item("Todo km.limit:: 5", item("task1"), item("task2"), item("task3"))), {
      cols: 60,
      rows: 20,
    })

    const output = app.text
    expect(output).toContain("Todo")
    expect(output).toContain("3/5")
  })

  test("column header shows separator line", () => {
    using app = createTestApp(item("board", item("col", item("task"))), { cols: 40, rows: 10 })

    const output = app.text
    // Should have horizontal rule (─) separator
    expect(output).toContain("─")
  })

  test("multiple column headers render side by side", () => {
    using app = createTestApp(item("board", item.section("Todo"), item.section("Doing"), item.section("Done")), {
      cols: 120,
      rows: 20,
    })

    const output = app.text
    expect(output).toContain("Todo")
    expect(output).toContain("Doing")
    expect(output).toContain("Done")

    // All three should be on the same line
    const headerLine = output.split("\n").find((l) => l.includes("Todo") && l.includes("Doing") && l.includes("Done"))
    expect(headerLine).toBeDefined()
  })

  test("column header counts update with WIP limit", () => {
    using app = createTestApp(
      item(
        "board",
        item("few km.limit:: 3", item("a")),
        item("many km.limit:: 10", item("b"), item("c"), item("d"), item("e"), item("f")),
      ),
      { cols: 80, rows: 20 },
    )

    const output = app.text
    // First column has 1 card with WIP 3, second has 5 with WIP 10
    expect(output).toContain("1/3")
    expect(output).toContain("5/10")
  })
})

describe("ColumnHeader (columns view)", () => {
  test("column header shows in columns view mode", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))), { cols: 60, rows: 20 })

    // Switch to columns view (v m = cycle view mode)
    app.command("cycle_view_mode")

    const output = app.text
    expect(output).toContain("col")
    expect(output).toContain("─")
  })
})

describe("ColumnHeader content rendering", () => {
  test("wiki links in column name render without brackets", () => {
    using app = createTestApp(item("board", item("[[My Project]]", item("task"))), { cols: 60, rows: 15 })

    const output = app.text
    expect(output).toContain("My Project")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })

  test("column with URL in card shows prettified URL", () => {
    using app = createTestApp(item("board", item("col", item("Check https://example.com/page for info"))), {
      cols: 60,
      rows: 15,
    })

    const output = app.text
    // URL should be prettified (protocol stripped)
    expect(output).toContain("example.com/page")
    // Protocol should be stripped
    expect(output).not.toContain("https://")
  })
})

// =============================================================================
// NodeLineView — line style (icon + title, 1 line)
// =============================================================================

describe("NodeLineView (line style)", () => {
  test("renders node title", async () => {
    const node = makeNode({ content: "Buy groceries" })
    const output = await renderString(<NodeLineView node={node} />, { plain: true, width: 40 })
    expect(output).toContain("Buy groceries")
  })

  test("renders task status icon for tasks", async () => {
    const node = makeNode({ content: "Todo item", item: { task: { status: "todo", marker: "[ ]" } } })
    const output = await renderString(<NodeLineView node={node} />, { plain: true, width: 40 })
    // Should show the title without the task marker
    expect(output).toContain("Todo item")
  })

  test("strips task marker from content", async () => {
    const node = makeNode({ content: "[x] Done task", item: { task: { status: "done", marker: "[x]" } } })
    const output = await renderString(<NodeLineView node={node} />, { plain: true, width: 40 })
    expect(output).toContain("Done task")
    expect(output).not.toContain("[x]")
  })

  test("truncates long content to single line", async () => {
    const node = makeNode({ content: "A".repeat(100) })
    const output = await renderString(<NodeLineView node={node} width={30} />, { plain: true, width: 30 })
    // Output should be no more than 1 line
    const lines = output.split("\n").filter((l) => l.trim())
    expect(lines.length).toBeLessThanOrEqual(1)
  })

  test("renders non-selected state by default", async () => {
    const node = makeNode({ content: "Normal item" })
    const output = await renderString(<NodeLineView node={node} />, { plain: true, width: 40 })
    expect(output).toContain("Normal item")
  })

  test("uses displayName override instead of content", async () => {
    const node = makeNode({ content: "raw-content-ignored" })
    const output = await renderString(<NodeLineView node={node} displayName="Custom Title" />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Custom Title")
    expect(output).not.toContain("raw-content-ignored")
  })

  test("renders indent as 2-space increments", async () => {
    const node = makeNode({ content: "Nested item" })
    const indented = await renderString(<NodeLineView node={node} indent={2} />, { plain: true, width: 40 })
    const flat = await renderString(<NodeLineView node={node} indent={0} />, { plain: true, width: 40 })
    // Indented version should have more leading spaces
    const indentedLeading = indented.match(/^(\s*)/)?.[1]?.length ?? 0
    const flatLeading = flat.match(/^(\s*)/)?.[1]?.length ?? 0
    expect(indentedLeading).toBeGreaterThan(flatLeading)
  })
})

// =============================================================================
// NodeCardView — card style (icon + title + subitems + overflow)
// =============================================================================

describe("NodeCardView (card style)", () => {
  test("renders card title", async () => {
    const node = makeNode({ content: "Project Alpha" })
    const output = await renderString(<NodeCardView node={node} children={[]} />, { plain: true, width: 40 })
    expect(output).toContain("Project Alpha")
  })

  test("renders subitems as lines", async () => {
    const parent = makeNode({ content: "Parent" })
    const children = [makeNode({ id: "c1", content: "Child 1" }), makeNode({ id: "c2", content: "Child 2" })]
    const output = await renderString(<NodeCardView node={parent} children={children} />, { plain: true, width: 40 })
    expect(output).toContain("Parent")
    expect(output).toContain("Child 1")
    expect(output).toContain("Child 2")
  })

  test("shows overflow count when children exceed maxSubitems", async () => {
    const parent = makeNode({ content: "Parent" })
    const children = Array.from({ length: 8 }, (_, i) => makeNode({ id: `c${i}`, content: `Item ${i + 1}` }))
    const output = await renderString(<NodeCardView node={parent} children={children} maxSubitems={3} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Parent")
    expect(output).toContain("Item 1")
    expect(output).toContain("Item 2")
    expect(output).toContain("Item 3")
    expect(output).toContain("+5 more")
    expect(output).not.toContain("Item 4")
  })

  test("renders bold title", async () => {
    const node = makeNode({ content: "Bold Title" })
    // Use non-plain to check ANSI bold
    const output = await renderString(<NodeCardView node={node} children={[]} />, { plain: false, width: 40 })
    expect(output).toContain("Bold Title")
  })

  test("does not show body indicator when body children are visible as subitems", async () => {
    const parent = makeNode({ content: "Card with body" })
    const children = [
      makeNode({ id: "b1", type: "p", content: "A paragraph of body content" }),
      makeNode({ id: "c1", type: "h", item: {}, content: "Structural child" }),
    ]
    const output = await renderString(<NodeCardView node={parent} children={children} />, { plain: true, width: 50 })
    // Body children are rendered as subitems, so ··· should NOT show
    expect(output).not.toContain("···")
  })

  test("no body indicator when node has only structural children", async () => {
    const parent = makeNode({ content: "Card without body" })
    const children = [
      makeNode({ id: "c1", type: "h", item: {}, content: "Column 1" }),
      makeNode({ id: "c2", type: "h", item: {}, content: "Column 2" }),
    ]
    const output = await renderString(<NodeCardView node={parent} children={children} />, { plain: true, width: 50 })
    expect(output).not.toContain("···")
  })

  test("no body indicator when node has no children", async () => {
    const node = makeNode({ content: "Empty card" })
    const output = await renderString(<NodeCardView node={node} children={[]} />, { plain: true, width: 50 })
    expect(output).not.toContain("···")
  })

  test("shows date badge for task with due date", async () => {
    // Use a date far enough in the future to show as a formatted date
    const futureDate = "2027-06-15"
    const node = makeNode({
      content: "Task with due",
      item: { task: { status: "todo", marker: "[ ]" } },
      due_at: futureDate,
    })
    const output = await renderString(<NodeCardView node={node} children={[]} width={60} />, { plain: true, width: 60 })
    expect(output).toContain("Task with due")
    expect(output).toContain("Jun 15")
  })

  test("shows priority badge", async () => {
    const node = makeNode({
      content: "High priority task",
      priority: "P1",
    })
    const output = await renderString(<NodeCardView node={node} children={[]} width={60} />, { plain: true, width: 60 })
    expect(output).toContain("High priority task")
    expect(output).toContain("P1")
  })

  test("hides date badge for done tasks", async () => {
    const node = makeNode({
      content: "Done task",
      item: { task: { status: "done", marker: "[x]" } },
      due_at: "2027-06-15",
      priority: "P2",
    })
    const output = await renderString(<NodeCardView node={node} children={[]} width={60} />, { plain: true, width: 60 })
    expect(output).toContain("Done task")
    // Date and priority badges should be hidden for done tasks
    expect(output).not.toContain("Jun 15")
    expect(output).not.toContain("P2")
  })

  test("shows recurrence indicator", async () => {
    const node = makeNode({
      content: "Recurring task",
      rrule: "weekly",
    })
    const output = await renderString(<NodeCardView node={node} children={[]} width={60} />, { plain: true, width: 60 })
    expect(output).toContain("Recurring task")
    expect(output).toContain("\u21BB") // ↻ character
  })

  test("shows parent context for embedded tasks", async () => {
    const node = makeNode({ content: "Embedded task" })
    const output = await renderString(
      <NodeCardView node={node} children={[]} width={60} parentContext="Projects > Website" />,
      { plain: true, width: 60 },
    )
    expect(output).toContain("Projects > Website")
    expect(output).toContain("Embedded task")
  })

  test("shows blocked indicator when isBlocked is true", async () => {
    const node = makeNode({ content: "Blocked task", item: { task: { status: "todo", marker: "[ ]" } } })
    const output = await renderString(<NodeCardView node={node} children={[]} width={60} isBlocked />, {
      plain: true,
      width: 60,
    })
    expect(output).toContain("Blocked task")
    expect(output).toContain("blocked")
  })

  test("shows subtask progress badge", async () => {
    const node = makeNode({ content: "Parent task" })
    const children = [
      makeNode({ id: "t1", content: "Done task", type: "p", item: { task: { status: "done", marker: "[x]" } } }),
      makeNode({ id: "t2", content: "Todo task", type: "p", item: { task: { status: "todo", marker: "[ ]" } } }),
      makeNode({ id: "t3", content: "WIP task", type: "p", item: { task: { status: "wip", marker: "[/]" } } }),
      makeNode({ id: "n1", content: "Not a task", type: "p", item: {} }),
    ]
    const output = await renderString(<NodeCardView node={node} children={children} width={60} />, {
      plain: true,
      width: 60,
    })
    expect(output).toContain("Parent task")
    // 1 done out of 3 tasks (non-task child excluded)
    expect(output).toContain("1/3")
  })
})

// =============================================================================
// NodeColumnView — column/section header style
// =============================================================================

describe("NodeColumnView (column style)", () => {
  test("renders section name with count", async () => {
    const node = makeNode({ content: "In Progress" })
    const output = await renderString(<NodeColumnView node={node} displayName="In Progress" count={5} width={40} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("In Progress")
    expect(output).toContain("5")
  })

  test("renders section sigil prefix for mdsection nodes", async () => {
    // NodeColumnView gets its bullet from getTypeBullet(node) — mdsection
    // nodes render with `§`, not a hardcoded prefix. See 5240e893a
    // (NodeColumnView icon from getTypeBullet). A `p` node would render
    // with `·` instead.
    const node = makeNode({ type: "h", item: {}, fstype: "mdsection", content: "Done" })
    const output = await renderString(<NodeColumnView node={node} displayName="Done" count={12} width={40} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("\u00A7") // § character
    expect(output).toContain("Done")
    expect(output).toContain("12")
  })

  test("strips leading § from displayName to avoid double-stamping", async () => {
    // Regression: RESOLVER.md with `## § 4 — Filename conventions` would
    // render as `§ § 4 — Filename conventions`. After 5240e893a the leading
    // `§` / `#` markers are stripped from displayName before render.
    const node = makeNode({
      type: "h",
      item: {},
      fstype: "mdsection",
      content: "§ 4 — Filename conventions",
    })
    const output = await renderString(
      <NodeColumnView node={node} displayName="§ 4 — Filename conventions" count={3} width={60} />,
      { plain: true, width: 60 },
    )
    // Exactly one `§` (from the type bullet), not two.
    const sectionCount = (output.match(/\u00A7/g) ?? []).length
    expect(sectionCount).toBe(1)
    expect(output).toContain("4 — Filename conventions")
  })

  test("renders separator line", async () => {
    const node = makeNode({ content: "Section" })
    const output = await renderString(<NodeColumnView node={node} displayName="Section" count={3} width={30} />, {
      plain: true,
      width: 30,
    })
    expect(output).toContain("\u2500") // ─ character
  })

  test("renders selected state with yellow background", async () => {
    const node = makeNode({ content: "Selected" })
    const selected = await renderString(
      <NodeColumnView node={node} displayName="Selected" count={2} width={40} isSelected />,
      { plain: false, width: 40 },
    )
    const unselected = await renderString(<NodeColumnView node={node} displayName="Selected" count={2} width={40} />, {
      plain: false,
      width: 40,
    })
    // Selected and unselected should produce different ANSI output
    expect(selected).not.toEqual(unselected)
  })
})

// =============================================================================
// NodeTabView — tab style (title pill)
// =============================================================================

describe("NodeTabView (tab style)", () => {
  test("renders tab with name and count", async () => {
    const node = makeNode({ content: "Todo" })
    const output = await renderString(<NodeTabView node={node} displayName="Todo" count={7} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Todo")
    expect(output).toContain("(7)")
  })

  test("truncates long tab names", async () => {
    const node = makeNode({ content: "Very Long Section Name That Exceeds Limit" })
    const output = await renderString(
      <NodeTabView node={node} displayName="Very Long Section Name That Exceeds Limit" count={3} />,
      { plain: true, width: 60 },
    )
    // Name should be truncated to maxNameWidth (20) with ellipsis
    expect(output).toContain("\u2026") // … character
    expect(output).toContain("(3)")
  })

  test("dimInactive dims non-active tabs", async () => {
    const node = makeNode({ content: "Dimmed" })
    const dimmed = await renderString(<NodeTabView node={node} displayName="Dimmed" count={1} dimInactive />, {
      plain: false,
      width: 40,
    })
    const normal = await renderString(<NodeTabView node={node} displayName="Normal" count={1} />, {
      plain: false,
      width: 40,
    })
    // Dimmed inactive tab should have dim ANSI codes
    expect(dimmed).not.toEqual(normal)
  })

  test("renders active tab differently", async () => {
    const node = makeNode({ content: "Active" })
    const active = await renderString(<NodeTabView node={node} displayName="Active" count={1} isActive />, {
      plain: false,
      width: 40,
    })
    const inactive = await renderString(<NodeTabView node={node} displayName="Inactive" count={1} />, {
      plain: false,
      width: 40,
    })
    // Active and inactive should produce different ANSI output
    expect(active).not.toEqual(inactive)
  })
})

// =============================================================================
// NodeDetailView — detail style (full detail pane)
// =============================================================================

describe("NodeDetailView (detail style)", () => {
  test("renders node title in header", async () => {
    const node = makeNode({ content: "Task Details" })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={40} height={20} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Task Details")
  })

  test("renders body content", async () => {
    const node = makeNode({ content: "Main Task" })
    const bodyChild = makeNode({ id: "body1", content: "This is body text", type: "p" })
    const output = await renderString(<NodeDetailView node={node} children={[bodyChild]} width={50} height={20} />, {
      plain: true,
      width: 50,
    })
    expect(output).toContain("Main Task")
    expect(output).toContain("This is body text")
  })

  test("renders structural children", async () => {
    const node = makeNode({ content: "Parent Task" })
    const children = [
      makeNode({ id: "s1", content: "Subtask 1", type: "p", item: {} }),
      makeNode({ id: "s2", content: "Subtask 2", type: "p", item: {} }),
    ]
    const output = await renderString(<NodeDetailView node={node} children={children} width={50} height={20} />, {
      plain: true,
      width: 50,
    })
    expect(output).toContain("Parent Task")
    expect(output).toContain("Subtask 1")
    expect(output).toContain("Subtask 2")
  })

  test("renders backlinks section", async () => {
    const node = makeNode({ content: "Referenced Node" })
    const backlinks = [
      makeNode({ id: "bl1", content: "Linking Node A" }),
      makeNode({ id: "bl2", content: "Linking Node B" }),
    ]
    const output = await renderString(
      <NodeDetailView node={node} children={[]} backlinks={backlinks} width={50} height={20} />,
      { plain: true, width: 50 },
    )
    expect(output).toContain("Referenced Node")
    expect(output).toContain("Backlinks (2)")
    expect(output).toContain("Linking Node A")
    expect(output).toContain("Linking Node B")
  })

  test("shows (empty) when no children or body", async () => {
    const node = makeNode({ content: "Empty Node" })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={40} height={15} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Empty Node")
    expect(output).toContain("(empty)")
  })

  test("shows task status icon for task nodes", async () => {
    const node = makeNode({ content: "Done task", item: { task: { status: "done", marker: "[x]" } } })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={40} height={15} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Done task")
  })

  test("limits backlinks to max 5", async () => {
    const node = makeNode({ content: "Popular Node" })
    const backlinks = Array.from({ length: 8 }, (_, i) => makeNode({ id: `bl${i}`, content: `Backlink ${i + 1}` }))
    const output = await renderString(
      <NodeDetailView node={node} children={[]} backlinks={backlinks} width={50} height={30} />,
      { plain: true, width: 50 },
    )
    expect(output).toContain("Backlinks (8)")
    expect(output).toContain("Backlink 1")
    expect(output).toContain("Backlink 5")
    expect(output).toContain("+3 more")
  })

  test("shows metadata fields for task with properties", async () => {
    const node = makeNode({
      content: "Detailed task",
      item: { task: { status: "wip", marker: "[/]" } },
      due_at: "2027-03-15",
      assigned_to: "bjorn-stabell",
      priority: "P2",
    })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={50} height={25} />, {
      plain: true,
      width: 50,
    })
    expect(output).toContain("Detailed task")
    expect(output).toContain("Status")
    expect(output).toContain("wip")
    expect(output).toContain("Due")
    expect(output).toContain("2027-03-15")
    expect(output).toContain("Assigned")
    expect(output).toContain("bjorn-stabell")
    expect(output).toContain("Priority")
    expect(output).toContain("P2")
  })

  test("no metadata section when node has no task properties", async () => {
    const node = makeNode({ content: "Simple note" })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={40} height={15} />, {
      plain: true,
      width: 40,
    })
    expect(output).toContain("Simple note")
    // Should not have a metadata label like "Status" or "Due"
    expect(output).not.toContain("Status")
    expect(output).not.toContain("Due")
  })

  test("renders mixed body and structural children", async () => {
    const node = makeNode({ content: "Mixed Node" })
    const children = [
      makeNode({ id: "p1", content: "Body paragraph text", type: "p" }),
      makeNode({ id: "s1", content: "Subtask A", type: "p", item: {} }),
      makeNode({ id: "s2", content: "Subtask B", type: "p", item: {} }),
    ]
    const output = await renderString(<NodeDetailView node={node} children={children} width={50} height={25} />, {
      plain: true,
      width: 50,
    })
    expect(output).toContain("Mixed Node")
    expect(output).toContain("Body paragraph text")
    expect(output).toContain("Subtask A")
    expect(output).toContain("Subtask B")
  })

  test("shows start_at and recurrence in metadata", async () => {
    const node = makeNode({
      content: "Recurring task",
      item: { task: { status: "todo", marker: "[ ]" } },
      start_at: "2027-04-01",
      rrule: "weekly",
    })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={50} height={25} />, {
      plain: true,
      width: 50,
    })
    expect(output).toContain("Start")
    expect(output).toContain("2027-04-01")
    expect(output).toContain("Recurrence")
    expect(output).toContain("weekly")
  })

  test("renders border with round style", async () => {
    const node = makeNode({ content: "Bordered" })
    const output = await renderString(<NodeDetailView node={node} children={[]} width={30} height={10} />, {
      plain: true,
      width: 30,
    })
    // Round border uses characters like ╭, ╮, ╰, ╯
    expect(output).toContain("\u256D") // ╭ top-left corner
    expect(output).toContain("\u256E") // ╮ top-right corner
  })
})
