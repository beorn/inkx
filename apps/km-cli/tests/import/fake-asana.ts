/**
 * FakeAsana — Mock Asana API for testing
 *
 * Intercepts fetch calls to app.asana.com and returns fixture data.
 * Matches requests by path (ignoring GID differences for subtask/story/attachment routes).
 *
 * Usage:
 *   const fake = createFakeAsana({ recordings })
 *   const restore = fake.install()
 *   // ... run import code that calls fetch() ...
 *   restore()
 *   expect(fake.calls).toHaveLength(5)
 */

import type { RecordedCall } from "../../src/import/adapters/asana/asana-api.ts"

export interface FakeAsanaOptions {
  /** Recorded API calls to replay (from --record) */
  recordings?: RecordedCall[]
  /** Static route handlers: path → response data */
  routes?: Record<string, unknown>
}

interface FakeCall {
  path: string
  params: Record<string, string>
}

export interface FakeAsana {
  /** All calls made to the fake */
  calls: FakeCall[]
  /** Install fake fetch globally, returns restore function */
  install: () => () => void
}

/**
 * Create a FakeAsana that intercepts fetch calls to app.asana.com
 */
export function createFakeAsana(options: FakeAsanaOptions = {}): FakeAsana {
  const { recordings = [], routes = {} } = options
  const calls: FakeCall[] = []

  // Build lookup: exact "path|sorted-params" → response
  // Plus path-only fallback for routes
  const exactIndex = new Map<string, unknown>()
  for (const rec of recordings) {
    const key = makeKey(rec.path, rec.params)
    exactIndex.set(key, rec.response)
  }

  // For pattern matching (e.g. /tasks/123/subtasks → /tasks/:id/subtasks)
  // Group recordings by normalized path pattern
  const patternIndex = new Map<string, unknown[]>()
  for (const rec of recordings) {
    const pattern = rec.path.replace(/\/\d+\//g, "/:id/").replace(/\/\d+$/, "/:id")
    if (!patternIndex.has(pattern)) patternIndex.set(pattern, [])
    patternIndex.get(pattern)!.push(rec.response)
  }
  // Track consumption index per pattern
  const patternCursors = new Map<string, number>()

  // Infrastructure params that don't affect which resource is returned
  const INFRA_PARAMS = new Set(["opt_fields", "limit", "offset", "completed_since"])

  function resolve(path: string, params: Record<string, string>): unknown {
    // 1. Exact match from recordings (path + params)
    const key = makeKey(path, params)
    if (exactIndex.has(key)) return exactIndex.get(key)

    // 2. Path + key params match (ignore opt_fields/limit/offset/completed_since)
    for (const rec of recordings) {
      if (rec.path !== path) continue
      const recKeyParams = Object.entries(rec.params ?? {}).filter(([k]) => !INFRA_PARAMS.has(k))
      if (recKeyParams.length === 0) return rec.response // no key params = wildcard
      if (recKeyParams.every(([k, v]) => params[k] === v)) return rec.response
    }

    // 3. Static routes
    if (routes[path] !== undefined) return routes[path]

    // 4. Pattern match for GID-based paths (e.g. /tasks/123/stories)
    const pattern = path.replace(/\/\d+\//g, "/:id/").replace(/\/\d+$/, "/:id")
    const responses = patternIndex.get(pattern)
    if (responses && responses.length > 0) {
      const cursor = patternCursors.get(pattern) ?? 0
      const response = responses[cursor % responses.length]
      patternCursors.set(pattern, cursor + 1)
      return response
    }

    // 5. Default: return empty array (safe for list endpoints)
    return []
  }

  function install(): () => void {
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url)

      // Only intercept Asana API calls
      if (!url.hostname.includes("asana.com")) {
        return originalFetch(input, _init)
      }

      const path = url.pathname.replace("/api/1.0", "")
      const params: Record<string, string> = {}
      url.searchParams.forEach((v, k) => {
        params[k] = v
      })

      calls.push({ path, params })

      const data = resolve(path, params)
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    return () => {
      globalThis.fetch = originalFetch
    }
  }

  return { calls, install }
}

function makeKey(path: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return path
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")
  return `${path}|${sorted}`
}

// ============================================================================
// Minimal fixture for unit tests (no real data dependency)
// ============================================================================

/** Synthetic Asana workspace with 2 projects, comments, attachments, multi-project tasks */
export function minimalFixtures(): FakeAsanaOptions {
  return {
    routes: {
      "/users/me": {
        gid: "user-1",
        name: "Test User",
        email: "test@example.com",
        workspaces: [{ gid: "ws-1", name: "Test Workspace" }],
      },
      "/projects": [
        {
          gid: "proj-1",
          name: "Sprint 4",
          created_at: "2026-01-01T00:00:00Z",
          modified_at: "2026-02-15T10:00:00Z",
          owner: { name: "Test User" },
          team: { name: "Engineering" },
        },
        { gid: "proj-2", name: "Product Backlog", created_at: "2025-12-01T00:00:00Z" },
        { gid: "proj-3", name: "Edge Cases", created_at: "2026-02-01T00:00:00Z" },
      ],
      "/workspaces/ws-1/teams": [{ gid: "team-1", name: "Engineering", description: "The engineering team" }],
      "/workspaces/ws-1/users": [
        { gid: "user-1", name: "Test User", email: "test@example.com" },
        { gid: "user-2", name: "Alice Smith", email: "alice@example.com" },
      ],
      // User task list endpoints
      "/users/user-1/user_task_list": { gid: "utl-1" },
      "/users/user-2/user_task_list": { gid: "utl-2" },
      // Tags
      "/tags": [
        { gid: "tag-pa", name: "@PA" },
        { gid: "tag-empty", name: "empty-tag" },
      ],
    },
    recordings: [
      // --- proj-1: Sprint 4 ---
      {
        path: "/projects/proj-1/sections",
        params: { opt_fields: "name" },
        response: [
          { gid: "sec-todo", name: "To Do" },
          { gid: "sec-done", name: "Done" },
        ],
      },
      // Project status updates for proj-1
      {
        path: "/projects/proj-1/project_statuses",
        response: [
          {
            title: "Sprint 4 on track",
            text: "All tasks progressing well. Design review completed.",
            color: "green",
            author: { name: "Test User" },
            created_at: "2026-02-14T10:00:00Z",
            modified_at: "2026-02-14T10:00:00Z",
          },
          {
            title: "Sprint 4 at risk",
            text: "API integration delayed due to dependency.",
            color: "yellow",
            author: { name: "Alice Smith" },
            created_at: "2026-02-10T09:00:00Z",
            modified_at: "2026-02-10T09:00:00Z",
          },
        ],
      },
      // Custom field settings for proj-1
      {
        path: "/projects/proj-1/custom_field_settings",
        response: [
          {
            custom_field: {
              name: "Priority",
              type: "number",
              description: "Task priority level",
              precision: 0,
            },
          },
          {
            custom_field: {
              name: "Stage",
              type: "enum",
              description: "Development stage",
              enum_options: [{ name: "Planning" }, { name: "In Progress" }, { name: "Review" }, { name: "Done" }],
            },
          },
        ],
      },
      {
        path: "/tasks",
        params: { project: "proj-1" },
        response: [
          {
            gid: "task-1",
            name: "Design login page",
            notes: "Create wireframes\nReview with team",
            completed: false,
            created_at: "2026-02-10T08:00:00Z",
            modified_at: "2026-02-18T16:00:00Z",
            completed_at: null,
            due_on: "2026-03-01",
            due_at: null,
            start_on: "2026-02-15",
            assignee: { name: "Alice Smith" },
            tags: [{ name: "design" }, { name: "frontend" }],
            custom_fields: [{ name: "Priority", number_value: 1 }],
            num_subtasks: 2,
            memberships: [
              { project: { gid: "proj-1", name: "Sprint 4" }, section: { gid: "sec-todo", name: "To Do" } },
              { project: { gid: "proj-2", name: "Product Backlog" }, section: { gid: "sec-bl", name: "Backlog" } },
            ],
          },
          {
            gid: "task-2",
            name: "Write tests",
            notes: "",
            completed: true,
            created_at: "2026-02-05T10:00:00Z",
            modified_at: "2026-02-09T17:00:00Z",
            completed_at: "2026-02-09T16:30:00Z",
            due_on: "2026-02-10",
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [{ name: "Priority", number_value: 2 }],
            num_subtasks: 0,
            memberships: [{ project: { gid: "proj-1", name: "Sprint 4" }, section: { gid: "sec-done", name: "Done" } }],
          },
        ],
      },
      // Subtasks for task-1
      {
        path: "/tasks/task-1/subtasks",
        response: [
          {
            gid: "sub-1",
            name: "Create wireframes",
            notes: "",
            completed: false,
            modified_at: "2026-02-17T12:00:00Z",
            parent: { gid: "task-1", name: "Design login page" },
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [],
          },
          {
            gid: "sub-2",
            name: "Review with team",
            notes: "",
            completed: true,
            modified_at: "2026-02-16T09:00:00Z",
            parent: { gid: "task-1", name: "Design login page" },
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [],
          },
        ],
      },
      // Stories (comments) for task-1
      {
        path: "/tasks/task-1/stories",
        response: [
          {
            gid: "story-1",
            type: "comment",
            text: "Looks great, minor tweaks needed",
            created_at: "2026-02-16T10:30:00Z",
            created_by: { name: "Bob Jones" },
          },
          {
            gid: "story-2",
            type: "system",
            text: "Alice Smith moved this task to To Do",
            created_at: "2026-02-15T09:00:00Z",
            created_by: { name: "Alice Smith" },
          },
          {
            // Old system-log comment (pre-2020, type=comment — legacy Asana)
            gid: "story-3",
            type: "comment",
            text: "moved this Task from Backlog to To Do",
            created_at: "2019-06-15T14:00:00Z",
            created_by: { name: "Alice Smith" },
          },
          {
            // Consolidated pre-2020 comment with system + real actions separated by dashes
            gid: "story-4",
            type: "comment",
            text: "Bjorn Stabell on Sunday Oct 08, 2017 05:29 AM:\nchanged the due date to Oct 15, 2017\n----------------------\nBjorn Stabell on Saturday Oct 14, 2017 04:00 PM:\nThis is a real comment about the task\n----------------------\nBjorn Stabell on Monday Oct 16, 2017 01:57 AM:\nmarked this task complete",
            created_at: "2018-05-28T00:00:00Z",
            created_by: { name: "Bjorn Stabell" },
          },
        ],
      },
      // Attachments for task-1
      {
        path: "/tasks/task-1/attachments",
        response: [
          {
            gid: "att-1001",
            name: "wireframe.png",
            download_url: "https://asana.com/files/wireframe.png",
            host: "asana",
            created_at: "2025-06-15T10:30:00.000Z",
          },
        ],
      },
      // Empty stories/attachments for remaining tasks
      { path: "/tasks/task-2/stories", response: [] },
      { path: "/tasks/task-2/attachments", response: [] },
      { path: "/tasks/sub-1/stories", response: [] },
      { path: "/tasks/sub-1/attachments", response: [] },
      { path: "/tasks/sub-2/stories", response: [] },
      { path: "/tasks/sub-2/attachments", response: [] },

      // --- proj-2: Product Backlog ---
      {
        path: "/projects/proj-2/sections",
        params: { opt_fields: "name" },
        response: [{ gid: "sec-bl", name: "Backlog" }],
      },
      { path: "/projects/proj-2/project_statuses", response: [] },
      { path: "/projects/proj-2/custom_field_settings", response: [] },
      {
        path: "/tasks",
        params: { project: "proj-2" },
        response: [
          {
            gid: "task-3",
            name: "API spec review",
            notes: "Review the OpenAPI spec for v2",
            completed: false,
            modified_at: "2026-02-15T14:00:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [{ name: "API" }],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-2", name: "Product Backlog" }, section: { gid: "sec-bl", name: "Backlog" } },
            ],
          },
        ],
      },
      { path: "/tasks/task-3/stories", response: [] },
      { path: "/tasks/task-3/attachments", response: [] },

      // --- proj-3: Edge Cases ---
      {
        path: "/projects/proj-3/sections",
        params: { opt_fields: "name" },
        response: [
          { gid: "sec-active", name: "Active" },
          { gid: "sec-separator", name: "------------------" },
          { gid: "sec-milestones", name: "Milestones" },
        ],
      },
      { path: "/projects/proj-3/project_statuses", response: [] },
      { path: "/projects/proj-3/custom_field_settings", response: [] },
      {
        path: "/tasks",
        params: { project: "proj-3" },
        response: [
          // Edge case 1: Rich HTML notes with bullets
          {
            gid: "task-html",
            name: "Plan migration",
            notes: "",
            html_notes:
              '<body><p>Planning notes:</p><ul><li>First option</li><li>Second option with <a href="https://example.com">link</a></li><li>Third option</li></ul><p>Additional context here.</p></body>',
            completed: false,
            created_at: "2026-02-12T09:00:00Z",
            modified_at: "2026-02-12T10:00:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
          // Edge case 2: Asana internal links in html_notes (numeric GIDs like real Asana)
          {
            gid: "task-links",
            name: "Cross-reference task",
            notes: "",
            html_notes:
              '<body>See also: <a href="https://app.asana.com/0/123456/789012">Related task</a> and <a href="https://app.asana.com/1/111/task/222333">Another task</a></body>',
            completed: false,
            created_at: "2026-02-13T10:00:00Z",
            modified_at: "2026-02-13T11:00:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
          // Edge case 3: Task in separator section (Asana uses dashes as section dividers)
          {
            gid: "task-sep",
            name: "Unsorted item",
            notes: "",
            completed: false,
            created_at: "2026-02-13T12:00:00Z",
            modified_at: "2026-02-13T12:30:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              {
                project: { gid: "proj-3", name: "Edge Cases" },
                section: { gid: "sec-separator", name: "------------------" },
              },
            ],
          },
          // Edge case 4: Task rendered as separator
          {
            gid: "task-separator",
            name: "--- Section divider ---",
            notes: "",
            completed: false,
            created_at: "2026-02-13T13:00:00Z",
            modified_at: "2026-02-13T13:00:00Z",
            is_rendered_as_separator: true,
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
          // Edge case 5: Milestone task
          {
            gid: "task-mile",
            name: "Beta release",
            notes: "",
            completed: false,
            created_at: "2026-02-14T08:00:00Z",
            modified_at: "2026-02-14T09:00:00Z",
            resource_subtype: "milestone",
            due_on: "2026-04-01",
            due_at: null,
            start_on: null,
            assignee: { name: "Alice Smith" },
            tags: [{ name: "release" }],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              {
                project: { gid: "proj-3", name: "Edge Cases" },
                section: { gid: "sec-milestones", name: "Milestones" },
              },
            ],
          },
          // Edge case 6: All metadata fields populated
          {
            gid: "task-full",
            name: "Comprehensive task",
            notes: "",
            html_notes: "<body><p>Full description with <strong>bold</strong> text.</p></body>",
            completed: true,
            created_at: "2026-01-15T09:00:00Z",
            modified_at: "2026-02-10T17:30:00Z",
            completed_at: "2026-02-10T17:00:00Z",
            due_on: "2026-02-15",
            due_at: null,
            start_on: "2026-01-20",
            resource_subtype: "default_task",
            permalink_url: "https://app.asana.com/0/proj-3/task-full",
            assignee: { name: "Alice Smith" },
            tags: [{ name: "backend" }, { name: "urgent" }],
            custom_fields: [
              { name: "Priority", number_value: 2 },
              { name: "Stage", display_value: "In Progress", enum_value: { name: "In Progress" } },
              { name: "Sprint Goal", text_value: "Ship v2.0 beta" },
              { name: "Labels", multi_enum_values: [{ name: "Backend" }, { name: "API" }] },
            ],
            dependencies: [{ gid: "task-1", name: "Design login page" }],
            dependents: [{ gid: "task-3", name: "API spec review" }],
            external: { gid: "EXT-123", data: '{"jira_key":"PROJ-456"}' },
            num_subtasks: 1,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
              { project: { gid: "proj-1", name: "Sprint 4" }, section: { gid: "sec-todo", name: "To Do" } },
            ],
          },
          // Edge case 7: Task with multi-line comment
          {
            gid: "task-mlc",
            name: "Review feedback",
            notes: "Gather feedback from stakeholders",
            completed: false,
            created_at: "2026-02-11T11:00:00Z",
            modified_at: "2026-02-12T16:00:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
          // Edge case 8: Recurring task with → ^numericId parent reference
          {
            gid: "task-recur",
            name: "Weekly standup \u2192 ^1234567890123",
            notes: "",
            completed: false,
            created_at: "2026-02-15T09:00:00Z",
            modified_at: "2026-02-15T09:00:00Z",
            parent: { gid: "1234567890123", name: "Weekly standup" },
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
          // Edge case 9: HTML headings in notes (tests turndown headings→bold rule)
          {
            gid: "task-html-headings",
            name: "Task with headings in description",
            notes: "",
            html_notes: "<body><h1>Requirements</h1><p>Must support X.</p><h2>Notes</h2><p>Extra info.</p></body>",
            completed: false,
            created_at: "2026-02-16T08:00:00Z",
            modified_at: "2026-02-16T08:00:00Z",
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [
              { project: { gid: "proj-3", name: "Edge Cases" }, section: { gid: "sec-active", name: "Active" } },
            ],
          },
        ],
      },
      // Subtasks for task-full (2+ levels deep: sub-full-1 has a child sub-full-1a)
      {
        path: "/tasks/task-full/subtasks",
        response: [
          {
            gid: "sub-full-1",
            name: "Sub-step one",
            notes: "",
            completed: true,
            modified_at: "2026-02-08T12:00:00Z",
            parent: { gid: "task-full", name: "Comprehensive task" },
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 1,
            memberships: [],
          },
        ],
      },
      // Nested subtask: sub-full-1 → sub-full-1a (depth 3)
      {
        path: "/tasks/sub-full-1/subtasks",
        response: [
          {
            gid: "sub-full-1a",
            name: "Deep subtask",
            notes: "Nested detail",
            completed: false,
            modified_at: "2026-02-07T15:00:00Z",
            parent: { gid: "sub-full-1", name: "Sub-step one" },
            due_on: null,
            due_at: null,
            start_on: null,
            assignee: null,
            tags: [],
            custom_fields: [],
            num_subtasks: 0,
            memberships: [],
          },
        ],
      },
      // Stories for edge case tasks
      { path: "/tasks/task-sep/stories", response: [] },
      { path: "/tasks/task-sep/attachments", response: [] },
      { path: "/tasks/task-separator/stories", response: [] },
      { path: "/tasks/task-separator/attachments", response: [] },
      { path: "/tasks/task-html/stories", response: [] },
      { path: "/tasks/task-html/attachments", response: [] },
      { path: "/tasks/task-links/stories", response: [] },
      { path: "/tasks/task-links/attachments", response: [] },
      { path: "/tasks/task-mile/stories", response: [] },
      { path: "/tasks/task-mile/attachments", response: [] },
      {
        path: "/tasks/task-full/stories",
        response: [
          {
            gid: "story-full-1",
            type: "comment",
            text: "Approved by lead. Ship it!",
            created_at: "2026-02-09T14:00:00Z",
            created_by: { name: "Bob Jones" },
          },
        ],
      },
      {
        path: "/tasks/task-full/attachments",
        response: [
          {
            gid: "att-full-1",
            name: "spec.pdf",
            download_url: "https://asana.com/files/spec.pdf",
            host: "asana",
            created_at: "2025-08-20T14:00:00.000Z",
          },
        ],
      },
      {
        path: "/tasks/task-mlc/stories",
        response: [
          {
            gid: "story-mlc-1",
            type: "comment",
            text: "First line of feedback\nSecond line with details\nThird line conclusion",
            created_at: "2026-02-12T15:00:00Z",
            created_by: { name: "Alice Smith" },
          },
        ],
      },
      { path: "/tasks/task-mlc/attachments", response: [] },
      { path: "/tasks/task-recur/stories", response: [] },
      { path: "/tasks/task-recur/attachments", response: [] },
      { path: "/tasks/task-html-headings/stories", response: [] },
      { path: "/tasks/task-html-headings/attachments", response: [] },
      { path: "/tasks/sub-full-1/stories", response: [] },
      { path: "/tasks/sub-full-1/attachments", response: [] },
      { path: "/tasks/sub-full-1a/stories", response: [] },
      { path: "/tasks/sub-full-1a/attachments", response: [] },

      // --- User task lists (My Tasks) ---
      {
        path: "/user_task_lists/utl-1/tasks",
        response: [
          // task-1 is already in Sprint 4, should be deduped
          {
            gid: "task-1",
            name: "Design login page",
            completed: false,
            memberships: [],
            num_subtasks: 0,
          },
          // Orphan task: not in any project, has My Tasks section via assignee_section
          {
            gid: "task-orphan-1",
            name: "Personal reminder",
            notes: "Buy groceries",
            completed: false,
            created_at: "2026-02-17T08:00:00Z",
            modified_at: "2026-02-17T09:00:00Z",
            memberships: [],
            num_subtasks: 0,
            tags: [],
            custom_fields: [],
            assignee_section: { gid: "section-recently-assigned", name: "Recently assigned" },
          },
        ],
      },
      {
        path: "/user_task_lists/utl-2/tasks",
        response: [
          // task-2 is already in Sprint 4, all deduped
          {
            gid: "task-2",
            name: "Write tests",
            completed: true,
            memberships: [],
            num_subtasks: 0,
          },
        ],
      },
      { path: "/tasks/task-orphan-1/stories", response: [] },
      { path: "/tasks/task-orphan-1/attachments", response: [] },

      // --- Tag task lists ---
      {
        path: "/tags/tag-pa/tasks",
        response: [
          {
            gid: "task-tag-orphan",
            name: "PA follow-up",
            notes: "Call client",
            completed: false,
            created_at: "2026-02-16T10:00:00Z",
            modified_at: "2026-02-16T11:00:00Z",
            memberships: [],
            num_subtasks: 0,
            tags: [{ name: "@PA" }],
            custom_fields: [],
          },
        ],
      },
      {
        path: "/tags/tag-empty/tasks",
        response: [
          // All tasks already captured via projects
          {
            gid: "task-1",
            name: "Design login page",
            completed: false,
            memberships: [],
            num_subtasks: 0,
          },
        ],
      },
      { path: "/tasks/task-tag-orphan/stories", response: [] },
      { path: "/tasks/task-tag-orphan/attachments", response: [] },
    ],
  }
}

// ============================================================================
// Recording-based fixture (from --record output)
// ============================================================================

/** Create FakeAsana options from a recording file (output of --record flag) */
export function fromRecording(recorded: RecordedCall[]): FakeAsanaOptions {
  return { recordings: recorded }
}
