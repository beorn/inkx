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
import { fetchFromAsana as _fetchFromAsana } from "../../src/import/adapters/asana-api.ts"
import { parseAsanaFile } from "../../src/import/adapters/asana-file.ts"

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
    expect(task1.activityLog![0]!.text).toBe("Alice Smith moved this task to To Do")
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
    // HTML notes converted to markdown with bullets in body paragraph
    expect(edge).toMatch(/\s+\*\s+First option/)
    expect(edge).not.toMatch(/>\s+\*\s+First option/)
    // Multi-line comment has continuation lines
    expect(edge).toContain("@alice-smith: First line of feedback")
    // All-metadata task
    expect(edge).toContain("- [x] Comprehensive task")
    expect(edge).toContain("@alice-smith")
    expect(edge).toContain("due:: 2026-02-15")
    expect(edge).toContain("p:: 2")
  })

  test("converts Asana URLs to block references in markdown", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    const edge = files.get("proj-3-edge-cases.md")!
    // The html_notes for task-links contain Asana URLs that should be converted
    // to [[^GID|text]] references in the final markdown, preserving link text as alias
    expect(edge).toContain("[[^789012|Related task]]")
    expect(edge).toContain("[[^222333|Another task]]")
    expect(edge).not.toContain("app.asana.com")
  })

  test("includes workspace in frontmatter", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    const sprint = files.get("proj-1-sprint-4.md")!
    expect(sprint).toContain("workspace: Test Workspace")
  })

  test("multi-project tasks show +project tags for other projects", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir: e2eDownloadDir,
    })

    const files = convert(data)
    // task-full is in proj-3 (primary) AND proj-1 — should show +sprint-4 tag
    const edge = files.get("proj-3-edge-cases.md")!
    expect(edge).toContain("- [x] Comprehensive task")
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

  test("fetches orphan tasks from user task lists", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeUserTaskLists: true,
    })

    // Should have 3 projects + 1 user task list (user-2 has 0 orphans)
    const userProj = data.projects.find((p) => p.sourceId === "user-user-1")
    expect(userProj).toBeDefined()
    expect(userProj!.title).toBe("@Test User")

    // Only orphan task (not task-1 which is in Sprint 4)
    const allItems = [...(userProj!.items ?? []), ...(userProj!.sections ?? []).flatMap((s) => s.items)]
    expect(allItems).toHaveLength(1)
    expect(allItems[0]!.title).toBe("Personal reminder")

    // Orphan task should be grouped under its assignee_section ("Recently assigned")
    expect(userProj!.sections).toHaveLength(1)
    expect(userProj!.sections![0]!.title).toBe("Recently assigned")
    expect(userProj!.sections![0]!.items).toHaveLength(1)
    expect(userProj!.sections![0]!.items[0]!.title).toBe("Personal reminder")
    // No loose items — all tasks should be in sections
    expect(userProj!.items ?? []).toHaveLength(0)
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

  test("deduplicates tasks across user task lists and tag task lists", async () => {
    const data = await fetchFromAsana({
      token: "fake-token",
      downloadDir,
      includeUserTaskLists: true,
      includeTagTaskLists: true,
    })

    // task-orphan-1 appears in user task list, task-tag-orphan in tag list
    // Neither should be duplicated
    const allSourceIds = data.projects.flatMap((p) => {
      const items = [...(p.items ?? []), ...(p.sections ?? []).flatMap((s) => s.items)]
      return items.map((i) => i.sourceId)
    })
    const uniqueIds = new Set(allSourceIds)
    expect(allSourceIds.length).toBe(uniqueIds.size)
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
