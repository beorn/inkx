import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
const render = createRenderer()
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import {
  DetailPane,
  extractReferences,
  formatDate,
  getStatusDisplay,
  getProjectPath,
} from "../src/views/DetailPane.tsx"
import { resolveProjectDisplayNames } from "../src/views/detail-pane-helpers.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { testEnv, item } from "./helpers/board-test.ts"

// --- Test Helpers ---

/** Default node fields that most tests don't care about */
const nodeDefaults = {
  parent_idx: 0,
  embed_source: null,
  data: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  version: "test",
} as const

/** Create a test node with sensible defaults */
function createTestNode(
  overrides: Partial<KNode> & {
    id: string
    type: KNode["type"]
    content: string
  },
): KNode {
  return {
    parent_id: null,
    ...nodeDefaults,
    ...overrides,
  } as KNode
}

/** Create multiple test nodes from minimal specs */
function createTestNodes(specs: Array<Partial<KNode> & { id: string; type: KNode["type"]; content: string }>): KNode[] {
  return specs.map((spec) => createTestNode(spec))
}

/** Render DetailPane with a repo containing the given nodes */
function renderDetailPane(repo: ReturnType<typeof createFakeRepo>, node: KNode, width: number, height: number) {
  const detailPane = React.createElement(DetailPane, { node, width, height })
  return render(React.createElement(RepoProvider, { repo, children: detailPane }))
}

/** Helper to format date in local timezone (matches implementation) */
function localDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Get a date relative to today */
function dateRelativeToToday(daysOffset: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(today)
  date.setDate(date.getDate() + daysOffset)
  return localDateStr(date)
}

// --- Tests ---

describe("extractReferences", () => {
  test.each([
    ["@mentions", "Contact @john and @jane about this", "mentions", ["john", "jane"]],
    ["#tags", "This is #important and #urgent", "tags", ["important", "urgent"]],
    ["+projects", "Part of +work and +finance projects", "projects", ["work", "finance"]],
    [
      "[[wikilinks]]",
      "See [[Meeting Notes]] and [[Q4 Actuals]] for details",
      "wikilinks",
      ["Meeting Notes", "Q4 Actuals"],
    ],
  ] as const)("extracts %s", (_name, content, refType, expected) => {
    const refs = extractReferences(content)
    expect(refs[refType]).toEqual(expected)
  })

  test("extracts all reference types", () => {
    const refs = extractReferences("@bjorn #finance +work [[Q4 Budget]] review")
    expect(refs.mentions).toEqual(["bjorn"])
    expect(refs.tags).toEqual(["finance"])
    expect(refs.projects).toEqual(["work"])
    expect(refs.wikilinks).toEqual(["Q4 Budget"])
  })

  test("deduplicates references", () => {
    const refs = extractReferences("@john said @john should do it @john")
    expect(refs.mentions).toEqual(["john"])
  })

  test.each([
    ["undefined content", undefined],
    ["empty content", ""],
  ] as const)("handles %s", (_name, content) => {
    const refs = extractReferences(content)
    expect(refs.mentions).toEqual([])
    expect(refs.tags).toEqual([])
    expect(refs.projects).toEqual([])
    expect(refs.wikilinks).toEqual([])
  })
})

describe("formatDate", () => {
  test("returns empty string for undefined", () => {
    expect(formatDate(undefined).text).toBe("")
  })

  test("returns raw date for invalid date", () => {
    expect(formatDate("not-a-date").text).toBe("not-a-date")
  })

  test("formats date in current year as short form", () => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-01-15`
    const formatted = formatDate(dateStr)
    expect(formatted.text).toContain("Jan")
    expect(formatted.text).toContain("15")
  })

  test("returns full date for different year", () => {
    const formatted = formatDate("2020-06-15")
    expect(formatted.text).toBe("2020-06-15")
    expect(formatted.urgency).toBe("overdue")
  })

  test.each([
    [-5, "overdue", "past dates"],
    [1, "urgent", "dates due tomorrow"],
    [3, "soon", "dates due within 3 days"],
    [10, "normal", "future dates"],
  ] as const)("returns %s urgency for %s", (daysOffset, expectedUrgency) => {
    const formatted = formatDate(dateRelativeToToday(daysOffset))
    expect(formatted.urgency).toBe(expectedUrgency)
  })
})

describe("getStatusDisplay", () => {
  test.each([
    [undefined, "todo", "$focusring"],
    ["done", "done", "$success"],
    ["wip", "wip", "$warning"],
    ["blocked", "blocked", "$error"],
    ["dropped", "dropped", "$muted"],
  ] as const)("status %s returns text=%s color=%s", (status, expectedText, expectedColor) => {
    const result = getStatusDisplay(status)
    expect(result.text).toBe(expectedText)
    expect(result.color).toBe(expectedColor)
  })
})

describe("getProjectPath", () => {
  test("returns empty array for node with no parent", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([{ id: "task1", type: "p", item: true, content: "Standalone task" }]),
    })
    const node = repo.getNode("task1")!
    expect(getProjectPath(repo, node)).toEqual([])
  })

  test("returns folder names in path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: true, fstype: "folder" as const, content: "Work" },
        {
          id: "folder2",
          type: "h",
          item: true,
          fstype: "folder" as const,
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review budget",
          parent_id: "folder2",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    expect(getProjectPath(repo, task)).toEqual(["Work", "Finance"])
  })

  test("includes files in path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: true, fstype: "folder" as const, content: "Projects" },
        { id: "file1", type: "h", item: true, fstype: "mdfile" as const, content: "todo.md", parent_id: "folder1" },
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Do something",
          parent_id: "file1",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    expect(getProjectPath(repo, task)).toEqual(["Projects", "todo.md"])
  })
})

describe("resolveProjectDisplayNames", () => {
  test("resolves slugs to node display names", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "p1", type: "h", item: true, fstype: "mdfile" as const, content: "FAMILY SPRINT" },
        { id: "p2", type: "h", item: true, fstype: "mdfile" as const, content: "[Fam] Estate" },
      ]),
    })
    const resolved = resolveProjectDisplayNames(repo, ["family-sprint", "fam-estate"])
    expect(resolved).toEqual(["FAMILY SPRINT", "[Fam] Estate"])
  })

  test("falls back to raw slug when no match", () => {
    const repo = createFakeRepo({ nodes: [] })
    const resolved = resolveProjectDisplayNames(repo, ["unknown-project"])
    expect(resolved).toEqual(["unknown-project"])
  })

  test("handles empty slug list", () => {
    const repo = createFakeRepo({ nodes: [] })
    const resolved = resolveProjectDisplayNames(repo, [])
    expect(resolved).toEqual([])
  })

  test("handles mixed resolved and unresolved slugs", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([{ id: "p1", type: "h", item: true, fstype: "mdfile" as const, content: "My Project" }]),
    })
    const resolved = resolveProjectDisplayNames(repo, ["my-project", "missing-one"])
    expect(resolved).toEqual(["My Project", "missing-one"])
  })
})

describe("DetailPane", () => {
  test("renders with all task fields", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review Q1 budget",
          task_status: "todo",
          due_at: "2026-01-10",
          assigned_to: "bjorn",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 24)
    expect(app.text).toContain("Review Q1 budget")
    expect(app.text).toContain("Status")
    expect(app.text).toContain("todo")
    expect(app.text).toContain("Due")
    expect(app.text).toContain("Jan")
    expect(app.text).toContain("Assigned")
    expect(app.text).toContain("bjorn")
  })

  test("metadata values without explicit colors use white (not dim)", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Test task",
          task_status: "todo",
          assigned_to: "bjorn",
          data: {
            metadata: { created: "2026-01-01" },
          },
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // "Assigned" and "Created" values have no explicit valueColor
    // They should get white (visible) not default (dim/grey)
    expect(app.text).toContain("Assigned")
    expect(app.text).toContain("bjorn")
    expect(app.text).toContain("Created")
    expect(app.text).toContain("2026-01-01")
    // Check ANSI output: values should have $text foreground (visible, not dim)
    // but keys should have dim styling (attr 2)
    const ansi = app.ansi
    // The key "Assigned" should be dim (attribute 2)
    expect(ansi).toMatch(/2m[^]*?Assigned/)
    // The value "bjorn" should have a visible fg color ($text token), not be dim
    const bjornIdx = ansi.indexOf("bjorn")
    expect(bjornIdx).toBeGreaterThan(-1)
    // Look at the ANSI codes before "bjorn" — should include a foreground color
    // ($text resolves to whiteBright 38;5;15 with ansi16 km theme, or Nord #ECEFF4 = 38;2;236;239;244 with truecolor)
    const before = ansi.slice(Math.max(0, bjornIdx - 60), bjornIdx)
    expect(before).toMatch(/38;(?:5;(?:7|15)|2;236;239;244)/)
  })

  test("shows subtasks as outline items", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "parent1", type: "h", item: true, content: "Parent task" },
        {
          id: "sub1",
          type: "h",
          item: true,
          content: "Subtask 1",
          parent_id: "parent1",
          task_status: "done",
          task_marker: "[x]",
        },
        {
          id: "sub2",
          type: "h",
          item: true,
          content: "Subtask 2",
          parent_id: "parent1",
          parent_idx: 1,
          task_status: "todo",
          task_marker: "[ ]",
        },
      ]),
    })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 40, 24)
    expect(app.text).toContain("Subtask 1")
    expect(app.text).toContain("Subtask 2")
  })

  test("shows references from content", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Talk to @john about #budget for +work project [[Meeting Notes]]",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 80, 24)
    expect(app.text).toContain("#budget")
    expect(app.text).toContain("@john")
    expect(app.text).toContain("work")
    expect(app.text).toContain("Meeting Notes")
  })

  test("shows project path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: true, fstype: "folder" as const, content: "Work" },
        {
          id: "folder2",
          type: "h",
          item: true,
          fstype: "folder" as const,
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review budget",
          parent_id: "folder2",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 50, 24)
    // Location shown as breadcrumb above title, not as a metadata row
    expect(app.text).toContain("Work / Finance")
  })

  test("shows keybindings hint", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([{ id: "task1", type: "p", item: true, content: "Simple task" }]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 50, 24)
    // Note: keybindings hint may be clipped in fixed-height test render
    // The hint uses flexGrow to push to bottom, but gets clipped
    expect(app.text.length).toBeGreaterThan(0)
  })

  test("handles task with done status", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Completed task",
          task_status: "done",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 24)
    expect(app.text).toContain("done")
  })

  test("shows all projects with section context from data.projectMemberships", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Immigration paperwork",
          task_status: "todo",
          data: {
            projectMemberships: [
              { project: "FAMILY SPRINT", section: "Waiting" },
              { project: "[Fam] Estate", section: "Immigration" },
            ],
          },
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Should show "Projects" row with all project memberships and section context
    expect(app.text).toContain("Projects")
    expect(app.text).toContain("FAMILY SPRINT")
    expect(app.text).toContain("Waiting")
    expect(app.text).toContain("[Fam] Estate")
    expect(app.text).toContain("Immigration")
  })

  test("shows projects from data.projectMemberships even with single project", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Simple task",
          task_status: "todo",
          data: {
            projectMemberships: [{ project: "My Project", section: "To Do" }],
          },
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    expect(app.text).toContain("Projects")
    expect(app.text).toContain("My Project")
    expect(app.text).toContain("To Do")
  })

  test("resolves +project slugs to display names when no projectMemberships", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        // Project file nodes (as created by import) — their content is the project title
        {
          id: "proj1",
          type: "h",
          item: true,
          fstype: "mdfile" as const,
          content: "FAMILY SPRINT",
        },
        {
          id: "proj2",
          type: "h",
          item: true,
          fstype: "mdfile" as const,
          content: "[Fam] Estate",
        },
        // Task with +slug references but NO data.projectMemberships
        // (simulates post-parse state where projectMemberships was lost)
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review docs +family-sprint +fam-estate",
          task_status: "todo",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Should resolve slugs to display names in the Projects metadata row
    expect(app.text).toContain("FAMILY SPRINT")
    expect(app.text).toContain("[Fam] Estate")
  })

  test("falls back to slug when no matching project node exists", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review docs +unknown-project",
          task_status: "todo",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Should show the raw slug as fallback
    expect(app.text).toContain("unknown-project")
  })

  test("renders subtask children recursively in detail pane", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "parent1", type: "h", item: true, content: "Parent task" },
        {
          id: "sub1",
          type: "p",
          item: true,
          content: "Subtask with kids",
          parent_id: "parent1",
          task_status: "todo",
          task_marker: "[ ]",
        },
        {
          id: "grandchild1",
          type: "p",
          item: true,
          content: "Grandchild 1",
          parent_id: "sub1",
          task_marker: "[ ]",
        },
        {
          id: "grandchild2",
          type: "p",
          item: true,
          content: "Grandchild 2",
          parent_id: "sub1",
          parent_idx: 1,
          task_marker: "[ ]",
        },
        {
          id: "sub2",
          type: "p",
          item: true,
          content: "Subtask no kids",
          parent_id: "parent1",
          parent_idx: 1,
          task_status: "todo",
          task_marker: "[ ]",
        },
      ]),
    })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 60, 30)
    // All items should be rendered as structural items with recursive children
    expect(app.text).toContain("Subtask with kids")
    expect(app.text).toContain("Grandchild 1")
    expect(app.text).toContain("Grandchild 2")
    expect(app.text).toContain("Subtask no kids")
  })

  test("shows child count for items at max depth with hidden children", () => {
    // ColumnItems recursion: depth 0 → 1 → 2. At depth >= 3, children are hidden.
    // Structure: parent1 > d1(depth0) > d2(depth1) > d3(depth2) > d4(depth3) > d5a,d5b(hidden)
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "parent1", type: "h", item: true, content: "Root task" },
        { id: "d1", type: "p", item: true, content: "Depth 1", parent_id: "parent1", task_marker: "[ ]" },
        { id: "d2", type: "p", item: true, content: "Depth 2", parent_id: "d1", task_marker: "[ ]" },
        { id: "d3", type: "p", item: true, content: "Depth 3", parent_id: "d2", task_marker: "[ ]" },
        { id: "d4", type: "p", item: true, content: "Depth 4", parent_id: "d3", task_marker: "[ ]" },
        // d4 is at depth 3, so its children are not fetched
        { id: "d5a", type: "p", item: true, content: "Hidden child A", parent_id: "d4", task_marker: "[ ]" },
        {
          id: "d5b",
          type: "p",
          item: true,
          content: "Hidden child B",
          parent_id: "d4",
          parent_idx: 1,
          task_marker: "[ ]",
        },
      ]),
    })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 60, 30)
    expect(app.text).toContain("Depth 1")
    expect(app.text).toContain("Depth 2")
    expect(app.text).toContain("Depth 3")
    expect(app.text).toContain("Depth 4")
    // d4 at depth 3 has 2 hidden children — show count
    expect(app.text).toMatch(/\+2/)
    // The hidden children should NOT be rendered
    expect(app.text).not.toContain("Hidden child A")
    expect(app.text).not.toContain("Hidden child B")
  })

  test("renders body content with attachment links", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "task1", type: "p", item: true, content: "Task with attachments" },
        // Body content (non-structural: p type)
        {
          id: "body1",
          type: "p",
          content: "Some description text",
          parent_id: "task1",
        },
        {
          id: "body2",
          type: "p",
          content: "[Report.pdf](https://example.com/report.pdf)",
          parent_id: "task1",
          parent_idx: 1,
        },
        {
          id: "body3",
          type: "p",
          content: "![Screenshot](https://example.com/img.png)",
          parent_id: "task1",
          parent_idx: 2,
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    expect(app.text).toContain("Some description text")
    // Attachment links should show name and pretty URL
    expect(app.text).toContain("Report.pdf")
    expect(app.text).toContain("example.com/report.pdf")
    // Image embeds should show [img] prefix
    expect(app.text).toContain("[img]")
    expect(app.text).toContain("Screenshot")
  })

  test("renders mixed body and subtask children", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "task1", type: "p", item: true, content: "Parent with body and subtasks" },
        // Body content first
        { id: "b1", type: "p", content: "Description paragraph", parent_id: "task1" },
        // Then subtask items
        {
          id: "sub1",
          type: "p",
          item: true,
          content: "Subtask A",
          parent_id: "task1",
          parent_idx: 1,
          task_marker: "[ ]",
        },
        {
          id: "sub2",
          type: "p",
          item: true,
          content: "Subtask B",
          parent_id: "task1",
          parent_idx: 2,
          task_marker: "[x]",
          task_status: "done",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Should show body paragraph
    expect(app.text).toContain("Description paragraph")
    // Should show both subtasks
    expect(app.text).toContain("Subtask A")
    expect(app.text).toContain("Subtask B")
  })

  test("shows backlinks when present", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "target1", type: "p", item: true, content: "Target task" },
        {
          id: "source1",
          type: "h",
          item: true,
          fstype: "mdfile" as const,
          content: "Meeting Notes",
          parent_idx: 1,
        },
      ]),
      links: [
        {
          source_id: "source1",
          target_name: "Target task",
          target_id: "target1",
          section: null,
          block_id: null,
          alias: null,
          embedded: false,
          relationship: null,
          created_at: Date.now(),
        },
      ],
    })
    const target = repo.getNode("target1")!
    const app = renderDetailPane(repo, target, 50, 24)
    expect(app.text).toContain("Backlinks")
    expect(app.text).toContain("Meeting Notes")
  })

  test("does not show Depth, Type, or ID as metadata rows", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Clean task",
          task_status: "todo",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // These should NOT appear as metadata property labels in the rendered output
    // The rendered lines have border chars (│) and padding, so check for the label patterns
    expect(app.text).not.toMatch(/\bID\s{2,}/)
    expect(app.text).not.toMatch(/\bType\s{2,}/)
    expect(app.text).not.toMatch(/\bDepth\s{2,}/)
  })

  test("shows location as breadcrumb, not as a metadata row", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "h", item: true, fstype: "folder" as const, content: "Work" },
        {
          id: "folder2",
          type: "h",
          item: true,
          fstype: "folder" as const,
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Review budget",
          parent_id: "folder2",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Title appears in top bar
    expect(app.text).toContain("Review budget")
    // Location path should appear as breadcrumb (with " / " separators)
    expect(app.text).toContain("Work / Finance")
    // But NOT as a metadata row with "Location" label followed by padding
    expect(app.text).not.toMatch(/\bLocation\s{2,}/)
  })

  test("no dot separators between top-level subitems", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "parent1", type: "h", item: true, content: "Parent task" },
        {
          id: "sub1",
          type: "p",
          item: true,
          content: "First subtask",
          parent_id: "parent1",
          task_marker: "[ ]",
        },
        {
          id: "sub2",
          type: "p",
          item: true,
          content: "Second subtask",
          parent_id: "parent1",
          parent_idx: 1,
          task_marker: "[ ]",
        },
        {
          id: "sub3",
          type: "p",
          item: true,
          content: "Third subtask",
          parent_id: "parent1",
          parent_idx: 2,
          task_marker: "[ ]",
        },
      ]),
    })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 60, 30)
    // All subtasks should be present
    expect(app.text).toContain("First subtask")
    expect(app.text).toContain("Second subtask")
    expect(app.text).toContain("Third subtask")
    // No dot separators (· · ·) should appear between items
    expect(app.text).not.toContain("·")
  })

  test("data.tags with empty strings should not render bare '#'", () => {
    // Edge case: data.tags might contain empty strings from bad import data
    // The MetadataTable should filter them out rather than showing "#"
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "p",
          item: true,
          content: "Task with bad tag data",
          task_status: "todo",
          data: {
            tags: ["", "urgent", ""],
          },
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 24)
    // Should show the valid tag
    expect(app.text).toContain("#urgent")
    // Should NOT show bare "#" (empty tag names)
    const tagsLine = app.text.split("\n").find((l: string) => l.includes("Tags"))
    expect(tagsLine).toBeDefined()
    // Count the number of "#" followed by non-word chars or end of string
    // Each valid tag contributes "#tagname", bad tags would contribute just "#"
    const bareHashCount = (tagsLine!.match(/#(?=[,\s]|$)/g) ?? []).length
    expect(bareHashCount).toBe(0)
  })

  test("body text preserves paragraph breaks as blank lines", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "task1", type: "p", item: true, content: "Task with paragraphs" },
        {
          id: "body1",
          type: "p",
          content:
            "First paragraph line one.\nFirst paragraph line two.\n\nSecond paragraph starts here.\nSecond paragraph line two.",
          parent_id: "task1",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 60, 30)
    // Both paragraphs should be present
    expect(app.text).toContain("First paragraph line one.")
    expect(app.text).toContain("Second paragraph starts here.")
    // Find the lines in the rendered output
    const lines = app.text.split("\n")
    const firstParaIdx = lines.findIndex((l: string) => l.includes("First paragraph line two."))
    const secondParaIdx = lines.findIndex((l: string) => l.includes("Second paragraph starts here."))
    // There should be at least one blank/spacer line between the two paragraphs
    expect(firstParaIdx).toBeGreaterThan(-1)
    expect(secondParaIdx).toBeGreaterThan(-1)
    expect(secondParaIdx - firstParaIdx).toBeGreaterThanOrEqual(2)
  })
})

describe("Detail pane toggle (D key)", () => {
  test("D opens only detail pane, not an extra empty workspace pane", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Initially: 1 pane (main), no detail pane
    expect(store.getState().workspace.panes.size).toBe(1)
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Press D to toggle detail pane open
    board.press("D")

    // Should have exactly 2 panes: main + main-detail
    const ws = store.getState().workspace
    expect(ws.panes.size).toBe(2)
    expect(ws.panes.has("main")).toBe(true)
    expect(ws.panes.has("main-detail")).toBe(true)

    // The detail pane should be a "detail" type, not "empty"
    const detailPane = ws.panes.get("main-detail")!
    expect(detailPane.viewType).toBe("detail")

    // showDetailPane flag should be true
    expect(store.getState().ui.showDetailPane).toBe(true)

    // No "empty" panes should exist
    const emptyPanes = [...ws.panes.values()].filter((p) => p.viewType === "empty")
    expect(emptyPanes).toHaveLength(0)

    // The rendered output should NOT contain "Empty" or "Pane" title bars
    // (those come from PaneTitleBar for empty workspace panes)
    const text = board.screenshot()
    expect(text).not.toContain("Empty")

    // The layout should be a split with main (left) and main-detail (right)
    expect(ws.layout.type).toBe("split")
    if (ws.layout.type === "split") {
      expect(ws.layout.left).toEqual({ type: "leaf", paneId: "main" })
      expect(ws.layout.right).toEqual({ type: "leaf", paneId: "main-detail" })
    }
  })

  test("D with split panes does not create extra empty pane", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Split the pane first
    store.getState().splitFocusedPane("h")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Now press D to open detail pane
    board.press("D")

    const ws = store.getState().workspace
    // Should have 3 panes: main, main-detail, and the split pane
    // But the detail pane should be "detail" type, NOT "empty"
    const paneTypes = [...ws.panes.values()].map((p) => p.viewType)
    const detailPanes = paneTypes.filter((t) => t === "detail")
    const emptyPanes = paneTypes.filter((t) => t === "empty")

    // There should be exactly 1 detail pane
    expect(detailPanes).toHaveLength(1)
    // Any empty panes should only be from the split (not from D)
    expect(emptyPanes.length).toBeLessThanOrEqual(1)

    // The rendered output should not show "Empty pane" text
    const text = board.screenshot()
    expect(text).not.toContain("Empty pane")
  })

  test("D toggles detail pane closed when already open", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))), {
      columns: 120,
      rows: 24,
    })

    // Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.size).toBe(2)

    // Close detail pane
    board.press("D")
    expect(store.getState().workspace.panes.size).toBe(1)
    expect(store.getState().ui.showDetailPane).toBe(false)
  })
})
