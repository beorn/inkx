/**
 * Import Pipeline Tests
 *
 * Tests the 3-stage pipeline: Fetch → Convert → Write
 * Uses FakeAsana to avoid real API calls.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync as fsWriteFileSync } from "fs"
import { join } from "path"
import { createFakeAsana, minimalFixtures } from "./fake-asana.ts"
import type { FakeAsana } from "./fake-asana.ts"
import { convert } from "../../src/import/convert.ts"
import { writeFiles } from "../../src/import/write.ts"
import { fetchFromAsana as _fetchFromAsana } from "../../src/import/adapters/asana-api.ts"
import { parseAsanaFile } from "../../src/import/adapters/asana-file.ts"
import type { ImportData } from "../../src/import/types.ts"

/** Wrapper that disables rate-limit delays for tests */
const fetchFromAsana = (opts: Parameters<typeof _fetchFromAsana>[0]) =>
  _fetchFromAsana({ ...opts, _testMode: true } as Parameters<typeof _fetchFromAsana>[0])

// ============================================================================
// Stage 1: Fetch (asana-api.ts with FakeAsana)
// ============================================================================

describe("Stage 1: Fetch from Asana API", () => {
  let fake: FakeAsana
  let restore: () => void
  const downloadDir = "/tmp/km-fetch-test-" + Date.now()

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    fake = createFakeAsana(minimalFixtures())
    restore = fake.install()
  })

  afterEach(() => {
    restore()
    vi.restoreAllMocks()
    if (existsSync(downloadDir)) rmSync(downloadDir, { recursive: true })
  })

  test("fetches projects with sections, tasks, and subtasks", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    expect(data.source).toBe("asana")
    expect(data.projects).toHaveLength(3)

    const sprint = data.projects[0]!
    expect(sprint.title).toBe("Sprint 4")
    expect(sprint.sections).toHaveLength(2)
    expect(sprint.sections![0]!.title).toBe("To Do")
    expect(sprint.sections![0]!.items).toHaveLength(1)

    // Task with subtasks
    const task1 = sprint.sections![0]!.items[0]!
    expect(task1.title).toBe("Design login page")
    expect(task1.children).toHaveLength(2)
    expect(task1.children![0]!.title).toBe("Create wireframes")
    expect(task1.children![1]!.status).toBe("done")
  })

  test("captures workspace and project metadata", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    expect(data.workspace).toBe("Test Workspace")

    const sprint = data.projects[0]!
    expect(sprint.workspace).toBe("Test Workspace")
    expect(sprint.createdAt).toBe("2026-01-01T00:00:00Z")
    expect(sprint.modifiedAt).toBe("2026-02-15T10:00:00Z")
    expect(sprint.owner).toBe("Test User")
    expect(sprint.team).toBe("Engineering")

    // Workspace metadata JSON saved
    const wsMeta = JSON.parse(readFileSync(join(downloadDir, "_workspace.json"), "utf-8"))
    expect(wsMeta.teams).toHaveLength(1)
    expect(wsMeta.teams[0].name).toBe("Engineering")
    expect(wsMeta.users).toHaveLength(2)
  })

  test("captures multi-project membership", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.projects).toEqual(["Sprint 4", "Product Backlog"])
  })

  test("extracts assignee, dates, priority, tags", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.assignee).toBe("alice-smith")
    expect(task1.dueAt).toBe("2026-03-01")
    expect(task1.startAt).toBe("2026-02-15")
    expect(task1.priority).toBe(1)
    expect(task1.tags).toEqual(["design", "frontend"])
  })

  test("fetches comments when includeComments is true", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeComments: true,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    // system type filtered, standalone old system-log filtered, consolidated partially filtered
    expect(task1.comments).toHaveLength(2)
    expect(task1.comments![0]!.text).toBe("Looks great, minor tweaks needed")
    expect(task1.comments![0]!.author).toBe("bob-jones")
    // Consolidated comment: system actions stripped, real comment kept
    expect(task1.comments![1]!.text).toContain("This is a real comment about the task")
    expect(task1.comments![1]!.text).not.toContain("changed the due date")
    expect(task1.comments![1]!.text).not.toContain("marked this task complete")
  })

  test("includes old system-log comments with includeCommentLogs", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeComments: true,
      includeCommentLogs: true,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    // Real comment + standalone system-log + consolidated (unfiltered) = 3
    expect(task1.comments).toHaveLength(3)
    expect(task1.comments![1]!.text).toBe("moved this Task from Backlog to To Do")
    expect(task1.comments![2]!.text).toContain("changed the due date")
  })

  test("extracts createdAt and completedAt dates", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.createdAt).toBe("2026-02-10T08:00:00Z")
    expect(task1.completedAt).toBeUndefined()

    const task2 = data.projects[0]!.sections![1]!.items[0]!
    expect(task2.createdAt).toBe("2026-02-05T10:00:00Z")
    expect(task2.completedAt).toBe("2026-02-09T16:30:00Z")
  })

  test("fetches attachments when includeAttachments is true", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeAttachments: true,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.attachments).toHaveLength(1)
    expect(task1.attachments![0]!.name).toBe("wireframe.png")
    expect(task1.attachments![0]!.type).toBe("image")
  })

  test("records API calls when record is true", async () => {
    const result = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      record: true,
    })

    expect(result.recorded).toBeDefined()
    expect(result.recorded!.length).toBeGreaterThan(0)
    // Should have calls for: /users/me, /projects, /projects/:id/sections x2, /tasks x2, /tasks/:id/subtasks
    expect(result.recorded!.some((r) => r.path === "/users/me")).toBe(true)
    expect(result.recorded!.some((r) => r.path === "/projects")).toBe(true)
  })

  test("converts html_notes with bullets via turndown", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const htmlTask = edge.sections![0]!.items.find((i) => i.sourceId === "task-html")!
    expect(htmlTask.body).toContain("Planning notes:")
    // turndown converts <li> to "* " bullets
    expect(htmlTask.body).toMatch(/\*\s+First option/)
    expect(htmlTask.body).toContain("Additional context here.")
  })

  test("preserves Asana internal links in html_notes after turndown", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const linkTask = edge.sections![0]!.items.find((i) => i.sourceId === "task-links")!
    // turndown converts <a> to markdown links; Asana URLs stay as-is until convert stage
    expect(linkTask.body).toContain("Related task")
    expect(linkTask.body).toContain("app.asana.com")
  })

  test("fetches milestone tasks with resource_subtype", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const milestone = edge.sections![2]!.items.find((i) => i.sourceId === "task-mile")!
    expect(milestone.milestone).toBe(true)
    expect(milestone.title).toBe("Beta release")
  })

  test("fetches all-metadata task with every field", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeComments: true,
      includeAttachments: true,
    })
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    expect(full.assignee).toBe("alice-smith")
    expect(full.dueAt).toBe("2026-02-15")
    expect(full.startAt).toBe("2026-01-20")
    expect(full.createdAt).toBe("2026-01-15T09:00:00Z")
    expect(full.completedAt).toBe("2026-02-10T17:00:00Z")
    expect(full.status).toBe("done")
    expect(full.priority).toBe(2)
    expect(full.tags).toEqual(["backend", "urgent"])
    expect(full.projects).toEqual(["Edge Cases", "Sprint 4"])
    expect(full.permalink).toBe("https://app.asana.com/0/proj-3/task-full")
    expect(full.children).toHaveLength(1)
    expect(full.children![0]!.title).toBe("Sub-step one")
    expect(full.comments).toHaveLength(1)
    expect(full.attachments).toHaveLength(1)
    expect(full.body).toContain("bold")
  })

  test("fetches multi-line comments", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeComments: true,
    })
    const edge = data.projects[2]!
    const mlc = edge.sections![0]!.items.find((i) => i.sourceId === "task-mlc")!
    expect(mlc.comments).toHaveLength(1)
    expect(mlc.comments![0]!.text).toContain("First line of feedback")
    expect(mlc.comments![0]!.text).toContain("Second line with details")
    expect(mlc.comments![0]!.text).toContain("Third line conclusion")
  })

  test("fetches separator section name as-is", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const sectionNames = edge.sections!.map((s) => s.title)
    expect(sectionNames).toContain("------------------")
  })
})

// ============================================================================
// Stage 1: Fetch (asana-file.ts — JSON export parsing)
// ============================================================================

describe("Stage 1: Parse Asana JSON export", () => {
  test("parses tasks grouped by project and section", () => {
    const json = JSON.stringify({
      data: [
        {
          gid: "1001",
          name: "Task A",
          notes: "Description",
          completed: false,
          due_on: "2026-03-01",
          start_on: null,
          assignee: { name: "Alice" },
          tags: [{ name: "urgent" }],
          custom_fields: [],
          subtasks: [],
          memberships: [
            {
              project: { gid: "p1", name: "My Project" },
              section: { gid: "s1", name: "Doing" },
            },
          ],
        },
        {
          gid: "1002",
          name: "Task B",
          notes: "",
          completed: true,
          due_on: null,
          start_on: null,
          assignee: null,
          tags: [],
          custom_fields: [],
          subtasks: [],
          memberships: [
            {
              project: { gid: "p1", name: "My Project" },
              section: { gid: "s2", name: "Done" },
            },
          ],
        },
      ],
    })

    const data = parseAsanaFile(json)
    expect(data.source).toBe("asana")
    expect(data.projects).toHaveLength(1)
    expect(data.projects[0]!.title).toBe("My Project")
    expect(data.projects[0]!.sections).toHaveLength(2)
    expect(data.projects[0]!.sections![0]!.items[0]!.title).toBe("Task A")
    expect(data.projects[0]!.sections![0]!.items[0]!.assignee).toBe("alice")
    expect(data.projects[0]!.sections![1]!.items[0]!.status).toBe("done")
  })

  test("parses recursive subtasks", () => {
    const json = JSON.stringify({
      data: [
        {
          gid: "1",
          name: "Parent",
          notes: "",
          completed: false,
          due_on: null,
          start_on: null,
          assignee: null,
          tags: [],
          custom_fields: [],
          subtasks: [
            {
              gid: "1a",
              name: "Child",
              notes: "",
              completed: false,
              subtasks: [{ gid: "1aa", name: "Grandchild", notes: "", completed: true, subtasks: [] }],
            },
          ],
          memberships: [{ project: { gid: "p1", name: "P" }, section: { gid: "s1", name: "S" } }],
        },
      ],
    })

    const data = parseAsanaFile(json)
    const parent = data.projects[0]!.sections![0]!.items[0]!
    expect(parent.children).toHaveLength(1)
    expect(parent.children![0]!.children).toHaveLength(1)
    expect(parent.children![0]!.children![0]!.title).toBe("Grandchild")
    expect(parent.children![0]!.children![0]!.status).toBe("done")
  })
})

// ============================================================================
// Stage 2: Convert (ImportData → FileMap)
// ============================================================================

describe("Stage 2: Convert ImportData to markdown", () => {
  const fixture: ImportData = {
    source: "asana",
    fetchedAt: "2026-02-17T12:00:00Z",
    projects: [
      {
        sourceId: "p1",
        title: "Sprint 4",
        sections: [
          {
            sourceId: "s1",
            title: "To Do",
            items: [
              {
                sourceId: "t1",
                title: "Design login page",
                assignee: "alice",
                dueAt: "2026-03-01",
                startAt: "2026-02-15",
                createdAt: "2026-02-10T08:00:00Z",
                priority: 1,
                tags: ["design"],
                projects: ["Sprint 4", "Backlog"],
                body: "Create wireframes\nReview with team",
                comments: [
                  {
                    author: "bob",
                    createdAt: "2026-02-16T10:30:00Z",
                    text: "Looks great, minor tweaks needed",
                  },
                ],
                attachments: [
                  {
                    name: "wireframe.png",
                    url: "https://example.com/wireframe.png",
                    type: "image",
                  },
                ],
                children: [
                  { sourceId: "s1", title: "Create wireframes", status: "todo" },
                  { sourceId: "s2", title: "Review with team", status: "done" },
                ],
              },
            ],
          },
          {
            sourceId: "s2",
            title: "Done",
            items: [{ sourceId: "t2", title: "Write tests", status: "done", completedAt: "2026-02-09T16:30:00Z" }],
          },
        ],
      },
    ],
  }

  test("generates one file per project with correct slug", () => {
    const files = convert(fixture)
    expect(files.size).toBe(1)
    expect(files.has("p1-sprint-4.md")).toBe(true)
  })

  test("includes frontmatter", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("imported_from: asana")
    expect(md).toContain("asana_project_id: p1")
  })

  test("renders sections as H2", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("## To Do")
    expect(md).toContain("## Done")
  })

  test("renders tasks with inline metadata", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    // Content: title @assignee #tags +projects, then stringifyMetadata appends created/completed,
    // then stringifyTaskMetadata appends due/start/p from KNode fields
    expect(md).toContain("- [ ] Design login page @alice #design")
    expect(md).toContain("created:: 2026-02-10")
    expect(md).toContain("due:: 2026-03-01")
    expect(md).toContain("start:: 2026-02-15")
    expect(md).toContain("p:: 1")
  })

  test("renders completedAt on done tasks", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("- [x] Write tests completed:: 2026-02-09")
  })

  test("renders multi-project as +project tags (excluding current project)", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    // +sprint-4 is excluded because it's the current project
    expect(md).not.toContain("+sprint-4")
    expect(md).toContain("+backlog")
  })

  test("renders completed tasks with [x]", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("- [x] Write tests")
  })

  test("renders subtasks as nested items", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("  - [ ] Create wireframes")
    expect(md).toContain("  - [x] Review with team")
  })

  test("renders body as blockquote", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("  > Create wireframes")
    expect(md).toContain("  > Review with team")
  })

  test("renders comments in blockquote", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("> **Comments:**")
    expect(md).toContain("> - 2026-02-16 @bob: Looks great")
  })

  test("renders image attachments in blockquote", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("> ![wireframe.png](https://example.com/wireframe.png)")
  })

  test("converts Asana URLs to ^block references", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            {
              sourceId: "t1",
              title: "Task with links",
              body: "See https://app.asana.com/0/123/456 and https://app.asana.com/1/789/task/101112",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("[[^456]]")
    expect(md).toContain("[[^101112]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("uses ^sourceId as block ID on task lines", () => {
    const files = convert(fixture)
    const md = files.get("p1-sprint-4.md")!
    expect(md).toContain("^t1")
    expect(md).toContain("^t2")
    expect(md).not.toContain("gid:")
  })

  test("renders body with markdown bullets inside blockquote", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            {
              sourceId: "t1",
              title: "Task with bullets",
              body: "Planning notes:\n\n*   First option\n*   Second option\n*   Third option\n\nAdditional context here.",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("> Planning notes:")
    expect(md).toContain("> *   First option")
    expect(md).toContain("> *   Third option")
    expect(md).toContain("> Additional context here.")
  })

  test("renders Asana links in body as block references inside blockquote", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            {
              sourceId: "t1",
              title: "Task with asana links",
              body: "See also: [Related](https://app.asana.com/0/123456/789012) and [Another](https://app.asana.com/1/111/task/222333)",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("> See also: [Related]([[^789012]])")
    expect(md).toContain("[Another]([[^222333]])")
    expect(md).not.toContain("app.asana.com")
  })

  test("renders milestone task with diamond marker", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            { sourceId: "m1", title: "Launch day", milestone: true, status: "todo" },
            { sourceId: "m2", title: "Past milestone", milestone: true, status: "done" },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("- [ ] ◆ Launch day")
    expect(md).toContain("- [x] ◆ Past milestone")
  })

  test("renders all-metadata task with every field in output", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            {
              sourceId: "tf1",
              title: "Full task",
              body: "Description with **bold** text.",
              status: "done",
              assignee: "alice-smith",
              dueAt: "2026-02-15",
              startAt: "2026-01-20",
              createdAt: "2026-01-15T09:00:00Z",
              completedAt: "2026-02-10T17:00:00Z",
              priority: 2,
              tags: ["backend", "urgent"],
              projects: ["Test", "Other Project"],
              children: [{ sourceId: "cs1", title: "Sub-step", status: "done" }],
              comments: [
                {
                  author: "bob",
                  createdAt: "2026-02-09T14:00:00Z",
                  text: "Approved. Ship it!",
                },
              ],
              attachments: [
                {
                  name: "spec.pdf",
                  url: "https://example.com/spec.pdf",
                  type: "file",
                },
              ],
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("- [x] Full task")
    expect(md).toContain("@alice-smith")
    expect(md).toContain("due:: 2026-02-15")
    expect(md).toContain("start:: 2026-01-20")
    expect(md).toContain("created:: 2026-01-15")
    expect(md).toContain("completed:: 2026-02-10")
    expect(md).toContain("p:: 2")
    expect(md).toContain("#backend")
    expect(md).toContain("#urgent")
    // +test excluded (current project), only other projects shown
    expect(md).not.toContain("+test")
    expect(md).toContain("+other-project")
    expect(md).toContain("^tf1")
    expect(md).toContain("> Description with **bold** text.")
    expect(md).toContain("  - [x] Sub-step")
    expect(md).toContain("> **Comments:**")
    expect(md).toContain("> - 2026-02-09 @bob: Approved. Ship it!")
    expect(md).toContain("> [spec.pdf](https://example.com/spec.pdf)")
  })

  test("renders multi-line comments with continuation lines", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            {
              sourceId: "t1",
              title: "Task with multiline comment",
              comments: [
                {
                  author: "alice",
                  createdAt: "2026-02-12T15:00:00Z",
                  text: "First line of feedback\nSecond line with details\nThird line conclusion",
                },
              ],
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("p1-test.md")!
    expect(md).toContain("> - 2026-02-12 @alice: First line of feedback")
    expect(md).toContain(">   Second line with details")
    expect(md).toContain(">   Third line conclusion")
  })
})

describe("Multi-project task dedup", () => {
  test("first project gets full content, second gets reference", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "projA",
          title: "Project Alpha",
          items: [{ sourceId: "shared-1", title: "Shared task", status: "todo", body: "Details here" }],
        },
        {
          sourceId: "projB",
          title: "Project Beta",
          items: [
            { sourceId: "shared-1", title: "Shared task", status: "todo", body: "Details here" },
            { sourceId: "only-beta", title: "Beta only", status: "done" },
          ],
        },
      ],
    }
    const files = convert(data)
    const alpha = files.get("projA-project-alpha.md")!
    const beta = files.get("projB-project-beta.md")!

    // Alpha has full content (body, ^block-id)
    expect(alpha).toContain("- [ ] Shared task ^shared-1")
    expect(alpha).toContain("  > Details here")

    // Beta has reference line with block reference (GIDs are globally unique)
    expect(beta).toContain("→ [[^shared-1]]")
    // Beta should NOT have the body (it's a reference)
    expect(beta).not.toContain("  > Details here")

    // Non-shared task renders normally in Beta
    expect(beta).toContain("- [x] Beta only")
  })
})

// ============================================================================
// Stage 3: Write (FileMap → disk)
// ============================================================================

describe("Stage 3: Write files to disk", () => {
  const testDir = "/tmp/km-import-test-" + Date.now()

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  test("writes files to output directory", () => {
    const files = new Map([["test.md", "# Test\n\n- [ ] Task 1\n"]])
    const { written, skipped } = writeFiles(files, { outDir: testDir })
    expect(written).toEqual(["test.md"])
    expect(skipped).toHaveLength(0)
    expect(readFileSync(join(testDir, "test.md"), "utf-8")).toBe("# Test\n\n- [ ] Task 1\n")
  })

  test("skips existing files without --force", () => {
    mkdirSync(testDir, { recursive: true })
    const content = '---\nasana_project_id: "p1"\n---\n# Old\n'
    fsWriteFileSync(join(testDir, "test.md"), content)

    const files = new Map([["test.md", '---\nasana_project_id: "p1"\n---\n# New\n']])
    const { written, skipped } = writeFiles(files, { outDir: testDir })
    expect(written).toHaveLength(0)
    expect(skipped).toEqual(["test.md"])
    // Original content preserved
    expect(readFileSync(join(testDir, "test.md"), "utf-8")).toBe(content)
  })

  test("overwrites existing files with --force", () => {
    mkdirSync(testDir, { recursive: true })
    fsWriteFileSync(join(testDir, "test.md"), "old content")

    const files = new Map([["test.md", "new content"]])
    const { written } = writeFiles(files, { outDir: testDir, force: true })
    expect(written).toEqual(["test.md"])
    expect(readFileSync(join(testDir, "test.md"), "utf-8")).toBe("new content")
  })

  test("dry-run does not write files", () => {
    const files = new Map([["test.md", "content"]])
    const { written } = writeFiles(files, { outDir: testDir, dryRun: true })
    expect(written).toEqual(["test.md"])
    expect(existsSync(join(testDir, "test.md"))).toBe(false)
  })
})

// ============================================================================
// End-to-end: FakeAsana → ImportData → markdown → disk
// ============================================================================

describe("End-to-end: FakeAsana → markdown files", () => {
  const testDir = "/tmp/km-import-e2e-" + Date.now()
  const e2eDownloadDir = "/tmp/km-e2e-dl-" + Date.now()
  let fake: FakeAsana
  let restore: () => void

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    fake = createFakeAsana(minimalFixtures())
    restore = fake.install()
  })

  afterEach(() => {
    restore()
    vi.restoreAllMocks()
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
    if (existsSync(e2eDownloadDir)) rmSync(e2eDownloadDir, { recursive: true })
  })

  test("full pipeline: fetch → convert → write", async () => {
    // Stage 1
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
      includeComments: true,
      includeAttachments: true,
    })

    // Stage 2
    const files = convert(data)
    expect(files.size).toBe(3)

    // Stage 3
    const { written } = writeFiles(files, { outDir: testDir })
    expect(written).toHaveLength(3)

    // Verify Sprint 4 file (FakeAsana uses gid="proj-1")
    const sprint = readFileSync(join(testDir, "proj-1-sprint-4.md"), "utf-8")
    expect(sprint).toContain("# Sprint 4")
    expect(sprint).toContain("## To Do")
    expect(sprint).toContain("- [ ] Design login page")
    expect(sprint).toContain("  - [ ] Create wireframes")
    expect(sprint).toContain("  - [x] Review with team")
    expect(sprint).toContain("## Done")
    expect(sprint).toContain("- [x] Write tests")

    // Verify Product Backlog file
    const backlog = readFileSync(join(testDir, "proj-2-product-backlog.md"), "utf-8")
    expect(backlog).toContain("# Product Backlog")
    expect(backlog).toContain("- [ ] API spec review")

    // Verify Edge Cases file
    const edge = readFileSync(join(testDir, "proj-3-edge-cases.md"), "utf-8")
    expect(edge).toContain("# Edge Cases")
    expect(edge).toContain("## Active")
    expect(edge).toContain("## ------------------")
    expect(edge).toContain("## Milestones")
    // Milestone renders with diamond marker
    expect(edge).toContain("- [ ] ◆ Beta release")
    // HTML notes converted to markdown with bullets in blockquote
    expect(edge).toMatch(/>\s+\*\s+First option/)
    // Multi-line comment has continuation lines
    expect(edge).toContain("@alice-smith: First line of feedback")
    expect(edge).toMatch(/>\s+Second line with details/)
    // All-metadata task
    expect(edge).toContain("- [x] Comprehensive task")
    expect(edge).toContain("@alice-smith")
    expect(edge).toContain("due:: 2026-02-15")
    expect(edge).toContain("p:: 2")
  })
})

// ============================================================================
// Roundtrip: Convert → Parse (verify parser handles import output)
// ============================================================================

import { parseMarkdown, extractFrontmatter, parseTaskMetadata, extractTags, extractMentions } from "@km/markdown"
import type { List, ListItem, Heading } from "@km/markdown"

/** Create minimal ImportData for roundtrip tests */
function makeImportData(items: ImportItem[], title = "Test Project"): ImportData {
  return {
    source: "asana",
    fetchedAt: "2026-01-01T00:00:00Z",
    projects: [
      {
        sourceId: "proj-rt",
        title,
        sections: [{ sourceId: "sec-rt", title: "Section", items }],
      },
    ],
  }
}

describe("roundtrip: convert → parse", () => {
  test("task hierarchy preserved through roundtrip", () => {
    const data = makeImportData([
      {
        sourceId: "parent-1",
        title: "Parent task",
        body: "Some body text about this task",
        children: [
          { sourceId: "sub-1", title: "Subtask one", status: "done" },
          { sourceId: "sub-2", title: "Subtask two", status: "todo" },
        ],
      },
    ])

    const files = convert(data)
    const md = files.get("proj-rt-test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    // Find the top-level list under the H2 section
    const list = tree.children.find((n): n is List => n.type === "list")!
    expect(list).toBeDefined()
    expect(list.type).toBe("list")

    // The parent list item
    const parentLi = list.children[0]! as ListItem
    expect(parentLi.type).toBe("listItem")

    // Parent should have: paragraph (task line), blockquote (body), and a nested list (subtasks)
    const childTypes = parentLi.children.map((c) => c.type)
    expect(childTypes).toContain("paragraph")
    expect(childTypes).toContain("blockquote")
    expect(childTypes).toContain("list")

    // The nested list should have exactly 2 children (subtasks), not more
    const subtaskList = parentLi.children.find((c): c is List => c.type === "list")!
    expect(subtaskList.children).toHaveLength(2)

    // Verify subtask checkbox states
    expect(subtaskList.children[0]!.checked).toBe(true) // done
    expect(subtaskList.children[1]!.checked).toBe(false) // todo
  })

  test("task with body bullets doesn't create extra children", () => {
    const data = makeImportData([
      {
        sourceId: "bullet-task",
        title: "Task with bullets",
        body: "Planning notes:\n\n*   First option\n*   Second option\n*   Third option\n\nAdditional context here.",
      },
    ])

    const files = convert(data)
    const md = files.get("proj-rt-test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    const list = tree.children.find((n): n is List => n.type === "list")!
    const taskLi = list.children[0]! as ListItem

    // The body bullets are in a blockquote, NOT as sibling list items
    const childTypes = taskLi.children.map((c) => c.type)
    expect(childTypes).toContain("blockquote")
    // No nested list — the bullets are inside the blockquote, not parsed as subtask list items
    expect(childTypes).not.toContain("list")

    // The top-level list should have exactly 1 item (the task itself)
    expect(list.children).toHaveLength(1)
  })

  test("nested subtasks preserve depth", () => {
    const data = makeImportData([
      {
        sourceId: "lvl1",
        title: "Level 1",
        children: [
          {
            sourceId: "lvl2",
            title: "Level 2",
            children: [
              {
                sourceId: "lvl3",
                title: "Level 3",
                status: "done",
              },
            ],
          },
        ],
      },
    ])

    const files = convert(data)
    const md = files.get("proj-rt-test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    // Navigate: root list > listItem > nested list > listItem > nested list > listItem
    const rootList = tree.children.find((n): n is List => n.type === "list")!
    expect(rootList.type).toBe("list")

    const li1 = rootList.children[0]! as ListItem
    expect(li1.type).toBe("listItem")

    const nestedList1 = li1.children.find((c): c is List => c.type === "list")!
    expect(nestedList1).toBeDefined()

    const li2 = nestedList1.children[0]! as ListItem
    expect(li2.type).toBe("listItem")

    const nestedList2 = li2.children.find((c): c is List => c.type === "list")!
    expect(nestedList2).toBeDefined()

    const li3 = nestedList2.children[0]! as ListItem
    expect(li3.type).toBe("listItem")
    expect(li3.checked).toBe(true) // done
  })

  test("multi-project dedup references don't break hierarchy", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-01-01T00:00:00Z",
      projects: [
        {
          sourceId: "projA",
          title: "Project Alpha",
          sections: [
            {
              sourceId: "s1",
              title: "Work",
              items: [{ sourceId: "shared-rt", title: "Shared task", status: "todo", body: "Details" }],
            },
          ],
        },
        {
          sourceId: "projB",
          title: "Project Beta",
          sections: [
            {
              sourceId: "s2",
              title: "Work",
              items: [
                { sourceId: "shared-rt", title: "Shared task", status: "todo", body: "Details" },
                { sourceId: "beta-only", title: "Beta only", status: "done" },
              ],
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const betaMd = files.get("projB-project-beta.md")!
    const { body } = extractFrontmatter(betaMd)
    const tree = parseMarkdown(body)

    // The reference project's markdown should still parse into a valid list
    const list = tree.children.find((n): n is List => n.type === "list")!
    expect(list).toBeDefined()
    // Should have 2 list items: the reference line and the beta-only task
    expect(list.children).toHaveLength(2)

    // The reference line (→ [[^shared-rt]]) parses as a regular list item
    const refLi = list.children[0]! as ListItem
    expect(refLi.type).toBe("listItem")

    // The non-shared task parses normally
    const betaLi = list.children[1]! as ListItem
    expect(betaLi.type).toBe("listItem")
    expect(betaLi.checked).toBe(true)
  })

  test("metadata fields roundtrip through parser", () => {
    const data = makeImportData([
      {
        sourceId: "meta-task",
        title: "Metadata task",
        dueAt: "2026-03-15",
        startAt: "2026-03-01",
        priority: 2,
        assignee: "alice-smith",
        tags: ["backend", "urgent"],
        createdAt: "2026-02-01T09:00:00Z",
      },
    ])

    const files = convert(data)
    const md = files.get("proj-rt-test-project.md")!

    // Find the task line in the markdown
    const taskLine = md.split("\n").find((l) => l.includes("Metadata task"))!
    expect(taskLine).toBeDefined()

    // parseTaskMetadata extracts due, start, priority
    const meta = parseTaskMetadata(taskLine)
    expect(meta.dueDate).toBe("2026-03-15")
    expect(meta.scheduledDate).toBe("2026-03-01")
    expect(meta.priority).toBe(2)

    // extractMentions for assignee
    const mentions = extractMentions(taskLine)
    expect(mentions).toContain("alice-smith")

    // extractTags for tags
    const tags = extractTags(taskLine)
    expect(tags).toContain("backend")
    expect(tags).toContain("urgent")

    // Block ID present
    expect(taskLine).toContain("^meta-task")
  })

  test("frontmatter roundtrip", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-01-15T10:30:00Z",
      projects: [
        {
          sourceId: "proj-fm",
          title: "Frontmatter Test",
          workspace: "My Workspace",
          owner: "Bjorn",
          team: "Engineering",
          createdAt: "2025-12-01T00:00:00Z",
          modifiedAt: "2026-01-10T12:00:00Z",
          sections: [{ sourceId: "s1", title: "Tasks", items: [{ sourceId: "t1", title: "A task" }] }],
        },
      ],
    }

    const files = convert(data)
    const md = files.get("proj-fm-frontmatter-test.md")!

    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).not.toBeNull()

    // Verify all frontmatter fields are preserved (YAML serializer doesn't quote simple values)
    expect(frontmatter).toContain("imported_from: asana")
    expect(frontmatter).toContain("imported_at: 2026-01-15T10:30:00Z")
    expect(frontmatter).toContain("asana_project_id: proj-fm")
    expect(frontmatter).toContain("workspace: My Workspace")
    expect(frontmatter).toContain("owner: Bjorn")
    expect(frontmatter).toContain("team: Engineering")
    expect(frontmatter).toContain("created_at: 2025-12-01T00:00:00Z")
    expect(frontmatter).toContain("modified_at: 2026-01-10T12:00:00Z")

    // Body should still parse as valid markdown with heading + list
    const tree = parseMarkdown(body)
    const heading = tree.children.find((n): n is Heading => n.type === "heading" && n.depth === 1)
    expect(heading).toBeDefined()
  })
})
