/**
 * Import Pipeline — Stage 2: Convert Tests
 *
 * Tests for: ImportData → KNode tree → markdown serialization.
 * Covers: task rendering, metadata, comments, attachments, dedup, roundtrip parsing.
 */

import { describe, test, expect } from "vitest"
import { convert } from "../../src/import/convert.ts"
import { parseMarkdown, extractFrontmatter, parseTaskMetadata, extractTags, extractMentions } from "@km/markdown"
import type { List, ListItem, Heading } from "@km/markdown"
import type { ImportData, ImportItem } from "../../src/import/types.ts"

// ============================================================================
// Helpers
// ============================================================================

/** Create ImportData with a single project containing loose items (no sections) */
function makeData(items: ImportItem[], title = "Test"): ImportData {
  return {
    source: "asana",
    fetchedAt: "2026-02-17T12:00:00Z",
    projects: [{ sourceId: "p1", title, items }],
  }
}

/** Create ImportData with a single project containing sections */
function makeDataWithSections(
  sections: Array<{ title: string; items: ImportItem[] }>,
  project: { sourceId?: string; title?: string } = {},
): ImportData {
  return {
    source: "asana",
    fetchedAt: "2026-02-17T12:00:00Z",
    projects: [
      {
        sourceId: project.sourceId ?? "p1",
        title: project.title ?? "Sprint 4",
        sections: sections.map((s, i) => ({ sourceId: `s${i + 1}`, title: s.title, items: s.items })),
      },
    ],
  }
}

/** Convert single-project data and return the markdown string */
function convertToMd(data: ImportData): string {
  const files = convert(data)
  const [md] = files.values()
  return md!
}

// ============================================================================
// Stage 2: Convert (ImportData → FileMap)
// ============================================================================

describe("Stage 2: Convert ImportData to markdown", () => {
  const fixture = makeDataWithSections(
    [
      {
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
            comments: [{ author: "bob", createdAt: "2026-02-16T10:30:00Z", text: "Looks great, minor tweaks needed" }],
            attachments: [{ name: "wireframe.png", url: "https://example.com/wireframe.png", type: "image" }],
            children: [
              { sourceId: "s1", title: "Create wireframes", status: "todo" },
              { sourceId: "s2", title: "Review with team", status: "done" },
            ],
          },
        ],
      },
      {
        title: "Done",
        items: [{ sourceId: "t2", title: "Write tests", status: "done", completedAt: "2026-02-09T16:30:00Z" }],
      },
    ],
    { sourceId: "p1", title: "Sprint 4" },
  )

  test("generates one file per project with correct slug", () => {
    const files = convert(fixture)
    expect(files.size).toBe(1)
    expect(files.has("p1-sprint-4.md")).toBe(true)
  })

  test("includes frontmatter", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("imported_from: asana")
    expect(md).toContain("asana_project_id: p1")
  })

  test("renders sections as H2", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## To Do")
    expect(md).toContain("## Done")
  })

  test("renders tasks with inline metadata", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("- [ ] Design login page @alice #design")
    expect(md).toContain("created:: 2026-02-10")
    expect(md).toContain("due:: 2026-03-01")
    expect(md).toContain("start:: 2026-02-15")
    expect(md).toContain("p:: 1")
  })

  test("renders completedAt on done tasks", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("- [x] Write tests completed:: 2026-02-09")
  })

  test("renders multi-project as +project tags (excluding current project)", () => {
    const md = convertToMd(fixture)
    expect(md).not.toContain("+sprint-4")
    expect(md).toContain("+backlog")
  })

  test("renders completed tasks with [x]", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("- [x] Write tests")
  })

  test("renders subtasks as nested items", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("  - [ ] Create wireframes")
    expect(md).toContain("  - [x] Review with team")
  })

  test("renders body as blockquote", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("  > Create wireframes")
    expect(md).toContain("  > Review with team")
  })

  test("renders comments in blockquote", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("> **Comments:**")
    expect(md).toContain("> - 2026-02-16 @bob: Looks great")
  })

  test("renders image attachments in blockquote", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("> ![wireframe.png](https://example.com/wireframe.png)")
  })

  test("converts Asana URLs to ^block references", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with links",
          body: "See https://app.asana.com/0/123/456 and https://app.asana.com/1/789/task/101112",
        },
      ]),
    )
    expect(md).toContain("[[^456]]")
    expect(md).toContain("[[^101112]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("uses ^sourceId as block ID on task lines", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("^t1")
    expect(md).toContain("^t2")
    expect(md).not.toContain("gid:")
  })

  test("renders body with markdown bullets inside blockquote", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with bullets",
          body: "Planning notes:\n\n*   First option\n*   Second option\n*   Third option\n\nAdditional context here.",
        },
      ]),
    )
    expect(md).toContain("> Planning notes:")
    expect(md).toContain("> *   First option")
    expect(md).toContain("> *   Third option")
    expect(md).toContain("> Additional context here.")
  })

  test("renders Asana links in body as block references inside blockquote", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with asana links",
          body: "See also: [Related](https://app.asana.com/0/123456/789012) and [Another](https://app.asana.com/1/111/task/222333)",
        },
      ]),
    )
    expect(md).toContain("> See also: [[^789012]] and [[^222333]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("renders milestone task with diamond marker", () => {
    const md = convertToMd(
      makeData([
        { sourceId: "m1", title: "Launch day", milestone: true, status: "todo" },
        { sourceId: "m2", title: "Past milestone", milestone: true, status: "done" },
      ]),
    )
    expect(md).toContain("- [ ] ◆ Launch day")
    expect(md).toContain("- [x] ◆ Past milestone")
  })

  test("renders all-metadata task with every field in output", () => {
    const md = convertToMd(
      makeData([
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
          comments: [{ author: "bob", createdAt: "2026-02-09T14:00:00Z", text: "Approved. Ship it!" }],
          attachments: [{ name: "spec.pdf", url: "https://example.com/spec.pdf", type: "file" }],
        },
      ]),
    )
    expect(md).toContain("- [x] Full task")
    expect(md).toContain("@alice-smith")
    expect(md).toContain("due:: 2026-02-15")
    expect(md).toContain("start:: 2026-01-20")
    expect(md).toContain("created:: 2026-01-15")
    expect(md).toContain("completed:: 2026-02-10")
    expect(md).toContain("p:: 2")
    expect(md).toContain("#backend")
    expect(md).toContain("#urgent")
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
    const md = convertToMd(
      makeData([
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
      ]),
    )
    expect(md).toContain("> - 2026-02-12 @alice: First line of feedback")
    expect(md).toContain(">   Second line with details")
    expect(md).toContain(">   Third line conclusion")
  })

  test("filters system comments in convert path (pre-2020 standalone action)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with system comment",
          comments: [
            { author: "alice", createdAt: "2019-05-10T10:00:00Z", text: "moved this Task from Backlog to In Progress" },
            { author: "bob", createdAt: "2019-05-11T14:00:00Z", text: "This is a real comment" },
          ],
        },
      ]),
    )
    expect(md).not.toContain("moved this Task")
    expect(md).toContain("This is a real comment")
  })

  test("filters consolidated system comments with mixed real content", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with consolidated comment",
          comments: [
            {
              author: "bjorn",
              createdAt: "2018-06-01T00:00:00Z",
              text: "Alice on Monday Oct 16, 2017 01:57 AM:\nchanged the due date to Oct 20\n----------------------\nAlice on Tuesday Oct 17, 2017 09:00 AM:\nActual feedback about the design\n----------------------\nAlice on Wednesday Oct 18, 2017 02:00 PM:\nmarked this task complete",
            },
          ],
        },
      ]),
    )
    expect(md).toContain("Actual feedback about the design")
    expect(md).not.toContain("changed the due date")
    expect(md).not.toContain("marked this task complete")
  })

  test("does not filter comments from 2020+ (post-cutoff)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with modern comment",
          comments: [
            { author: "alice", createdAt: "2026-02-15T10:00:00Z", text: "moved this Task from Backlog to Done" },
          ],
        },
      ]),
    )
    expect(md).toContain("moved this Task from Backlog to Done")
  })

  test("metadata (created::, completed::) lives in data.metadata, not inline content", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Metadata task",
          createdAt: "2026-01-15T09:00:00Z",
          completedAt: "2026-02-10T17:00:00Z",
          status: "done",
        },
      ]),
    )
    expect(md).toContain("created:: 2026-01-15")
    expect(md).toContain("completed:: 2026-02-10")
    // Metadata appears on the task line itself
    const taskLine = md.split("\n").find((l) => l.includes("Metadata task"))!
    expect(taskLine).toContain("created:: 2026-01-15")
    expect(taskLine).toContain("completed:: 2026-02-10")
  })

  test("renders nested subtasks 2+ levels deep", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "top",
          title: "Top-level task",
          children: [
            {
              sourceId: "mid",
              title: "Mid-level subtask",
              children: [{ sourceId: "deep", title: "Deep subtask", status: "done" }],
            },
          ],
        },
      ]),
    )
    expect(md).toContain("- [ ] Top-level task")
    expect(md).toContain("  - [ ] Mid-level subtask")
    expect(md).toContain("    - [x] Deep subtask")
  })

  test("renders body with attachments and comments together in blockquote", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Rich task",
          body: "Description text here",
          attachments: [
            { name: "diagram.png", url: "https://example.com/diagram.png", type: "image" },
            { name: "report.pdf", url: "https://example.com/report.pdf", type: "file" },
          ],
          comments: [{ author: "alice", createdAt: "2026-02-10T10:00:00Z", text: "Great work!" }],
        },
      ]),
    )
    expect(md).toContain("> Description text here")
    expect(md).toContain("> ![diagram.png](https://example.com/diagram.png)")
    expect(md).toContain("> [report.pdf](https://example.com/report.pdf)")
    expect(md).toContain("> **Comments:**")
    expect(md).toContain("> - 2026-02-10 @alice: Great work!")
  })
})

// ============================================================================
// Multi-project task dedup
// ============================================================================

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

    // Beta has embed reference (renders target node inline)
    expect(beta).toContain("![[^shared-1]]")
    expect(beta).not.toContain("  > Details here")

    // Non-shared task renders normally
    expect(beta).toContain("- [x] Beta only")
  })
})

// ============================================================================
// Roundtrip: Convert → Parse (verify parser handles import output)
// ============================================================================

/** Create ImportData with sections for roundtrip tests */
function makeRoundtripData(items: ImportItem[], title = "Test Project"): ImportData {
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
    const data = makeRoundtripData([
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

    const list = tree.children.find((n): n is List => n.type === "list")!
    expect(list).toBeDefined()

    const parentLi = list.children[0]! as ListItem
    const childTypes = parentLi.children.map((c) => c.type)
    expect(childTypes).toContain("paragraph")
    expect(childTypes).toContain("blockquote")
    expect(childTypes).toContain("list")

    const subtaskList = parentLi.children.find((c): c is List => c.type === "list")!
    expect(subtaskList.children).toHaveLength(2)
    expect(subtaskList.children[0]!.checked).toBe(true)
    expect(subtaskList.children[1]!.checked).toBe(false)
  })

  test("task with body bullets doesn't create extra children", () => {
    const data = makeRoundtripData([
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

    const childTypes = taskLi.children.map((c) => c.type)
    expect(childTypes).toContain("blockquote")
    expect(childTypes).not.toContain("list")
    expect(list.children).toHaveLength(1)
  })

  test("nested subtasks preserve depth", () => {
    const data = makeRoundtripData([
      {
        sourceId: "lvl1",
        title: "Level 1",
        children: [
          {
            sourceId: "lvl2",
            title: "Level 2",
            children: [{ sourceId: "lvl3", title: "Level 3", status: "done" }],
          },
        ],
      },
    ])

    const files = convert(data)
    const md = files.get("proj-rt-test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    const rootList = tree.children.find((n): n is List => n.type === "list")!
    const li1 = rootList.children[0]! as ListItem
    const nestedList1 = li1.children.find((c): c is List => c.type === "list")!
    expect(nestedList1).toBeDefined()
    const li2 = nestedList1.children[0]! as ListItem
    const nestedList2 = li2.children.find((c): c is List => c.type === "list")!
    expect(nestedList2).toBeDefined()
    const li3 = nestedList2.children[0]! as ListItem
    expect(li3.checked).toBe(true)
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

    const list = tree.children.find((n): n is List => n.type === "list")!
    expect(list).toBeDefined()
    expect(list.children).toHaveLength(2)

    const refLi = list.children[0]! as ListItem
    expect(refLi.type).toBe("listItem")

    const betaLi = list.children[1]! as ListItem
    expect(betaLi.checked).toBe(true)
  })

  test("metadata fields roundtrip through parser", () => {
    const data = makeRoundtripData([
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
    const taskLine = md.split("\n").find((l) => l.includes("Metadata task"))!
    expect(taskLine).toBeDefined()

    const meta = parseTaskMetadata(taskLine)
    expect(meta.dueAt).toBe("2026-03-15")
    expect(meta.startAt).toBe("2026-03-01")
    expect(meta.priority).toBe(2)

    const mentions = extractMentions(taskLine)
    expect(mentions).toContain("alice-smith")

    const tags = extractTags(taskLine)
    expect(tags).toContain("backend")
    expect(tags).toContain("urgent")

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

    expect(frontmatter).toContain("imported_from: asana")
    expect(frontmatter).toContain("imported_at: 2026-01-15T10:30:00Z")
    expect(frontmatter).toContain("asana_project_id: proj-fm")
    expect(frontmatter).toContain("workspace: My Workspace")
    expect(frontmatter).toContain("owner: Bjorn")
    expect(frontmatter).toContain("team: Engineering")
    expect(frontmatter).toContain("created_at: 2025-12-01T00:00:00Z")
    expect(frontmatter).toContain("modified_at: 2026-01-10T12:00:00Z")

    const tree = parseMarkdown(body)
    const heading = tree.children.find((n): n is Heading => n.type === "heading" && n.depth === 1)
    expect(heading).toBeDefined()
  })
})

// ============================================================================
// Within-file dedup (task in multiple sections of same project)
// ============================================================================

describe("Within-file dedup", () => {
  test("task in multiple sections only rendered once, no within-file cross-ref", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-18T00:00:00Z",
      projects: [
        {
          sourceId: "proj-dup",
          title: "Wellness",
          sections: [
            {
              sourceId: "sec-active",
              title: "Active",
              items: [{ sourceId: "task-1", title: "Exercise daily", status: "todo" }],
            },
            {
              sourceId: "sec-habits",
              title: "Habits",
              items: [{ sourceId: "task-1", title: "Exercise daily", status: "todo" }],
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = files.get("proj-dup-wellness.md")!

    // Task should appear exactly once as a full entry
    const fullMatches = md.match(/- \[ \] Exercise daily/g)
    expect(fullMatches).toHaveLength(1)

    // No within-file cross-reference (embed or old title+link)
    expect(md).not.toContain("![[^task-1]]")
    expect(md).not.toContain("→ [[^task-1]]")
  })

  test("within-file dedup does not block cross-project refs", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-18T00:00:00Z",
      projects: [
        {
          sourceId: "projA",
          title: "Alpha",
          sections: [
            {
              sourceId: "sec-a1",
              title: "Section A1",
              items: [{ sourceId: "shared-task", title: "Shared task", status: "todo", body: "Full body" }],
            },
            {
              sourceId: "sec-a2",
              title: "Section A2",
              items: [{ sourceId: "shared-task", title: "Shared task", status: "todo", body: "Full body" }],
            },
          ],
        },
        {
          sourceId: "projB",
          title: "Beta",
          items: [{ sourceId: "shared-task", title: "Shared task", status: "todo", body: "Full body" }],
        },
      ],
    }
    const files = convert(data)
    const alpha = files.get("projA-alpha.md")!
    const beta = files.get("projB-beta.md")!

    // Alpha: full content once, no self-reference
    const alphaFullMatches = alpha.match(/- \[ \] Shared task/g)
    expect(alphaFullMatches).toHaveLength(1)
    expect(alpha).not.toContain("![[^shared-task]]")

    // Beta: cross-project embed reference (renders target node inline)
    expect(beta).toContain("![[^shared-task]]")
    expect(beta).not.toContain("> Full body")
  })
})

// ============================================================================
// Tag file dedup (same task appearing twice in tag aggregation)
// ============================================================================

describe("Tag file dedup", () => {
  test("task tagged in multiple sections does not duplicate in tag file", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-18T00:00:00Z",
      projects: [
        {
          sourceId: "proj-tag",
          title: "Tagged Project",
          sections: [
            {
              sourceId: "sec-1",
              title: "Section 1",
              items: [{ sourceId: "tag-task-1", title: "Tagged task", status: "todo", tags: ["health"] }],
            },
            {
              sourceId: "sec-2",
              title: "Section 2",
              items: [{ sourceId: "tag-task-1", title: "Tagged task", status: "todo", tags: ["health"] }],
            },
          ],
        },
        {
          sourceId: "proj-tag2",
          title: "Another Project",
          items: [{ sourceId: "tag-task-2", title: "Another tagged", status: "done", tags: ["health"] }],
        },
      ],
    }
    const files = convert(data)
    const tagFile = files.get("#health.md")!
    expect(tagFile).toBeDefined()

    // The task should appear only once in the tag file (as an embed since it was rendered in project file)
    const refMatches = tagFile.match(/!\[\[\^tag-task-1\]\]/g)
    expect(refMatches).toHaveLength(1)
  })
})
