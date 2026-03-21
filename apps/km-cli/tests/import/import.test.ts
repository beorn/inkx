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
import { convert, convertBatch } from "../../src/import/convert.ts"
import { writeFiles } from "../../src/import/write.ts"
import { fetchFromAsana as _fetchFromAsana } from "../../src/import/adapters/asana/asana-api.ts"
import { parseAsanaFile } from "../../src/import/adapters/asana/asana-file.ts"

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
    const wsMeta = JSON.parse(readFileSync(join(downloadDir, "_workspace.json"), "utf-8")) as {
      teams: Array<{ name: string }>
      users: Array<{ name: string }>
    }
    expect(wsMeta.teams).toHaveLength(1)
    expect(wsMeta.teams[0]!.name).toBe("Engineering")
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

  test("captures project memberships with section context", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.projectMemberships).toEqual([
      { project: "Sprint 4", section: "To Do" },
      { project: "Product Backlog", section: "Backlog" },
    ])
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
    expect(task1.priority).toBe("P1")
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

  test("captures system activity log separately from comments", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeComments: true,
    })

    const task1 = data.projects[0]!.sections![0]!.items[0]!
    // System story (type: "system") captured in activityLog
    expect(task1.activityLog).toBeDefined()
    expect(task1.activityLog).toHaveLength(1)
    expect(task1.activityLog![0]!.text).toBe("moved this task to To Do")
    expect(task1.activityLog![0]!.author).toBe("alice-smith")
    expect(task1.activityLog![0]!.createdAt).toBe("2026-02-15T09:00:00Z")
  })

  test("fetches project status updates", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const sprint = data.projects[0]!
    expect(sprint.statusUpdates).toBeDefined()
    expect(sprint.statusUpdates).toHaveLength(2)
    expect(sprint.statusUpdates![0]!.title).toBe("Sprint 4 on track")
    expect(sprint.statusUpdates![0]!.color).toBe("green")
    expect(sprint.statusUpdates![0]!.author).toBe("Test User")
    expect(sprint.statusUpdates![0]!.text).toContain("Design review completed")
    expect(sprint.statusUpdates![1]!.title).toBe("Sprint 4 at risk")
    expect(sprint.statusUpdates![1]!.color).toBe("yellow")
  })

  test("fetches custom field definitions", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    const sprint = data.projects[0]!
    expect(sprint.customFieldSettings).toBeDefined()
    expect(sprint.customFieldSettings).toHaveLength(2)
    expect(sprint.customFieldSettings![0]!.name).toBe("Priority")
    expect(sprint.customFieldSettings![0]!.type).toBe("number")
    expect(sprint.customFieldSettings![0]!.description).toBe("Task priority level")
    expect(sprint.customFieldSettings![0]!.precision).toBe(0)
    expect(sprint.customFieldSettings![1]!.name).toBe("Stage")
    expect(sprint.customFieldSettings![1]!.type).toBe("enum")
    expect(sprint.customFieldSettings![1]!.enumOptions).toEqual(["Planning", "In Progress", "Review", "Done"])
  })

  test("omits statusUpdates/customFieldSettings when empty", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    // proj-2 and proj-3 have empty status/custom field responses
    const backlog = data.projects.find((p) => p.sourceId === "proj-2")!
    expect(backlog.statusUpdates).toBeUndefined()
    expect(backlog.customFieldSettings).toBeUndefined()
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
    expect(task1.attachments![0]!.createdAt).toBe("2025-06-15T10:30:00.000Z")
  })

  test("records API calls when record is true", async () => {
    const result = (await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      record: true,
    })) as unknown as import("../../src/import/adapters/asana/asana-types.ts").FetchResult

    expect(result.recorded).toBeDefined()
    expect(result.recorded!.length).toBeGreaterThan(0)
    // Should have calls for: /users/me, /projects, /projects/:id/sections x2, /tasks x2, /tasks/:id/subtasks
    expect(result.recorded!.some((r: { path: string }) => r.path === "/users/me")).toBe(true)
    expect(result.recorded!.some((r: { path: string }) => r.path === "/projects")).toBe(true)
  })

  test("converts html_notes with bullets via mdast", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const htmlTask = edge.sections![0]!.items.find((i) => i.sourceId === "task-html")!
    expect(htmlTask.body).toContain("Planning notes:")
    // mdast converts <li> to "- " bullets
    expect(htmlTask.body).toMatch(/-\s+First option/)
    expect(htmlTask.body).toContain("Additional context here.")
  })

  test("preserves Asana internal links in html_notes after HTML→MD conversion", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const linkTask = edge.sections![0]!.items.find((i) => i.sourceId === "task-links")!
    // HTML→MD converts <a> to markdown links; Asana URLs stay as-is until convert stage
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
    expect(full.priority).toBe("P2")
    expect(full.tags).toEqual(["backend", "urgent"])
    expect(full.projects).toEqual(["Edge Cases", "Sprint 4"])
    expect(full.permalink).toBe("https://app.asana.com/0/proj-3/task-full")
    expect(full.children).toHaveLength(1)
    expect(full.children![0]!.title).toBe("Sub-step one")
    expect(full.comments).toHaveLength(1)
    expect(full.attachments).toHaveLength(1)
    expect(full.body).toContain("bold")
  })

  test("fetches nested subtasks 2+ levels deep", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    // Level 1: task-full -> sub-full-1
    expect(full.children).toHaveLength(1)
    const sub1 = full.children![0]!
    expect(sub1.title).toBe("Sub-step one")
    // Level 2: sub-full-1 -> sub-full-1a
    expect(sub1.children).toHaveLength(1)
    expect(sub1.children![0]!.title).toBe("Deep subtask")
    expect(sub1.children![0]!.body).toBe("Nested detail")
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

  test("dependencies and dependents are preserved in metadata", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    expect(full.metadata?.dependencies).toEqual([{ gid: "task-1", name: "Design login page" }])
    expect(full.metadata?.dependents).toEqual([{ gid: "task-3", name: "API spec review" }])
  })

  test("is_rendered_as_separator flag is preserved in metadata", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const sep = edge.sections![0]!.items.find((i) => i.sourceId === "task-separator")!
    expect(sep).toBeDefined()
    expect(sep.metadata?.isSeparator).toBe(true)
  })

  test("parent field is preserved on subtasks", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    // Subtasks of task-1
    const sprint = data.projects[0]!
    const task1 = sprint.sections![0]!.items[0]!
    expect(task1.children![0]!.metadata?.parentGid).toBe("task-1")
    expect(task1.children![0]!.metadata?.parentName).toBe("Design login page")

    // Subtasks of task-full
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    expect(full.children![0]!.metadata?.parentGid).toBe("task-full")
    expect(full.children![0]!.metadata?.parentName).toBe("Comprehensive task")
  })

  test("external field is preserved in metadata", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    expect(full.metadata?.external).toEqual({ gid: "EXT-123", data: '{"jira_key":"PROJ-456"}' })
  })

  test("varied custom_fields types are all captured in metadata", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    const cf = full.metadata?.customFields as Record<string, string | number>
    expect(cf).toBeDefined()
    expect(cf.Priority).toBe(2)
    // display_value takes precedence over enum_value for Stage
    expect(cf.Stage).toBe("In Progress")
    expect(cf["Sprint Goal"]).toBe("Ship v2.0 beta")
    expect(cf.Labels).toBe("Backend, API")
  })

  test("recurring task name with ^ref is cleaned and parent stored", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const recur = edge.sections![0]!.items.find((i) => i.sourceId === "task-recur")!
    // The → ^numericId suffix should be stripped from the title
    expect(recur.title).toBe("Weekly standup")
    // Parent task GID stored in metadata
    expect(recur.metadata?.parentTaskGid).toBe("1234567890123")
    // Also has parent field from the API
    expect(recur.metadata?.parentGid).toBe("1234567890123")
    expect(recur.metadata?.parentName).toBe("Weekly standup")
  })

  test("html headings in notes are preserved (rebased during convert phase)", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    const edge = data.projects[2]!
    const htmlH = edge.sections![0]!.items.find((i) => i.sourceId === "task-html-headings")!
    expect(htmlH.body).toBeDefined()
    // Headings are preserved in body (they'll be rebased to proper depth during convert)
    expect(htmlH.body).toContain("# Requirements")
    expect(htmlH.body).toContain("## Notes")
    expect(htmlH.body).toContain("Must support X.")
    expect(htmlH.body).toContain("Extra info.")
    // Raw HTML is also preserved for re-conversion
    expect(htmlH.htmlBody).toBeDefined()
    expect(htmlH.htmlBody).toContain("<h1>Requirements</h1>")
  })

  test("modified_at timestamps are preserved on tasks", async () => {
    const data = await fetchFromAsana({ token: "fake-token", downloadDir })
    // task-1 in Sprint 4
    const task1 = data.projects[0]!.sections![0]!.items[0]!
    expect(task1.modifiedAt).toBe("2026-02-18T16:00:00Z")

    // task-full in Edge Cases
    const edge = data.projects[2]!
    const full = edge.sections![0]!.items.find((i) => i.sourceId === "task-full")!
    expect(full.modifiedAt).toBe("2026-02-10T17:30:00Z")

    // Subtasks also have modified_at
    const sub1 = data.projects[0]!.sections![0]!.items[0]!.children![0]!
    expect(sub1.modifiedAt).toBe("2026-02-17T12:00:00Z")
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
// Stage 2: Download Attachments
// ============================================================================

describe("Stage 2: Download Attachments", () => {
  const testDir = "/tmp/km-download-att-test-" + Date.now()

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  test("sets file mtime to attachment createdAt timestamp", async () => {
    const { downloadAttachments } = await import("../../src/import/download-attachments.ts")
    const { statSync } = await import("fs")

    // Create a tiny HTTP server to serve a fake file
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("fake-file-content")
      },
    })

    const createdAt = "2025-06-15T10:30:00.000Z"
    const data: import("../../src/import/types.ts").ImportData = {
      source: "test",
      fetchedAt: createdAt,
      projects: [
        {
          sourceId: "proj-1",
          title: "Test Project",
          sections: [
            {
              sourceId: "section-1",
              title: "Section 1",
              items: [
                {
                  sourceId: "task-1",
                  title: "Task with attachment",
                  attachments: [
                    {
                      sourceId: "att-1",
                      name: "photo.png",
                      url: `http://localhost:${server.port}/photo.png`,
                      type: "image",
                      createdAt,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    await downloadAttachments(data, { dir: testDir })

    const filePath = join(testDir, "att-1.png")
    expect(existsSync(filePath)).toBe(true)

    const stat = statSync(filePath)
    const expectedTime = new Date(createdAt).getTime()
    // mtime should match the createdAt timestamp (within 1 second tolerance)
    expect(Math.abs(stat.mtimeMs - expectedTime)).toBeLessThan(1000)

    server.stop()
  })

  test("leaves default mtime when createdAt is absent", async () => {
    const { downloadAttachments } = await import("../../src/import/download-attachments.ts")
    const { statSync } = await import("fs")

    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("fake-file-content")
      },
    })

    const beforeMs = Date.now()
    const data: import("../../src/import/types.ts").ImportData = {
      source: "test",
      fetchedAt: new Date().toISOString(),
      projects: [
        {
          sourceId: "proj-1",
          title: "Test Project",
          sections: [
            {
              sourceId: "section-1",
              title: "Section 1",
              items: [
                {
                  sourceId: "task-1",
                  title: "Task with attachment",
                  attachments: [
                    {
                      sourceId: "att-2",
                      name: "doc.pdf",
                      url: `http://localhost:${server.port}/doc.pdf`,
                      type: "file",
                      // no createdAt
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    await downloadAttachments(data, { dir: testDir })

    const filePath = join(testDir, "att-2.pdf")
    expect(existsSync(filePath)).toBe(true)

    const stat = statSync(filePath)
    // mtime should be close to "now" (within 5 seconds)
    expect(stat.mtimeMs).toBeGreaterThanOrEqual(beforeMs - 1000)

    server.stop()
  })

  test("downloads inline images from body text and replaces URLs with local paths", async () => {
    const { downloadAttachments } = await import("../../src/import/download-attachments.ts")

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/inline-image.png") {
          return new Response("fake-png-data")
        }
        return new Response("Not found", { status: 404 })
      },
    })

    const inlineImageUrl = `http://localhost:${server.port}/inline-image.png`
    const data: import("../../src/import/types.ts").ImportData = {
      source: "test",
      fetchedAt: new Date().toISOString(),
      projects: [
        {
          sourceId: "proj-1",
          title: "Test Project",
          sections: [
            {
              sourceId: "sec-1",
              title: "Section 1",
              items: [
                {
                  sourceId: "task-1",
                  title: "Task with inline image",
                  body: `Here is an image:\n\n![screenshot](${inlineImageUrl})\n\nAnd some text after.`,
                },
              ],
            },
          ],
        },
      ],
    }

    const relPath = "attachments"
    await downloadAttachments(data, { dir: testDir, relativePath: relPath })

    // Body should have URL replaced with local path
    const item = data.projects[0]!.sections![0]!.items[0]!
    expect(item.body).not.toContain(inlineImageUrl)
    expect(item.body).toContain(`![screenshot](${relPath}/`)
    expect(item.body).toContain(".png)")

    server.stop()
  })

  test("does not duplicate-download inline images that are already attachments", async () => {
    const { downloadAttachments } = await import("../../src/import/download-attachments.ts")

    let downloadCount = 0
    const server = Bun.serve({
      port: 0,
      fetch() {
        downloadCount++
        return new Response("fake-data")
      },
    })

    const imageUrl = `http://localhost:${server.port}/photo.png`
    const data: import("../../src/import/types.ts").ImportData = {
      source: "test",
      fetchedAt: new Date().toISOString(),
      projects: [
        {
          sourceId: "proj-1",
          title: "Test Project",
          sections: [
            {
              sourceId: "sec-1",
              title: "Section 1",
              items: [
                {
                  sourceId: "task-1",
                  title: "Task with image in body AND attachments",
                  body: `See ![photo](${imageUrl})`,
                  attachments: [
                    {
                      sourceId: "att-existing",
                      name: "photo.png",
                      url: imageUrl,
                      type: "image",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    await downloadAttachments(data, { dir: testDir })

    // Should only download once (the existing attachment), not duplicate for inline
    expect(downloadCount).toBe(1)

    server.stop()
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

    // Verify Sprint 4 file (FakeAsana uses gid="proj-1", team="Engineering", workspace="Test Workspace")
    const sprint = readFileSync(join(testDir, "test-workspace", "engineering", "sprint-4.md"), "utf-8")
    expect(sprint).toContain("# Sprint 4")
    expect(sprint).toContain("## To Do")
    // Tasks are headings now (oi type) with task markers
    expect(sprint).toContain("## [ ] Design login page")
    expect(sprint).toContain("### [ ] Create wireframes")
    expect(sprint).toContain("### [x] Review with team")
    expect(sprint).toContain("## Done")
    expect(sprint).toContain("## [x] Write tests")

    // Verify Product Backlog file (no team)
    const backlog = readFileSync(join(testDir, "test-workspace", "product-backlog.md"), "utf-8")
    expect(backlog).toContain("# Product Backlog")
    expect(backlog).toContain("### [ ] API spec review")

    // Verify Edge Cases file (no team)
    const edge = readFileSync(join(testDir, "test-workspace", "edge-cases.md"), "utf-8")
    expect(edge).toContain("# Edge Cases")
    expect(edge).toContain("## Active")
    expect(edge).toContain("## ------------------")
    expect(edge).toContain("## Milestones")
    // Milestone renders with diamond marker (as heading) and task marker
    expect(edge).toContain("## [ ] ◆ Beta release")
    // HTML notes converted to markdown with bullets in body paragraph (mdast uses - bullets)
    expect(edge).toMatch(/-\s+First option/)
    expect(edge).not.toMatch(/>\s+-\s+First option/)
    // Comments are skipped by default (skipActivities: true)
    expect(edge).not.toContain("## Comments")
    expect(edge).not.toContain("First line of feedback")
    // All-metadata task (as heading under section, depth 3)
    expect(edge).toContain("### [x] Comprehensive task")
    expect(edge).toContain("@alice-smith")
  })

  test("converts Asana URLs to block references in markdown", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    const edge = files.get("test-workspace/edge-cases.md")!
    // The html_notes for task-links contain Asana URLs that should be converted
    // to [[^GID]] block references in the final markdown (no aliases)
    expect(edge).toContain("[[^789012]]")
    expect(edge).toContain("[[^222333]]")
    expect(edge).not.toContain("app.asana.com")
  })

  test("does not include workspace in frontmatter", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    const sprint = files.get("test-workspace/engineering/sprint-4.md")!
    expect(sprint).not.toContain("workspace:")
  })

  test("multi-project tasks show +project tags for other projects", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    // task-full is in proj-3 (primary) AND proj-1 — should show +sprint-4 tag
    const edge = files.get("test-workspace/edge-cases.md")!
    expect(edge).toContain("### [x] Comprehensive task")
    expect(edge).toContain("+sprint-4")
  })
})

// ============================================================================
// Resume: empty project re-fetch
// ============================================================================

describe("Resume: re-fetches empty projects from disk", () => {
  let fake: FakeAsana
  let restore: () => void
  const downloadDir = "/tmp/km-resume-test-" + Date.now()

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

  test("re-fetches project when saved JSON has 0 items", async () => {
    // Pre-seed download dir with an empty project JSON (simulates the bug)
    mkdirSync(downloadDir, { recursive: true })
    const emptyProject = {
      sourceId: "proj-1",
      title: "Sprint 4",
      workspace: "Test Workspace",
    }
    fsWriteFileSync(join(downloadDir, "proj-1-sprint-4.json"), JSON.stringify(emptyProject, null, 2))
    // Also seed workspace meta so it doesn't try to re-fetch
    fsWriteFileSync(
      join(downloadDir, "_workspace.json"),
      JSON.stringify({
        gid: "ws-1",
        name: "Test Workspace",
        user: { gid: "user-1", name: "Test User", email: "test@example.com" },
        teams: [{ gid: "team-1", name: "Engineering" }],
        users: [{ gid: "user-1", name: "Test User" }],
      }),
    )

    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    // Sprint 4 should have been re-fetched and now have items
    const sprint = data.projects.find((p) => p.sourceId === "proj-1")!
    expect(sprint).toBeDefined()
    expect(sprint.sections).toBeDefined()
    expect(sprint.sections!.length).toBeGreaterThan(0)
    const totalItems = sprint.sections!.reduce((n, s) => n + s.items.length, 0)
    expect(totalItems).toBeGreaterThan(0)
  })

  test("does not re-fetch project when saved JSON has items", async () => {
    // First fetch to populate the download dir
    await fetchFromAsana({ token: "fake-token", downloadDir })
    const callCount1 = fake.calls.length

    // Reset and resume — all projects should be skipped
    fake.calls.length = 0
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
    })

    expect(data.projects).toHaveLength(3)
    // Should not have made any task-fetching calls (only /users/me and /projects for discovery)
    const taskCalls = fake.calls.filter((c) => c.path === "/tasks")
    expect(taskCalls).toHaveLength(0)
  })
})

// ============================================================================
// User task lists (orphan tasks) and tag task lists
// ============================================================================

describe("User task lists and tag task lists", () => {
  const downloadDir = "/tmp/km-usertasks-test-" + Date.now()
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
    if (existsSync(downloadDir)) rmSync(downloadDir, { recursive: true })
  })

  test("fetches all tasks from user task lists (not just orphans)", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeUserTaskLists: true,
    })

    // Should have 3 projects + 1 user task list (user-2 has 0 tasks)
    const userProj = data.projects.find((p) => p.sourceId === "user-user-1")
    expect(userProj).toBeDefined()
    expect(userProj!.title).toBe("@Test User")

    // All tasks visible to us (including those in projects — converter handles dedup)
    const allItems = [...(userProj!.items ?? []), ...(userProj!.sections ?? []).flatMap((s) => s.items)]
    expect(allItems.length).toBeGreaterThanOrEqual(1)
    expect(allItems.find((i) => i.title === "Personal reminder")).toBeDefined()
  })

  test("fetches orphan tasks from tag task lists", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeTagTaskLists: true,
    })

    // Should have a tag project for @PA with orphan task
    const tagProj = data.projects.find((p) => p.sourceId === "tag-tag-pa")
    expect(tagProj).toBeDefined()
    expect(tagProj!.title).toBe("#@PA")

    const allItems = [...(tagProj!.items ?? []), ...(tagProj!.sections ?? []).flatMap((s) => s.items)]
    expect(allItems).toHaveLength(1)
    expect(allItems[0]!.title).toBe("PA follow-up")

    // empty-tag should NOT have a project (0 orphans, task-1 already in Sprint 4)
    const emptyTagProj = data.projects.find((p) => p.sourceId === "tag-tag-empty")
    expect(emptyTagProj).toBeUndefined()
  })

  test("user task lists include project tasks (converter handles dedup)", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeUserTaskLists: true,
      includeTagTaskLists: true,
    })

    // User task lists now include ALL tasks (not just orphans).
    // Tasks in both projects and user lists will have the same sourceId —
    // this is expected, the converter deduplicates at render time via embeds.
    const userProj = data.projects.find((p) => p.sourceId === "user-user-1")
    expect(userProj).toBeDefined()
    const userItems = [...(userProj!.items ?? []), ...(userProj!.sections ?? []).flatMap((s) => s.items)]
    expect(userItems.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Batch convert (streaming) and tag aggregate files
// ============================================================================

describe("Batch convert and tag aggregation", () => {
  const testDir = "/tmp/km-batch-test-" + Date.now()
  const batchDownloadDir = "/tmp/km-batch-dl-" + Date.now()
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
    if (existsSync(batchDownloadDir)) rmSync(batchDownloadDir, { recursive: true })
  })

  test("convertBatch yields same files as convert", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: batchDownloadDir,
      includeComments: true,
      includeAttachments: true,
    })

    const mapResult = convert(data)
    const batchResult = new Map<string, string>()
    for (const [filename, markdown] of convertBatch(data)) {
      batchResult.set(filename, markdown)
    }

    // Same project files
    const projectFiles = [...mapResult.keys()].filter((f) => !f.startsWith("#"))
    for (const file of projectFiles) {
      expect(batchResult.has(file)).toBe(true)
      expect(batchResult.get(file)).toBe(mapResult.get(file))
    }
  })

  test("convertBatch generates #tag.md aggregate files for multi-use tags", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: batchDownloadDir,
    })

    const files = new Map<string, string>()
    for (const [filename, markdown] of convertBatch(data)) {
      files.set(filename, markdown)
    }

    // "backend" tag is used on task-full only (1 item) — should NOT generate a file
    expect(files.has("#backend.md")).toBe(false)

    // Check that tag files contain cross-references (not full content)
    const tagFiles = [...files.keys()].filter((f) => f.startsWith("#"))
    for (const tagFile of tagFiles) {
      const content = files.get(tagFile)!
      expect(content).toContain("tag:")
    }
  })

  test("writeFiles accepts convertBatch generator directly", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: batchDownloadDir,
    })

    // writeFiles should work with the generator (Iterable<[string, string]>)
    const { written } = writeFiles(convertBatch(data), { outDir: testDir })
    expect(written.length).toBeGreaterThanOrEqual(3) // at least 3 project files

    // Verify files exist on disk
    for (const file of written) {
      expect(existsSync(join(testDir, file))).toBe(true)
    }
  })
})
