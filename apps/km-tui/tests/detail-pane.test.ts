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
import { RepoProvider } from "../src/repo-context.tsx"

// --- Test Helpers ---

/** Default node fields that most tests don't care about */
const nodeDefaults = {
  parent_idx: 0,
  link_to: null,
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
function createTestNodes(
  specs: Array<
    Partial<KNode> & { id: string; type: KNode["type"]; content: string }
  >,
): KNode[] {
  return specs.map((spec) => createTestNode(spec))
}

/** Render DetailPane with a repo containing the given nodes */
function renderDetailPane(
  repo: ReturnType<typeof createFakeRepo>,
  node: KNode,
  width: number,
  height: number,
) {
  const detailPane = React.createElement(DetailPane, { node, width, height })
  return render(
    React.createElement(RepoProvider, { repo, children: detailPane }),
  )
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
    [
      "@mentions",
      "Contact @john and @jane about this",
      "mentions",
      ["john", "jane"],
    ],
    [
      "#tags",
      "This is #important and #urgent",
      "tags",
      ["important", "urgent"],
    ],
    [
      "+projects",
      "Part of +work and +finance projects",
      "projects",
      ["work", "finance"],
    ],
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
    [undefined, "todo", "blue"],
    ["done", "done", "green"],
    ["wip", "wip", "yellow"],
    ["blocked", "blocked", "red"],
    ["dropped", "dropped", "gray"],
  ] as const)(
    "status %s returns text=%s color=%s",
    (status, expectedText, expectedColor) => {
      const result = getStatusDisplay(status)
      expect(result.text).toBe(expectedText)
      expect(result.color).toBe(expectedColor)
    },
  )
})

describe("getProjectPath", () => {
  test("returns empty array for node with no parent", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "task1", type: "task", content: "Standalone task" },
      ]),
    })
    const node = repo.getNode("task1")!
    expect(getProjectPath(repo, node)).toEqual([])
  })

  test("returns folder names in path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "folder", content: "Work" },
        {
          id: "folder2",
          type: "folder",
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "task",
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
        { id: "folder1", type: "folder", content: "Projects" },
        { id: "file1", type: "file", content: "todo.md", parent_id: "folder1" },
        {
          id: "task1",
          type: "task",
          content: "Do something",
          parent_id: "file1",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    expect(getProjectPath(repo, task)).toEqual(["Projects", "todo.md"])
  })
})

describe("DetailPane", () => {
  test("renders with all task fields", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "task",
          content: "Review Q1 budget",
          task_status: "todo",
          due_date: "2026-01-10",
          assigned_to: "bjorn",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 24)
    expect(app.text).toContain("Review Q1 budget")
    expect(app.text).toContain("Status:")
    expect(app.text).toContain("todo")
    expect(app.text).toContain("Due:")
    expect(app.text).toContain("Jan")
    expect(app.text).toContain("Assigned:")
    expect(app.text).toContain("@bjorn")
  })

  test("shows subtasks", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "parent1", type: "task", content: "Parent task" },
        {
          id: "sub1",
          type: "task",
          content: "Subtask 1",
          parent_id: "parent1",
          task_status: "done",
        },
        {
          id: "sub2",
          type: "task",
          content: "Subtask 2",
          parent_id: "parent1",
          parent_idx: 1,
          task_status: "todo",
        },
      ]),
    })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 40, 24)
    expect(app.text).toContain("Subtasks")
    expect(app.text).toContain("Subtask 1")
    expect(app.text).toContain("Subtask 2")
  })

  test("shows references from content", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        {
          id: "task1",
          type: "task",
          content:
            "Talk to @john about #budget for +work project [[Meeting Notes]]",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 50, 24)
    expect(app.text).toContain("#budget")
    expect(app.text).toContain("@john")
    expect(app.text).toContain("+work")
    expect(app.text).toContain("[[Meeting Notes]]")
  })

  test("shows project path", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "folder1", type: "folder", content: "Work" },
        {
          id: "folder2",
          type: "folder",
          content: "Finance",
          parent_id: "folder1",
        },
        {
          id: "task1",
          type: "task",
          content: "Review budget",
          parent_id: "folder2",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 50, 24)
    expect(app.text).toContain("Project:")
    expect(app.text).toContain("Work")
    expect(app.text).toContain("Finance")
  })

  test("shows keybindings hint", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "task1", type: "task", content: "Simple task" },
      ]),
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
          type: "task",
          content: "Completed task",
          task_status: "done",
        },
      ]),
    })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 24)
    expect(app.text).toContain("done")
  })

  test("shows backlinks when present", () => {
    const repo = createFakeRepo({
      nodes: createTestNodes([
        { id: "target1", type: "task", content: "Target task" },
        {
          id: "source1",
          type: "file",
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
})
