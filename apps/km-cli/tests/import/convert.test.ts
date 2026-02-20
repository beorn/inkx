/**
 * Import Pipeline — Stage 2: Convert Tests
 *
 * Tests for: ImportData → KNode tree → markdown serialization.
 * Covers: task rendering, metadata, comments, attachments, dedup, roundtrip parsing.
 */

import type { KNode } from "@km/core"
import type { Heading, List, ListItem } from "@km/markdown"
import { extractFrontmatter, extractMentions, extractTags, parseMarkdown, parseTaskMetadata } from "@km/markdown"
import { describe, expect, test } from "vitest"
import type { AsanaApiTask } from "../../src/import/adapters/asana/asana-types.ts"
import { toImportItem } from "../../src/import/adapters/asana/task-transform.ts"
import { convert, itemToNodes } from "../../src/import/convert.ts"
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
        sections: sections.map((s, i) => ({
          sourceId: `s${i + 1}`,
          title: s.title,
          items: s.items,
        })),
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
        title: "Done",
        items: [
          {
            sourceId: "t2",
            title: "Write tests",
            status: "done",
            completedAt: "2026-02-09T16:30:00Z",
          },
        ],
      },
    ],
    { sourceId: "p1", title: "Sprint 4" },
  )

  test("generates one file per project with correct slug", () => {
    const files = convert(fixture)
    expect(files.size).toBe(1)
    expect(files.has("sprint-4.md")).toBe(true)
  })

  test("includes frontmatter", () => {
    const md = convertToMd(fixture)
    // imported_from/imported_at removed — import JSON has that info
    expect(md).not.toContain("imported_from:")
    expect(md).not.toContain("asana_project_id:")
  })

  test("renders sections as H2", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## To Do")
    expect(md).toContain("## Done")
  })

  test("renders tasks as headings with inline metadata", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## Design login page @alice #design")
    // Metadata (created::, due::, etc.) is stored in node data, not inline on headings
    expect(md).toContain("^t1")
  })

  test("renders completedAt on done tasks", () => {
    const md = convertToMd(fixture)
    // Done tasks render as headings (no [x] checkbox); completedAt is in node data
    expect(md).toContain("## Write tests completed:: 2026-02-09 ^t2")
  })

  test("renders multi-project as +project tags (excluding current project)", () => {
    const md = convertToMd(fixture)
    expect(md).not.toContain("+sprint-4")
    expect(md).toContain("+backlog")
  })

  test("renders completed tasks as headings", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## Write tests completed:: 2026-02-09 ^t2")
  })

  test("renders subtasks as headings", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## Create wireframes ^s1")
    expect(md).toContain("## Review with team ^s2")
  })

  test("renders body as paragraph (not blockquote)", () => {
    const md = convertToMd(fixture)
    // Body text appears directly under the heading (no indent since it's under an oi heading, not an li)
    expect(md).toContain("Create wireframes\nReview with team")
    expect(md).not.toContain("> Create wireframes")
  })

  test("renders comments as child list nodes (not in blockquote)", () => {
    const md = convertToMd(fixture)
    // Comments section is an oi node, rendered as a heading
    expect(md).toContain("## Comments")
    expect(md).toContain("- 2026-02-16 @bob: Looks great")
    // Old blockquote format should NOT be present
    expect(md).not.toContain("> **Comments:**")
    expect(md).not.toContain("> - 2026-02-16 @bob:")
  })

  test("renders image attachments as child list nodes (not in blockquote)", () => {
    const md = convertToMd(fixture)
    // Attachments section is an oi node, rendered as a heading
    expect(md).toContain("## Attachments")
    expect(md).toContain("- ![wireframe.png](https://example.com/wireframe.png)")
    // Old blockquote format should NOT be present
    expect(md).not.toContain("> ![wireframe.png]")
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

  test("renders body with markdown bullets inside paragraph", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with bullets",
          body: "Planning notes:\n\n*   First option\n*   Second option\n*   Third option\n\nAdditional context here.",
        },
      ]),
    )
    // Body appears directly under the heading (no indent since parent is oi)
    expect(md).toContain("Planning notes:")
    expect(md).toContain("*   First option")
    expect(md).toContain("*   Third option")
    expect(md).toContain("Additional context here.")
    expect(md).not.toContain("> Planning notes:")
  })

  test("renders Asana links in body as block references inside paragraph", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with asana links",
          body: "See also: [Related](https://app.asana.com/0/123456/789012) and [Another](https://app.asana.com/1/111/task/222333)",
        },
      ]),
    )
    // Body appears directly under the heading (no indent since parent is oi)
    expect(md).toContain("See also: [[^789012|Related]] and [[^222333|Another]]")
    expect(md).not.toContain("app.asana.com")
  })

  // ============================================================================
  // Asana Link Conversion Edge Cases
  // ============================================================================
  // Link conversion strategy:
  // - Markdown links [text](url) → [[^GID|text]] (with alias to preserve link text)
  // - Bare URLs → [[^GID]] (no alias)
  // - Empty/whitespace link text → [[^GID]] (no alias)
  // - Link text equal to GID → [[^GID]] (filtering out auto-numbered refs)
  // - Link text that's a URL → [[^GID]] (filtering out copy-paste errors)
  //
  // Rationale: We use aliases to preserve user-customized link text, since we can't
  // determine during import whether the link text matches the target task's name.
  // km's rendering system prefers aliases when present, or resolves the target's title.

  test("converts markdown link with custom text to alias syntax", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[Check this out](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456|Check this out]]")
  })

  test("converts bare Asana URL (no markdown) to GID-only syntax", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "See this: https://app.asana.com/0/123/456 for details",
        },
      ]),
    )
    expect(md).toContain("See this: [[^456]] for details")
    expect(md).not.toContain("http")
  })

  test("filters empty link text (renders GID only)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456]]")
    expect(md).not.toContain("[[^456|]]")
  })

  test("filters link text that is the GID itself (auto-numbered ref)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[123456789](https://app.asana.com/0/123/123456789)",
        },
      ]),
    )
    expect(md).toContain("[[^123456789]]")
    expect(md).not.toContain("[[^123456789|123456789]]")
  })

  test("filters link text that is a URL (copy-paste error)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[https://example.com](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456]]")
    expect(md).not.toContain("https://example.com")
  })

  test("preserves valid link text with special characters", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[Design: Phase 2 (WIP)](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456|Design: Phase 2 (WIP)]]")
  })

  test("handles multiple Asana links in same body", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "Related: [Setup](https://app.asana.com/0/123/111) and [Deploy](https://app.asana.com/0/123/222) and bare https://app.asana.com/0/123/333",
        },
      ]),
    )
    expect(md).toContain("[[^111|Setup]]")
    expect(md).toContain("[[^222|Deploy]]")
    expect(md).toContain("[[^333]]")
  })

  test("renders milestone task with diamond marker", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "m1",
          title: "Launch day",
          milestone: true,
          status: "todo",
        },
        {
          sourceId: "m2",
          title: "Past milestone",
          milestone: true,
          status: "done",
        },
      ]),
    )
    expect(md).toContain("## ◆ Launch day ^m1")
    expect(md).toContain("## ◆ Past milestone ^m2")
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
      ]),
    )
    expect(md).toContain(
      "## Full task @alice-smith #backend #urgent +other-project created:: 2026-01-15 due:: 2026-02-15 start:: 2026-01-20 completed:: 2026-02-10 p:: 2 ^tf1",
    )
    expect(md).not.toContain("+test")
    // Body appears directly under heading (no indent since parent is oi)
    expect(md).toContain("Description with **bold** text.")
    // Subtask is a heading too
    expect(md).toContain("## Sub-step ^cs1")
    // Comments and attachments are oi sections rendered as headings
    expect(md).toContain("## Comments")
    expect(md).toContain("- 2026-02-09 @bob: Approved. Ship it!")
    expect(md).toContain("## Attachments")
    expect(md).toContain("- [spec.pdf](https://example.com/spec.pdf)")
  })

  test("renders multi-line comments as single child node (joined text)", () => {
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
    expect(md).toContain("## Comments")
    // Multi-line comment text is stored in the node content
    expect(md).toContain("- 2026-02-12 @alice: First line of feedback")
  })

  test("filters system comments in convert path (pre-2020 standalone action)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with system comment",
          comments: [
            {
              author: "alice",
              createdAt: "2019-05-10T10:00:00Z",
              text: "moved this Task from Backlog to In Progress",
            },
            {
              author: "bob",
              createdAt: "2019-05-11T14:00:00Z",
              text: "This is a real comment",
            },
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
            {
              author: "alice",
              createdAt: "2026-02-15T10:00:00Z",
              text: "moved this Task from Backlog to Done",
            },
          ],
        },
      ]),
    )
    expect(md).toContain("moved this Task from Backlog to Done")
  })

  test("metadata (created::, completed::) rendered as inline properties", () => {
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
    expect(md).toContain("## Metadata task created:: 2026-01-15 completed:: 2026-02-10 ^t1")
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
    // All tasks/subtasks are headings now
    expect(md).toContain("## Top-level task ^top")
    expect(md).toContain("## Mid-level subtask ^mid")
    expect(md).toContain("## Deep subtask ^deep")
  })

  test("renders body as paragraph, attachments and comments as separate child nodes", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Rich task",
          body: "Description text here",
          attachments: [
            {
              name: "diagram.png",
              url: "https://example.com/diagram.png",
              type: "image",
            },
            {
              name: "report.pdf",
              url: "https://example.com/report.pdf",
              type: "file",
            },
          ],
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "Great work!",
            },
          ],
        },
      ]),
    )
    // Body as paragraph (not blockquote), no indent since parent is oi
    expect(md).toContain("Description text here")
    expect(md).not.toContain("> Description text here")
    // Attachments as oi sections rendered as headings
    expect(md).toContain("## Attachments")
    expect(md).toContain("- ![diagram.png](https://example.com/diagram.png)")
    expect(md).toContain("- [report.pdf](https://example.com/report.pdf)")
    // Comments as oi sections rendered as headings
    expect(md).toContain("## Comments")
    expect(md).toContain("- 2026-02-10 @alice: Great work!")
  })
})

// ============================================================================
// Activity log rendering
// ============================================================================

describe("Activity log rendering", () => {
  test("renders activity log as child list nodes under Activity parent", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with activity",
          activityLog: [
            {
              author: "alice",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Alice moved this task to To Do",
            },
            {
              author: "bob",
              createdAt: "2026-02-16T14:00:00Z",
              text: "Bob completed this task",
            },
          ],
        },
      ]),
    )
    // Activity section is an oi node, rendered as a heading
    expect(md).toContain("## Activity")
    expect(md).toContain("- 2026-02-15 @alice: Alice moved this task to To Do")
    expect(md).toContain("- 2026-02-16 @bob: Bob completed this task")
    // Old blockquote format should NOT be present
    expect(md).not.toContain("> **Activity:**")
  })

  test("renders comments before activity in child nodes", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with both",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-16T10:00:00Z",
              text: "A real comment",
            },
          ],
          activityLog: [
            {
              author: "system",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Task created",
            },
          ],
        },
      ]),
    )
    const commentIdx = md.indexOf("## Comments")
    const activityIdx = md.indexOf("## Activity")
    expect(commentIdx).toBeGreaterThan(-1)
    expect(activityIdx).toBeGreaterThan(commentIdx)
  })

  test("activity log alone (no body/comments) creates child node (no blockquote)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Bare activity task",
          activityLog: [
            {
              author: "system",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Task moved",
            },
          ],
        },
      ]),
    )
    // Activity section is an oi node, rendered as a heading
    expect(md).toContain("## Activity")
    expect(md).toContain("- 2026-02-15 @system: Task moved")
    expect(md).not.toContain("> **Activity:**")
  })
})

// ============================================================================
// Separator items
// ============================================================================

describe("Separator items (isSeparator)", () => {
  test("renders separator item as HR node (not a task)", () => {
    const md = convertToMd(
      makeData([
        { sourceId: "t1", title: "Before separator" },
        { sourceId: "sep1", title: "", metadata: { isSeparator: true } },
        { sourceId: "t2", title: "After separator" },
      ]),
    )
    expect(md).toContain("---")
    expect(md).not.toContain("- [ ]  ")
    expect(md).not.toContain("- [ ] \n")
  })

  test("separator does not produce task markers or content lines", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(counter, { sourceId: "sep1", title: "", metadata: { isSeparator: true } }, "parent", nodes)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.type).toBe("hr")
    expect(nodes[0]!.id).toBe("sep1")
  })
})

// ============================================================================
// Permalink and external metadata
// ============================================================================

describe("Permalink and external metadata", () => {
  test("stores permalink in node data as asana_permalink", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        permalink: "https://app.asana.com/0/p1/t1",
      },
      "parent",
      nodes,
    )
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data?.asana_permalink).toBe("https://app.asana.com/0/p1/t1")
  })

  test("stores external metadata as asana_external in node data", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        metadata: { external: { id: "EXT-123", source: "jira" } },
      },
      "parent",
      nodes,
    )
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data?.asana_external).toEqual({
      id: "EXT-123",
      source: "jira",
    })
  })

  test("stores assigneeSectionName, parentGid, parentName in node data", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        metadata: {
          assigneeSectionName: "My Tasks: Today",
          parentGid: "gid-parent",
          parentName: "Parent Task",
        },
      },
      "parent",
      nodes,
    )
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data?.asana_assignee_section).toBe("My Tasks: Today")
    expect(taskNode.data?.asana_parent_gid).toBe("gid-parent")
    expect(taskNode.data?.asana_parent_name).toBe("Parent Task")
  })

  test("task without permalink has no asana_permalink in node data", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(counter, { sourceId: "t1", title: "Task" }, "parent", nodes)
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data?.asana_permalink).toBeUndefined()
  })
})

// ============================================================================
// Child node structure for comments/attachments
// ============================================================================

describe("Child node structure", () => {
  test("comments appear as child list nodes with Comments parent", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        comments: [
          {
            author: "alice",
            createdAt: "2026-02-10T10:00:00Z",
            text: "Nice work!",
          },
        ],
      },
      "parent",
      nodes,
    )
    const commentsParent = nodes.find((n) => n.id === "comments-t1")!
    expect(commentsParent).toBeDefined()
    expect(commentsParent.parent_id).toBe("t1")
    expect(commentsParent.content).toBe("Comments km.collapse:: true")
    const commentChild = nodes.find((n) => n.parent_id === "comments-t1")!
    expect(commentChild).toBeDefined()
    expect(commentChild.content).toContain("2026-02-10 @alice: Nice work!")
  })

  test("attachments appear as child list nodes with Attachments parent", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        attachments: [
          {
            name: "photo.jpg",
            url: "https://example.com/photo.jpg",
            type: "image",
          },
          { name: "doc.pdf", url: "https://example.com/doc.pdf", type: "file" },
        ],
      },
      "parent",
      nodes,
    )
    const attachParent = nodes.find((n) => n.id === "attachments-t1")!
    expect(attachParent).toBeDefined()
    expect(attachParent.parent_id).toBe("t1")
    expect(attachParent.content).toBe("Attachments km.collapse:: true")
    const children = nodes.filter((n) => n.parent_id === "attachments-t1")
    expect(children).toHaveLength(2)
    expect(children[0]!.content).toBe("![photo.jpg](https://example.com/photo.jpg)")
    expect(children[1]!.content).toBe("[doc.pdf](https://example.com/doc.pdf)")
  })

  test("body-only task has paragraph body, no Comments/Attachments child nodes", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(counter, { sourceId: "t1", title: "Task", body: "Just a description" }, "parent", nodes)
    const bodyNode = nodes.find((n) => n.type === "p")!
    expect(bodyNode).toBeDefined()
    expect(bodyNode.content).toBe("Just a description")
    expect(bodyNode.id).toBe("body-t1")
    expect(nodes.find((n) => n.id === "comments-t1")).toBeUndefined()
    expect(nodes.find((n) => n.id === "attachments-t1")).toBeUndefined()
  })

  test("child nodes inherit parent task timestamps", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    const createdMs = new Date("2024-06-15T10:00:00Z").getTime()
    const modifiedMs = new Date("2025-01-20T14:00:00Z").getTime()
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task with timestamps",
        createdAt: "2024-06-15T10:00:00Z",
        modifiedAt: "2025-01-20T14:00:00Z",
        body: "Description text",
        comments: [{ author: "alice", createdAt: "2025-01-10T10:00:00Z", text: "Nice!" }],
        attachments: [
          {
            name: "file.pdf",
            url: "https://example.com/file.pdf",
            type: "file",
          },
        ],
        activityLog: [
          {
            author: "system",
            createdAt: "2024-12-01T09:00:00Z",
            text: "Task moved",
          },
        ],
      },
      "parent",
      nodes,
    )
    // Task node itself should have the Asana timestamps
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.created_at).toBe(createdMs)
    expect(taskNode.updated_at).toBe(modifiedMs)

    // Body paragraph should inherit parent timestamps
    const bodyNode = nodes.find((n) => n.id === "body-t1")!
    expect(bodyNode.created_at).toBe(createdMs)
    expect(bodyNode.updated_at).toBe(modifiedMs)

    // Comments header should inherit parent timestamps
    const commentsHeader = nodes.find((n) => n.id === "comments-t1")!
    expect(commentsHeader.created_at).toBe(createdMs)
    expect(commentsHeader.updated_at).toBe(modifiedMs)

    // Individual comment should use its own createdAt, updated_at from parent
    const commentNode = nodes.find((n) => n.parent_id === "comments-t1")!
    expect(commentNode.created_at).toBe(new Date("2025-01-10T10:00:00Z").getTime())
    expect(commentNode.updated_at).toBe(modifiedMs)

    // Attachments header should inherit parent timestamps
    const attachmentsHeader = nodes.find((n) => n.id === "attachments-t1")!
    expect(attachmentsHeader.created_at).toBe(createdMs)
    expect(attachmentsHeader.updated_at).toBe(modifiedMs)

    // Individual attachment should inherit parent timestamps
    const attachmentNode = nodes.find((n) => n.parent_id === "attachments-t1")!
    expect(attachmentNode.created_at).toBe(createdMs)
    expect(attachmentNode.updated_at).toBe(modifiedMs)

    // Activity header should inherit parent timestamps
    const activityHeader = nodes.find((n) => n.id === "activity-t1")!
    expect(activityHeader.created_at).toBe(createdMs)
    expect(activityHeader.updated_at).toBe(modifiedMs)

    // Individual activity entry should use its own createdAt, updated_at from parent
    const activityNode = nodes.find((n) => n.parent_id === "activity-t1")!
    expect(activityNode.created_at).toBe(new Date("2024-12-01T09:00:00Z").getTime())
    expect(activityNode.updated_at).toBe(modifiedMs)
  })
})

// ============================================================================
// Project status updates rendering
// ============================================================================

describe("Project status updates rendering", () => {
  test("renders status updates as H2 section with list items", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Sprint 4",
          items: [{ sourceId: "t1", title: "A task" }],
          statusUpdates: [
            {
              title: "Sprint 4 on track",
              text: "All tasks progressing well.",
              color: "green",
              author: "Test User",
              createdAt: "2026-02-14T10:00:00Z",
            },
          ],
        },
      ],
    }
    const md = convertToMd(data)
    expect(md).toContain("## Status Updates")
    expect(md).toContain("- Sprint 4 on track")
    expect(md).toContain("> All tasks progressing well.")
    expect(md).toContain("> Status: green")
    expect(md).toContain("Author: @test-user")
    expect(md).toContain("Date: 2026-02-14")
  })

  test("omits Status Updates section when empty", () => {
    const md = convertToMd(makeData([{ sourceId: "t1", title: "A task" }]))
    expect(md).not.toContain("## Status Updates")
  })
})

// ============================================================================
// Custom field definitions rendering
// ============================================================================

describe("Custom field definitions rendering", () => {
  test("renders custom fields as H2 section with list items", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Sprint 4",
          items: [{ sourceId: "t1", title: "A task" }],
          customFieldSettings: [
            {
              name: "Priority",
              type: "number",
              description: "Task priority level",
              precision: 0,
            },
            {
              name: "Stage",
              type: "enum",
              description: "Development stage",
              enumOptions: ["Planning", "In Progress", "Review", "Done"],
            },
          ],
        },
      ],
    }
    const md = convertToMd(data)
    expect(md).toContain("## Custom Fields")
    expect(md).toContain("- Priority")
    expect(md).toContain("> Type: number")
    expect(md).toContain("> Task priority level")
    expect(md).toContain("> Precision: 0")
    expect(md).toContain("- Stage")
    expect(md).toContain("> Type: enum")
    expect(md).toContain("> Options: Planning, In Progress, Review, Done")
  })

  test("omits Custom Fields section when empty", () => {
    const md = convertToMd(makeData([{ sourceId: "t1", title: "A task" }]))
    expect(md).not.toContain("## Custom Fields")
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
          items: [
            {
              sourceId: "shared-1",
              title: "Shared task",
              status: "todo",
              body: "Details here",
            },
          ],
        },
        {
          sourceId: "projB",
          title: "Project Beta",
          items: [
            {
              sourceId: "shared-1",
              title: "Shared task",
              status: "todo",
              body: "Details here",
            },
            { sourceId: "only-beta", title: "Beta only", status: "done" },
          ],
        },
      ],
    }
    const files = convert(data)
    const alpha = files.get("project-alpha.md")!
    const beta = files.get("project-beta.md")!

    // Alpha has full content (body, ^block-id)
    expect(alpha).toContain("## Shared task ^shared-1")
    expect(alpha).toContain("Details here")

    // Beta has embed reference (renders target node inline)
    expect(beta).toContain("![[^shared-1]]")
    expect(beta).not.toContain("Details here")

    // Non-shared task renders normally as heading
    expect(beta).toContain("## Beta only ^only-beta")
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
    const md = files.get("test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    // Tasks are headings now (oi), not list items
    const headings = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    // Section + parent task + 2 subtasks = 4 H2 headings
    expect(headings.length).toBeGreaterThanOrEqual(3)

    // Body text appears as a paragraph
    const paragraph = tree.children.find((n) => n.type === "paragraph")
    expect(paragraph).toBeDefined()
  })

  test("task with body bullets: bullets become list in roundtrip", () => {
    const data = makeRoundtripData([
      {
        sourceId: "bullet-task",
        title: "Task with bullets",
        body: "Planning notes:\n\n*   First option\n*   Second option\n*   Third option\n\nAdditional context here.",
      },
    ])

    const files = convert(data)
    const md = files.get("test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    // With oi type, body content appears as top-level elements (paragraph + list + paragraph)
    const childTypes = tree.children.map((c) => c.type)
    expect(childTypes).toContain("paragraph")
    expect(childTypes).toContain("list")
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
    const md = files.get("test-project.md")!
    const { body } = extractFrontmatter(md)
    const tree = parseMarkdown(body)

    // All levels are H2 headings now (oi type)
    const headings = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    const headingTexts = headings.map((h) => h.children[0]?.value ?? "")
    // Section + Level 1 + Level 2 + Level 3
    expect(headingTexts.some((t) => t.includes("Level 1"))).toBe(true)
    expect(headingTexts.some((t) => t.includes("Level 2"))).toBe(true)
    expect(headingTexts.some((t) => t.includes("Level 3"))).toBe(true)
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
              items: [
                {
                  sourceId: "shared-rt",
                  title: "Shared task",
                  status: "todo",
                  body: "Details",
                },
              ],
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
                {
                  sourceId: "shared-rt",
                  title: "Shared task",
                  status: "todo",
                  body: "Details",
                },
                { sourceId: "beta-only", title: "Beta only", status: "done" },
              ],
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const betaMd = files.get("project-beta.md")!
    const { body } = extractFrontmatter(betaMd)
    const tree = parseMarkdown(body)

    // With oi type, tasks are headings not list items
    const h2s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    // Work section + dedup ref (embed) + Beta only = 3 H2 headings
    expect(h2s.length).toBeGreaterThanOrEqual(3)

    // Dedup reference heading is an embed (resolves to task title at render time)
    expect(betaMd).toContain("## ![[^shared-rt]]")

    // Beta only heading
    const betaHeading = h2s.find((h) => h.children[0]?.value?.includes("Beta only"))
    expect(betaHeading).toBeDefined()
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
    const md = files.get("test-project.md")!
    const taskLine = md.split("\n").find((l) => l.includes("Metadata task"))!
    expect(taskLine).toBeDefined()

    // With oi type, inline metadata (due::, start::, p::) is stored in node data, not on the heading line
    // But mentions and tags still appear on the heading line
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
          sections: [
            {
              sourceId: "s1",
              title: "Tasks",
              items: [{ sourceId: "t1", title: "A task" }],
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const md = files.get("engineering/frontmatter-test.md")!
    const { frontmatter, body } = extractFrontmatter(md)
    expect(frontmatter).not.toBeNull()

    // imported_from/imported_at removed — import JSON has that info
    expect(frontmatter).not.toContain("imported_from:")
    expect(frontmatter).not.toContain("imported_at:")
    expect(frontmatter).toContain('owner: "@bjorn"')
    expect(frontmatter).not.toContain("asana_project_id:")
    expect(frontmatter).not.toContain("workspace:")
    expect(frontmatter).not.toContain("team:")
    expect(frontmatter).not.toContain("created_at:")
    expect(frontmatter).not.toContain("modified_at:")

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
    const md = files.get("wellness.md")!

    // Task should appear exactly once as a full heading entry
    const fullMatches = md.match(/## Exercise daily/g)
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
              items: [
                {
                  sourceId: "shared-task",
                  title: "Shared task",
                  status: "todo",
                  body: "Full body",
                },
              ],
            },
            {
              sourceId: "sec-a2",
              title: "Section A2",
              items: [
                {
                  sourceId: "shared-task",
                  title: "Shared task",
                  status: "todo",
                  body: "Full body",
                },
              ],
            },
          ],
        },
        {
          sourceId: "projB",
          title: "Beta",
          items: [
            {
              sourceId: "shared-task",
              title: "Shared task",
              status: "todo",
              body: "Full body",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const alpha = files.get("alpha.md")!
    const beta = files.get("beta.md")!

    // Alpha: full content once as heading, no self-reference
    const alphaFullMatches = alpha.match(/## Shared task/g)
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
              items: [
                {
                  sourceId: "tag-task-1",
                  title: "Tagged task",
                  status: "todo",
                  tags: ["health"],
                },
              ],
            },
            {
              sourceId: "sec-2",
              title: "Section 2",
              items: [
                {
                  sourceId: "tag-task-1",
                  title: "Tagged task",
                  status: "todo",
                  tags: ["health"],
                },
              ],
            },
          ],
        },
        {
          sourceId: "proj-tag2",
          title: "Another Project",
          items: [
            {
              sourceId: "tag-task-2",
              title: "Another tagged",
              status: "done",
              tags: ["health"],
            },
          ],
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

// ============================================================================
// Tag dedup on individual tasks (duplicate tag entries)
// ============================================================================

describe("Tag dedup on individual tasks", () => {
  test("duplicate tags on a single task are deduplicated in output", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Double tagged task",
          tags: ["health", "health", "fitness"],
        },
      ]),
    )
    // Each tag should appear exactly once in the task heading
    const taskLine = md.split("\n").find((l) => l.includes("Double tagged task"))!
    expect(taskLine).toBeDefined()
    const healthMatches = taskLine.match(/#health/g)
    expect(healthMatches).toHaveLength(1)
    expect(taskLine).toContain("#fitness")
  })

  test("duplicate tags from subtasks do not create duplicate tag file entries", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-18T00:00:00Z",
      projects: [
        {
          sourceId: "proj1",
          title: "Project One",
          items: [
            {
              sourceId: "parent-1",
              title: "Parent task",
              tags: ["backend"],
              children: [
                { sourceId: "child-1", title: "Child A", tags: ["backend"] },
                { sourceId: "child-2", title: "Child B", tags: ["backend"] },
              ],
            },
          ],
        },
        {
          sourceId: "proj2",
          title: "Project Two",
          items: [{ sourceId: "other-1", title: "Other task", tags: ["backend"] }],
        },
      ],
    }
    const files = convert(data)
    const tagFile = files.get("#backend.md")!
    expect(tagFile).toBeDefined()

    // Each task should appear at most once in the tag file
    const parentRefs = tagFile.match(/parent-1/g)
    expect(parentRefs).toHaveLength(1)
    const childARefs = tagFile.match(/child-1/g)
    expect(childARefs).toHaveLength(1)
    const childBRefs = tagFile.match(/child-2/g)
    expect(childBRefs).toHaveLength(1)
  })
})

// ============================================================================
// Dependency mapping (Asana dependencies/dependents → deps/blocks)
// ============================================================================

/** Helper: convert a single ImportItem to KNodes via itemToNodes */
function itemToNodeList(item: ImportItem): KNode[] {
  const nodes: KNode[] = []
  itemToNodes({ value: 0 }, item, "root", nodes)
  return nodes
}

describe("Dependency mapping", () => {
  test("maps dependencies to deps prop with ^sourceId references", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Blocked task",
      metadata: {
        dependencies: [
          { gid: "dep1", name: "Prerequisite A" },
          { gid: "dep2", name: "Prerequisite B" },
        ],
      },
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data.deps).toBe("^dep1,^dep2")
  })

  test("maps dependents to blocks prop with ^sourceId references", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Blocking task",
      metadata: {
        dependents: [
          { gid: "blk1", name: "Downstream A" },
          { gid: "blk2", name: "Downstream B" },
        ],
      },
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data.blocks).toBe("^blk1,^blk2")
  })

  test("task with both deps and blocks stores both in node data", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Middle task",
      metadata: {
        dependencies: [{ gid: "upstream1", name: "Upstream" }],
        dependents: [{ gid: "downstream1", name: "Downstream" }],
      },
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data.deps).toBe("^upstream1")
    expect(taskNode.data.blocks).toBe("^downstream1")
  })

  test("task without dependencies omits deps/blocks from node data", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Independent task",
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data).not.toHaveProperty("deps")
    expect(taskNode.data).not.toHaveProperty("blocks")
  })

  test("single dependency produces single ^ref (no trailing comma)", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Single dep task",
      metadata: {
        dependencies: [{ gid: "only-dep", name: "Only dep" }],
      },
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data.deps).toBe("^only-dep")
    expect(taskNode.data).not.toHaveProperty("blocks")
  })

  test("empty dependency arrays are not stored", () => {
    const nodes = itemToNodeList({
      sourceId: "t1",
      title: "Empty deps task",
      metadata: {
        dependencies: [],
        dependents: [],
      },
    })
    const taskNode = nodes.find((n) => n.id === "t1")!
    expect(taskNode.data).not.toHaveProperty("deps")
    expect(taskNode.data).not.toHaveProperty("blocks")
  })
})

// ============================================================================
// HTML headings in Asana descriptions (km-tui.import-mangled)
// ============================================================================

describe("HTML headings converted to bold (not ATX headings)", () => {
  test("turndown converts <h1> to bold text, not # heading", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<h1>Important Section</h1><p>Some details here.</p>"
    const md = turndown.turndown(html)
    expect(md).toContain("**Important Section**")
    expect(md).not.toMatch(/^#\s/m)
    expect(md).toContain("Some details here.")
  })

  test("turndown converts <h2> and <h3> to bold text", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<h2>Sub heading</h2><h3>Sub sub heading</h3>"
    const md = turndown.turndown(html)
    expect(md).toContain("**Sub heading**")
    expect(md).toContain("**Sub sub heading**")
    expect(md).not.toMatch(/^#{1,6}\s/m)
  })

  test("empty heading tags produce no output", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<h1></h1><p>After empty heading.</p>"
    const md = turndown.turndown(html)
    expect(md).not.toContain("****")
    expect(md).toContain("After empty heading.")
  })

  test("body with HTML headings does not create new sections on re-parse", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<h1>Requirements</h1><p>Must support X and Y.</p><h2>Notes</h2><p>Additional info.</p>"
    const body = turndown.turndown(html).trim()

    // Build an ImportItem with this body and convert to markdown
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with HTML headings in body",
          body,
        },
      ]),
    )

    // The task heading should appear exactly once
    const taskHeadings = md.match(/## Task with HTML headings in body/g)
    expect(taskHeadings).toHaveLength(1)

    // Body content should NOT produce additional H1/H2 headings
    expect(md).not.toMatch(/^# Requirements$/m)
    expect(md).not.toMatch(/^## Requirements$/m)
    expect(md).not.toMatch(/^## Notes$/m)

    // Body should contain bold text instead
    expect(md).toContain("**Requirements**")
    expect(md).toContain("**Notes**")
  })

  test("roundtrip: task with heading-body does not split into multiple items", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<h1>Overview</h1><p>Details about the task.</p><h2>Steps</h2><ul><li>Step 1</li><li>Step 2</li></ul>"
    const body = turndown.turndown(html).trim()

    const data = makeData([
      {
        sourceId: "roundtrip-heading",
        title: "Roundtrip heading task",
        body,
      },
    ])

    const files = convert(data)
    const md = [...files.values()][0]!
    const { body: parsedBody } = extractFrontmatter(md)
    const tree = parseMarkdown(parsedBody)

    // Should have only 1 H2 heading (the task itself), not additional ones from body
    const h2s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    const headingTexts = h2s.map((h) => h.children.map((c) => ("value" in c ? c.value : "")).join(""))
    expect(headingTexts.filter((t) => t.includes("Roundtrip heading task"))).toHaveLength(1)
    // No headings from the body content
    expect(headingTexts.some((t) => t.includes("Overview"))).toBe(false)
    expect(headingTexts.some((t) => t.includes("Steps"))).toBe(false)
  })
})

// ============================================================================
// Block reference stripping (→ ^numericId from Asana recurring tasks)
// ============================================================================

/** Helper: create a minimal AsanaApiTask with defaults */
function makeAsanaTask(overrides: Partial<AsanaApiTask> & { gid: string; name: string }): AsanaApiTask {
  return {
    notes: "",
    completed: false,
    ...overrides,
  }
}

describe("Block reference stripping (→ ^numericId)", () => {
  test("toImportItem strips → ^numericId from task name", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Fitted shirts (Bonobos.com) SF & Santana Row → ^688222992104100",
    })
    const item = toImportItem(task)
    expect(item.title).toBe("Fitted shirts (Bonobos.com) SF & Santana Row")
    expect(item.title).not.toContain("→")
    expect(item.title).not.toContain("^688222992104100")
  })

  test("toImportItem stores parentTaskGid in metadata", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Buy groceries → ^9999",
    })
    const item = toImportItem(task)
    expect(item.metadata?.parentTaskGid).toBe("9999")
  })

  test("toImportItem does not strip when no → ^numericId pattern", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Normal task title",
    })
    const item = toImportItem(task)
    expect(item.title).toBe("Normal task title")
    expect(item.metadata?.parentTaskGid).toBeUndefined()
  })

  test("toImportItem strips → ^numericId from body content (plain notes)", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Task",
      notes: "See parent → ^688222992104100 for details",
    })
    const item = toImportItem(task)
    expect(item.body).toBe("See parent for details")
    expect(item.body).not.toContain("→")
  })

  test("toImportItem strips → ^numericId from body content (html_notes)", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Task",
      html_notes: "<body><p>Reference → ^12345 here</p></body>",
    })
    const item = toImportItem(task)
    expect(item.body).not.toContain("→")
    expect(item.body).not.toContain("^12345")
  })

  test("convert resolves parentTaskGid to link_to when target exists", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-19T00:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Test",
          items: [
            { sourceId: "688222992104100", title: "Parent recurring task" },
            {
              sourceId: "child-1",
              title: "Fitted shirts (Bonobos.com)",
              metadata: { parentTaskGid: "688222992104100" },
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const md = [...files.values()][0]!
    // The child task title should not contain the block ref
    expect(md).toContain("Fitted shirts (Bonobos.com)")
    expect(md).not.toContain("→ ^688222992104100")
  })

  test("convert sets link_to on node when parentTaskGid target exists", () => {
    const nodes: KNode[] = []
    const counter = { value: 0 }
    const primaryMap = new Map([["99999", "test.md"]])
    itemToNodes(
      counter,
      {
        sourceId: "child-1",
        title: "Child task",
        metadata: { parentTaskGid: "99999" },
      },
      "root",
      nodes,
      undefined,
      primaryMap,
    )
    const taskNode = nodes.find((n) => n.id === "child-1")!
    expect(taskNode.link_to).toBe("^99999")
  })

  test("convert omits link_to when parentTaskGid target does not exist", () => {
    const nodes: KNode[] = []
    const counter = { value: 0 }
    const primaryMap = new Map<string, string>()
    itemToNodes(
      counter,
      {
        sourceId: "child-1",
        title: "Child task",
        metadata: { parentTaskGid: "nonexistent" },
      },
      "root",
      nodes,
      undefined,
      primaryMap,
    )
    const taskNode = nodes.find((n) => n.id === "child-1")!
    expect(taskNode.link_to).toBeNull()
  })

  test("handles multiple spaces around arrow in → ^numericId", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Task with spaces  →  ^12345",
    })
    const item = toImportItem(task)
    expect(item.title).toBe("Task with spaces")
    expect(item.metadata?.parentTaskGid).toBe("12345")
  })
})

// ============================================================================
// HTML content escaping (roundtrip: HTML → turndown → markdown → parser)
// ============================================================================

describe("HTML content escaping", () => {
  const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")

  /** Helper: roundtrip HTML through turndown → markdown parser, return parsed AST */
  function roundtrip(html: string) {
    const md = turndown.turndown(html)
    const tree = parseMarkdown(md)
    return { md, tree }
  }

  /** Helper: extract all text from a parsed tree (concatenate all text nodes) */
  function allText(tree: ReturnType<typeof parseMarkdown>): string {
    const { nodeToText } = require("@km/markdown") as typeof import("@km/markdown")
    return tree.children.map((n) => nodeToText(n)).join("\n")
  }

  /** Helper: check if any node in the tree has a given type (recursive) */
  function hasNodeType(node: import("mdast").RootContent | import("mdast").Root, type: string): boolean {
    if (node.type === type) return true
    if ("children" in node && Array.isArray(node.children)) {
      return node.children.some((c) => hasNodeType(c, type))
    }
    return false
  }

  test("asterisks in plain text are not interpreted as italic", () => {
    const { tree } = roundtrip("<body><p>Buy * brand shirts from * store</p></body>")
    expect(hasNodeType(tree, "emphasis")).toBe(false)
    expect(allText(tree)).toContain("* brand")
    expect(allText(tree)).toContain("* store")
  })

  test("brackets in plain text are not interpreted as link start", () => {
    const { tree } = roundtrip("<body><p>See [roadmap outline] for details</p></body>")
    expect(hasNodeType(tree, "link")).toBe(false)
    expect(allText(tree)).toContain("[roadmap outline]")
  })

  test("[text] followed by (url-like) is not interpreted as a link", () => {
    const { tree } = roundtrip("<body><p>See [project plan](notes section) for details</p></body>")
    expect(hasNodeType(tree, "link")).toBe(false)
    expect(allText(tree)).toContain("[project plan]")
  })

  test("real HTML link is preserved as a markdown link", () => {
    const { tree } = roundtrip('<body><p>Visit <a href="http://example.com">the site</a> now</p></body>')
    expect(hasNodeType(tree, "link")).toBe(true)
    const link = tree.children.flatMap((n) => ("children" in n ? n.children : [])).find((c) => c.type === "link")
    expect(link.url).toBe("http://example.com")
  })

  test("text starting with # is not interpreted as a heading", () => {
    const { tree } = roundtrip("<body><p># Not a heading</p></body>")
    expect(hasNodeType(tree, "heading")).toBe(false)
    expect(allText(tree)).toContain("# Not a heading")
  })

  test("text starting with > is not interpreted as a blockquote", () => {
    const { tree } = roundtrip("<body><p>> Not a blockquote</p></body>")
    expect(hasNodeType(tree, "blockquote")).toBe(false)
    expect(allText(tree)).toContain("> Not a blockquote")
  })

  test("backticks in plain text are not interpreted as code spans", () => {
    const { tree } = roundtrip("<body><p>Use `backticks` carefully</p></body>")
    expect(hasNodeType(tree, "inlineCode")).toBe(false)
    expect(allText(tree)).toContain("`backticks`")
  })

  test("underscores in plain text are not interpreted as italic", () => {
    const { tree } = roundtrip("<body><p>Text with _underscores_ here</p></body>")
    expect(hasNodeType(tree, "emphasis")).toBe(false)
    expect(allText(tree)).toContain("_underscores_")
  })

  test("tildes in plain text are not interpreted as strikethrough", () => {
    const { tree } = roundtrip("<body><p>Text with ~~tildes~~ here</p></body>")
    expect(hasNodeType(tree, "delete")).toBe(false)
    expect(allText(tree)).toContain("~~tildes~~")
  })

  test("mixed special chars in one paragraph survive roundtrip", () => {
    const { tree } = roundtrip(
      "<body><p>Buy * brand, see [plan], use `code`, _emphasis_, ~~strike~~, > quote, # hash</p></body>",
    )
    const text = allText(tree)
    expect(hasNodeType(tree, "emphasis")).toBe(false)
    expect(hasNodeType(tree, "link")).toBe(false)
    expect(hasNodeType(tree, "inlineCode")).toBe(false)
    expect(hasNodeType(tree, "delete")).toBe(false)
    expect(text).toContain("* brand")
    expect(text).toContain("[plan]")
    expect(text).toContain("`code`")
    expect(text).toContain("_emphasis_")
    expect(text).toContain("~~strike~~")
  })

  test("real Asana example: asterisks in product description", () => {
    const { tree } = roundtrip("<body><p>Buy * brand from store</p></body>")
    expect(hasNodeType(tree, "emphasis")).toBe(false)
    expect(allText(tree)).toContain("Buy * brand from store")
  })

  test("real Asana example: brackets in reference text", () => {
    const { tree } = roundtrip("<body><p>See [roadmap outline] for details</p></body>")
    expect(hasNodeType(tree, "link")).toBe(false)
    expect(allText(tree)).toContain("See [roadmap outline] for details")
  })

  test("backslashes in text are preserved", () => {
    const { tree } = roundtrip("<body><p>Path is C:\\Users\\docs</p></body>")
    const text = allText(tree)
    // Backslashes should survive (may be escaped in md but parser should restore them)
    expect(text).toContain("C:")
    expect(text).toContain("Users")
  })

  // Verify real HTML elements still convert properly (no over-escaping)

  test("strong tags still produce bold markdown", () => {
    const { md, tree } = roundtrip("<body><p><strong>bold text</strong></p></body>")
    expect(md).toContain("**bold text**")
    expect(hasNodeType(tree, "strong")).toBe(true)
  })

  test("em tags still produce italic markdown", () => {
    const { md, tree } = roundtrip("<body><p><em>italic text</em></p></body>")
    // Turndown uses _ for emphasis by default (emDelimiter: '_')
    expect(md).toContain("_italic text_")
    expect(hasNodeType(tree, "emphasis")).toBe(true)
  })

  test("anchor tags still produce link markdown", () => {
    const { md, tree } = roundtrip('<body><p><a href="http://example.com">link text</a></p></body>')
    expect(md).toContain("[link text](http://example.com)")
    expect(hasNodeType(tree, "link")).toBe(true)
  })

  test("code tags still produce code markdown", () => {
    const { md, tree } = roundtrip("<body><p><code>code text</code></p></body>")
    expect(md).toContain("`code text`")
    expect(hasNodeType(tree, "inlineCode")).toBe(true)
  })

  test("del/s tags are preserved as text (no GFM plugin installed)", () => {
    // Turndown without turndown-plugin-gfm strips <del> tags to plain text
    const { tree } = roundtrip("<body><p><del>deleted text</del></p></body>")
    expect(allText(tree)).toContain("deleted text")
  })
})

// ============================================================================
// Escaped checkboxes (km-tui.escaped-checkboxes)
// ============================================================================

describe("escaped checkboxes unescaped in turndown output", () => {
  test("turndown does not escape [x] checkbox syntax", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<body><ul><li>[x] done item</li><li>[ ] pending item</li></ul></body>"
    const md = turndown.turndown(html)
    expect(md).toContain("[x] done item")
    expect(md).toContain("[ ] pending item")
    expect(md).not.toContain("\\[x\\]")
    expect(md).not.toContain("\\[ \\]")
  })

  test("turndown does not escape [] empty checkbox syntax", () => {
    const { turndown } = require("../../src/import/adapters/asana/asana-types.ts")
    const html = "<body><ul><li>[] unchecked task</li></ul></body>"
    const md = turndown.turndown(html)
    expect(md).toContain("[] unchecked task")
    expect(md).not.toContain("\\[\\]")
  })
})

// ============================================================================
// Placeholder section handling
// ============================================================================

describe("placeholder section titles", () => {
  test('sections titled "(no section)" are omitted — items go under project root', () => {
    const data = makeDataWithSections([
      {
        title: "(no section)",
        items: [{ sourceId: "t1", title: "Loose task", status: "todo" }],
      },
      {
        title: "Backlog",
        items: [{ sourceId: "t2", title: "Backlog task", status: "todo" }],
      },
    ])
    const md = convertToMd(data)
    expect(md).not.toContain("(no section)")
    expect(md).toContain("## Backlog")
    expect(md).toContain("Loose task")
    expect(md).toContain("Backlog task")
  })

  test('sections titled "Untitled Section" are omitted', () => {
    const data = makeDataWithSections([
      {
        title: "Untitled Section",
        items: [{ sourceId: "t1", title: "Task A", status: "todo" }],
      },
    ])
    const md = convertToMd(data)
    expect(md).not.toContain("Untitled Section")
    expect(md).toContain("Task A")
  })

  test("placeholder detection is case-insensitive", () => {
    const data = makeDataWithSections([
      {
        title: "(No Section)",
        items: [{ sourceId: "t1", title: "Task B", status: "todo" }],
      },
    ])
    const md = convertToMd(data)
    expect(md).not.toContain("No Section")
    expect(md).toContain("Task B")
  })
})

// ============================================================================
// Empty project title fallback
// ============================================================================

describe("empty project title fallback", () => {
  test("empty project title renders as (untitled)", () => {
    const data = makeData([{ sourceId: "t1", title: "A task", status: "todo" }], "")
    const md = convertToMd(data)
    expect(md).toContain("# (untitled)")
    expect(md).not.toMatch(/^# -$/m)
  })

  test("whitespace-only project title renders as (untitled)", () => {
    const data = makeData([{ sourceId: "t1", title: "A task", status: "todo" }], "   ")
    const md = convertToMd(data)
    expect(md).toContain("# (untitled)")
  })

  test("non-empty project title is preserved", () => {
    const data = makeData([{ sourceId: "t1", title: "A task", status: "todo" }], "Early Orbit")
    const md = convertToMd(data)
    expect(md).toContain("# Early Orbit")
  })
})
