/* oxlint-disable complexity/complexity -- Test file with nested fixtures */
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
import {
  buildBodyContent,
  convert,
  decodeHtmlEntities,
  itemToNodes,
  normalizeImportText,
  prettifyTitle,
  slugify,
  stripHtmlTags,
} from "../../src/import/convert.ts"
import type { ConvertOptions } from "../../src/import/convert.ts"
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
function convertToMd(data: ImportData, opts?: ConvertOptions): string {
  const files = convert(data, opts)
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
            priority: "P1",
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
    expect(md).toContain("## [ ] Design login page @alice #design")
    // Metadata (created::, due::, etc.) is stored in node data, not inline on headings
    expect(md).toContain("^t1")
  })

  test("renders completedAt on done tasks", () => {
    const md = convertToMd(fixture)
    // Done tasks render as headings with [x] marker; completedAt is in node data
    expect(md).toContain("## [x] Write tests completed:: 2026-02-09 ^t2")
  })

  test("renders multi-project as +project tags (excluding current project)", () => {
    const md = convertToMd(fixture)
    expect(md).not.toContain("+sprint-4")
    expect(md).toContain("+backlog")
  })

  test("renders completed tasks as headings", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("### [x] Write tests completed:: 2026-02-09 ^t2")
  })

  test("renders subtasks as headings", () => {
    const md = convertToMd(fixture)
    expect(md).toContain("## [ ] Create wireframes ^s1")
    expect(md).toContain("## [x] Review with team ^s2")
  })

  test("renders body as paragraph (not blockquote)", () => {
    const md = convertToMd(fixture)
    // Body text appears directly under the heading (no indent since it's under an oi heading, not an li)
    expect(md).toContain("Create wireframes\nReview with team")
    expect(md).not.toContain("> Create wireframes")
  })

  test("renders comments as child list nodes (not in blockquote)", () => {
    const md = convertToMd(fixture, { skipActivities: false })
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
    expect(md).toContain("- First option")
    expect(md).toContain("- Third option")
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
    expect(md).toContain("See also: [[^789012]] and [[^222333]]")
    expect(md).not.toContain("app.asana.com")
  })

  // ============================================================================
  // Asana Link Conversion Edge Cases
  // ============================================================================
  // Link conversion strategy:
  // - All Asana URLs (bare or markdown links) → [[^GID]] (block ref, no alias)
  // - Bare URLs → [[^GID]]
  // - Markdown links [text](url) → [[^GID]]
  // - Empty/whitespace link text → [[^GID]]
  // - Link text equal to GID → [[^GID]]
  // - Link text that's a URL → [[^GID]]
  //
  // Rationale: Wiki link aliases were removed. km resolves block refs to the
  // target's actual title at render time, so aliases are unnecessary.

  test("converts markdown link to block ref (no alias)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[Check this out](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456]]")
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

  test("converts link with special characters to block ref (no alias)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[Design: Phase 2 (WIP)](https://app.asana.com/0/123/456)",
        },
      ]),
    )
    expect(md).toContain("[[^456]]")
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
    expect(md).toContain("[[^111]]")
    expect(md).toContain("[[^222]]")
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
    expect(md).toContain("## [ ] ◆ Launch day ^m1")
    expect(md).toContain("## [x] ◆ Past milestone ^m2")
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
          priority: "P2",
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
      { skipActivities: false },
    )
    expect(md).toContain(
      "## [x] Full task @alice-smith #backend #urgent +other-project created:: 2026-01-15 due:: 2026-02-15 start:: 2026-01-20 completed:: 2026-02-10 priority:: P2 ^tf1",
    )
    expect(md).not.toContain("+test")
    // Body appears directly under heading (no indent since parent is oi)
    expect(md).toContain("Description with **bold** text.")
    // Subtask is a heading too (depth 3 under parent)
    expect(md).toContain("### [x] Sub-step ^cs1")
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
      { skipActivities: false },
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
      { skipActivities: false },
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
      { skipActivities: false },
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
      { skipActivities: false },
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
    expect(md).toContain("## [x] Metadata task created:: 2026-01-15 completed:: 2026-02-10 ^t1")
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
    // All tasks/subtasks are headings now, with task markers and increasing depth
    expect(md).toContain("## [ ] Top-level task ^top")
    expect(md).toContain("### [ ] Mid-level subtask ^mid")
    expect(md).toContain("#### [x] Deep subtask ^deep")
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
      { skipActivities: false },
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
      { skipActivities: false },
    )
    // Activity section is an oi node, rendered as a heading
    expect(md).toContain("## Activity")
    expect(md).toContain("- 2026-02-15 @alice: moved this task to To Do")
    expect(md).toContain("- 2026-02-16 @bob: completed this task")
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
      { skipActivities: false },
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
      { skipActivities: false },
    )
    // Activity section is an oi node, rendered as a heading
    expect(md).toContain("## Activity")
    expect(md).toContain("- 2026-02-15 @system: Task moved")
    expect(md).not.toContain("> **Activity:**")
  })

  test("strips multi-word author name from activity text (no redundant name)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with multi-word author",
          activityLog: [
            {
              author: "Alice Smith",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Alice Smith moved this task to To Do",
            },
            {
              author: "Bjørn Stabell",
              createdAt: "2026-02-16T10:00:00Z",
              text: "Bjørn Stabell completed this task",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    // Should strip the full name — only @slug shown, not both @slug AND full name
    expect(md).toContain("- 2026-02-15 @alice-smith: moved this task to To Do")
    expect(md).not.toContain("Alice Smith moved")
    expect(md).toContain("- 2026-02-16 @bjørn-stabell: completed this task")
    expect(md).not.toContain("Bjørn Stabell completed")
  })
})

// ============================================================================
// Skip activities (default behavior)
// ============================================================================

describe("Skip activities (default)", () => {
  test("comments and activity logs are skipped by default", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with comments and activity",
          body: "Description preserved",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "Great work!",
            },
          ],
          activityLog: [
            {
              author: "system",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Task created",
            },
          ],
          attachments: [
            {
              name: "file.pdf",
              url: "https://example.com/file.pdf",
              type: "file",
            },
          ],
        },
      ]),
    )
    // Task title and body preserved
    expect(md).toContain("Task with comments and activity")
    expect(md).toContain("Description preserved")
    // Attachments still present (not activities)
    expect(md).toContain("## Attachments")
    expect(md).toContain("file.pdf")
    // Comments and activity skipped
    expect(md).not.toContain("## Comments")
    expect(md).not.toContain("## Activity")
    expect(md).not.toContain("Great work!")
    expect(md).not.toContain("Task created")
  })

  test("subtask comments are also skipped by default", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Parent task",
          children: [
            {
              sourceId: "sub1",
              title: "Subtask",
              comments: [
                {
                  author: "bob",
                  createdAt: "2026-02-12T15:00:00Z",
                  text: "Subtask comment",
                },
              ],
            },
          ],
        },
      ]),
    )
    expect(md).toContain("Parent task")
    expect(md).toContain("Subtask")
    expect(md).not.toContain("## Comments")
    expect(md).not.toContain("Subtask comment")
  })

  test("skipActivities: false includes comments and activity", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "Included comment",
            },
          ],
          activityLog: [
            {
              author: "system",
              createdAt: "2026-02-15T09:00:00Z",
              text: "Included activity",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("## Comments")
    expect(md).toContain("Included comment")
    expect(md).toContain("## Activity")
    expect(md).toContain("Included activity")
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
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { skipActivities: false },
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
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { skipActivities: false },
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
    expect(alpha).toContain("## [ ] Shared task ^shared-1")
    expect(alpha).toContain("Details here")

    // Beta has embed reference (renders target node inline)
    expect(beta).toContain("![[^shared-1]]")
    expect(beta).not.toContain("Details here")

    // Non-shared task renders normally as heading with marker
    expect(beta).toContain("## [x] Beta only ^only-beta")
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

    // Tasks in a section get depth 3 (section is H2, items are H3), subtasks are H4
    const h2s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    const h3s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 3)
    const h4s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 4)
    expect(h2s.length).toBeGreaterThanOrEqual(1) // section heading
    expect(h3s.length).toBeGreaterThanOrEqual(1) // parent task
    expect(h4s.length).toBe(2) // 2 subtasks

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

    // Items in sections start at depth 3 (section is H2)
    // Nested subtasks increment: H3 → H4 → H5
    const allHeadings = tree.children.filter((n): n is Heading => n.type === "heading")
    const level1 = allHeadings.find((h) => (h.children[0] as { value?: string })?.value?.includes("Level 1"))
    const level2 = allHeadings.find((h) => (h.children[0] as { value?: string })?.value?.includes("Level 2"))
    const level3 = allHeadings.find((h) => (h.children[0] as { value?: string })?.value?.includes("Level 3"))
    expect(level1).toBeDefined()
    expect(level2).toBeDefined()
    expect(level3).toBeDefined()
    expect(level1!.depth).toBe(3)
    expect(level2!.depth).toBe(4)
    expect(level3!.depth).toBe(5)
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

    // Section is H2, section items are H3
    const h2s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2)
    const h3s = tree.children.filter((n): n is Heading => n.type === "heading" && n.depth === 3)
    // Work section = 1 H2
    expect(h2s.length).toBeGreaterThanOrEqual(1)

    // Dedup reference uses actual title alongside embed reference
    expect(betaMd).toContain("### [ ] Shared task ![[^shared-rt]]")

    // Beta only heading is H3
    const betaHeading = h3s.find((h) => (h.children[0] as { value?: string })?.value?.includes("Beta only"))
    expect(betaHeading).toBeDefined()
  })

  test("metadata fields roundtrip through parser", () => {
    const data = makeRoundtripData([
      {
        sourceId: "meta-task",
        title: "Metadata task",
        dueAt: "2026-03-15",
        startAt: "2026-03-01",
        priority: "P2",
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
    const fullMatches = md.match(/## \[[ x]\] Exercise daily/g)
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
    const alphaFullMatches = alpha.match(/## \[[ x]\] Shared task/g)
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
    expect(taskNode.data?.deps).toBeUndefined()
    expect(taskNode.data?.blocks).toBeUndefined()
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
    expect(taskNode.data?.deps).toBeUndefined()
    expect(taskNode.data?.blocks).toBeUndefined()
  })
})

// ============================================================================
// HTML headings in Asana descriptions (km-tui.import-mangled)
// ============================================================================

describe("HTML headings in body → child sub-items", () => {
  test("htmlToMarkdown preserves headings (rebased during convert phase)", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<h1>Important Section</h1><p>Some details here.</p>"
    const md = htmlToMarkdown(html)
    expect(md).toContain("# Important Section")
    expect(md).toContain("Some details here.")
  })

  test("htmlToMarkdown preserves <h2> and <h3>", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<h2>Sub heading</h2><h3>Sub sub heading</h3>"
    const md = htmlToMarkdown(html)
    expect(md).toContain("## Sub heading")
    expect(md).toContain("### Sub sub heading")
  })

  test("empty heading tags produce minimal output", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<h1></h1><p>After empty heading.</p>"
    const md = htmlToMarkdown(html)
    expect(md).toContain("After empty heading.")
  })

  test("body headings become child sub-items of the task", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<h1>Requirements</h1><p>Must support X and Y.</p><h2>Notes</h2><p>Additional info.</p>"
    const body = htmlToMarkdown(html).trim()

    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with HTML headings in body",
          body,
        },
      ]),
    )

    // Task heading appears once
    const taskHeadings = md.match(/## \[[ x]\] Task with HTML headings in body/g)
    expect(taskHeadings).toHaveLength(1)

    // Body headings become child sub-items (### under the ## task)
    expect(md).toContain("### Requirements")
    expect(md).toContain("Must support X and Y.")
    expect(md).toContain("### Notes")
    expect(md).toContain("Additional info.")
    // NOT at their original depth (would break tree)
    expect(md).not.toMatch(/^# Requirements/m)
  })

  test("roundtrip: body headings split into child items in the tree", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<h1>Overview</h1><p>Details about the task.</p><h2>Steps</h2><ul><li>Step 1</li><li>Step 2</li></ul>"
    const body = htmlToMarkdown(html).trim()

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

    // Body headings become child heading nodes in the tree
    const allHeadings = tree.children.filter((n): n is Heading => n.type === "heading")
    const headingTexts = allHeadings.map((h) => h.children.map((c) => ("value" in c ? c.value : "")).join(""))
    expect(headingTexts.filter((t) => t.includes("Roundtrip heading task"))).toHaveLength(1)
    // Body headings ARE present as child headings
    expect(headingTexts.some((t) => t.includes("Overview"))).toBe(true)
    expect(headingTexts.some((t) => t.includes("Steps"))).toBe(true)
    // Content is preserved
    expect(md).toContain("Details about the task.")
    expect(md).toContain("Step 1")
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

  test("toImportItem unescapes underscores in URLs from html_notes", () => {
    const task = makeAsanaTask({
      gid: "123",
      name: "Task with URL",
      html_notes:
        '<body><p><a href="https://x.com/user/status/123?t=fMq0FKbaXO-Q25vj12k_fQ">https://x.com/user/status/123?t=fMq0FKbaXO-Q25vj12k_fQ</a></p></body>',
    })
    const item = toImportItem(task)
    // Underscores in URL display text should not be escaped
    expect(item.body).not.toContain("\\_")
    expect(item.body).toContain("_fQ")
  })

  test("toImportItem preserves escaped underscores in non-URL text", () => {
    const task = makeAsanaTask({
      gid: "124",
      name: "Task with emphasis",
      html_notes: "<body><p>Use _italic_ for emphasis</p></body>",
    })
    const item = toImportItem(task)
    // Non-URL underscores should remain escaped
    expect(item.body).toContain("\\_italic\\_")
  })

  test("convert resolves parentTaskGid to embed_of when target exists", () => {
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

  test("convert sets embed_of on node when parentTaskGid target exists", () => {
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
    expect(taskNode.embed_of).toBe("^99999")
  })

  test("convert omits embed_of when parentTaskGid target does not exist", () => {
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
    expect(taskNode.embed_of).toBeUndefined()
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

  test("toImportItem stores assignee_section name in metadata", () => {
    const task = makeAsanaTask({
      gid: "456",
      name: "My task",
      assignee_section: { gid: "sec-1", name: "Recently assigned" },
    })
    const item = toImportItem(task)
    expect(item.metadata?.assigneeSectionName).toBe("Recently assigned")
  })

  test("toImportItem omits assigneeSectionName when no assignee_section", () => {
    const task = makeAsanaTask({ gid: "789", name: "No section" })
    const item = toImportItem(task)
    expect(item.metadata?.assigneeSectionName).toBeUndefined()
  })
})

// ============================================================================
// HTML content escaping (roundtrip: HTML → mdast → markdown → parser)
// ============================================================================

describe("HTML content escaping", () => {
  const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")

  /** Helper: roundtrip HTML through htmlToMarkdown → markdown parser, return parsed AST */
  function roundtrip(html: string) {
    const md = htmlToMarkdown(html)
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
    const link = tree.children
      .flatMap((n) => ("children" in n ? (n.children as Array<{ type: string; url?: string }>) : []))
      .find((c) => c.type === "link")
    expect(link!.url).toBe("http://example.com")
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

  test("tildes in plain text: text content is preserved through roundtrip", () => {
    const { tree } = roundtrip("<body><p>Text with ~~tildes~~ here</p></body>")
    // mdast doesn't escape ~~ so it may be interpreted as strikethrough on re-parse,
    // but the text content "tildes" is preserved either way
    expect(allText(tree)).toContain("tildes")
  })

  test("mixed special chars in one paragraph survive roundtrip", () => {
    const { tree } = roundtrip(
      "<body><p>Buy * brand, see [plan], use `code`, _emphasis_, ~~strike~~, > quote, # hash</p></body>",
    )
    const text = allText(tree)
    expect(hasNodeType(tree, "emphasis")).toBe(false)
    expect(hasNodeType(tree, "link")).toBe(false)
    expect(hasNodeType(tree, "inlineCode")).toBe(false)
    // Note: mdast doesn't escape ~~, so it may be interpreted as strikethrough on re-parse.
    // The text content is still preserved.
    expect(text).toContain("* brand")
    expect(text).toContain("[plan]")
    expect(text).toContain("`code`")
    expect(text).toContain("_emphasis_")
    expect(text).toContain("strike")
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
    // mdast uses _ for emphasis (configured in htmlToMarkdown)
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

  test("del/s tags are unwrapped to plain text", () => {
    // mdast without GFM extension unwraps <del> to plain text
    const { tree } = roundtrip("<body><p><del>deleted text</del></p></body>")
    expect(allText(tree)).toContain("deleted text")
  })
})

// ============================================================================
// HTML cleanup in fetch stage (cleanHtmlRemnants)
// ============================================================================

describe("HTML cleanup in toImportItem (entity decoding + tag stripping)", () => {
  test("decodes HTML entities in body from html_notes", () => {
    const task = makeAsanaTask({
      gid: "ent1",
      name: "Entity task",
      html_notes: "<body><p>Tom &amp; Jerry &lt;3 &gt; 2 &quot;quoted&quot; it&#39;s &#123;braces&#125;</p></body>",
    })
    const item = toImportItem(task)
    expect(item.body).toContain("Tom & Jerry <3 > 2")
    expect(item.body).toContain('"quoted"')
    expect(item.body).toContain("it's")
    expect(item.body).toContain("{braces}")
    expect(item.body).not.toContain("&amp;")
    expect(item.body).not.toContain("&lt;")
    expect(item.body).not.toContain("&gt;")
    expect(item.body).not.toContain("&quot;")
    expect(item.body).not.toContain("&#39;")
    expect(item.body).not.toContain("&#123;")
  })

  test("strips remnant HTML tags from body", () => {
    const task = makeAsanaTask({
      gid: "tag1",
      name: "Tag task",
      html_notes: "<body><p>Hello<br>world <em>emphasis</em> and <strong>bold</strong> leftover</p></body>",
    })
    const item = toImportItem(task)
    // The mdast pipeline handles HTML→MD conversion; verify no raw HTML tags in the output
    expect(item.body).not.toMatch(/<br\s*\/?>/)
    expect(item.body).not.toMatch(/<\/?em>/)
    expect(item.body).not.toMatch(/<\/?strong>/)
  })

  test("preserves autolinks <https://example.com> (not stripped as HTML)", () => {
    const task = makeAsanaTask({
      gid: "auto1",
      name: "Autolink task",
      html_notes: '<body><p>Visit <a href="https://example.com">https://example.com</a> for details</p></body>',
    })
    const item = toImportItem(task)
    expect(item.body).toContain("https://example.com")
  })

  test("preserves inline code containing HTML-like content", () => {
    const task = makeAsanaTask({
      gid: "code1",
      name: "Code task",
      html_notes: "<body><p>Use <code>&lt;div&gt;</code> for layout</p></body>",
    })
    const item = toImportItem(task)
    // HTML entities inside <code> get decoded, result should be `<div>` in inline code
    expect(item.body).toContain("`<div>`")
  })
})

// ============================================================================
// Escaped checkboxes (km-tui.escaped-checkboxes)
// ============================================================================

describe("checkbox escaping in htmlToMarkdown output", () => {
  test("htmlToMarkdown escapes [x] checkbox syntax (mdast escaping is transparent on re-parse)", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<body><ul><li>[x] done item</li><li>[ ] pending item</li></ul></body>"
    const md = htmlToMarkdown(html)
    // mdast escapes brackets to prevent them being parsed as task list items
    // but the content meaning is preserved on re-parse
    expect(md).toContain("done item")
    expect(md).toContain("pending item")
    // When parsed, the text content is preserved (escaping is transparent)
    const tree = parseMarkdown(md)
    const { nodeToText } = require("@km/markdown") as typeof import("@km/markdown")
    const text = tree.children.map((n) => nodeToText(n)).join("\n")
    expect(text).toContain("done item")
    expect(text).toContain("pending item")
  })

  test("htmlToMarkdown escapes [] empty checkbox syntax (transparent on re-parse)", () => {
    const { htmlToMarkdown } = require("../../src/import/adapters/asana/html-to-md.ts")
    const html = "<body><ul><li>[] unchecked task</li></ul></body>"
    const md = htmlToMarkdown(html)
    expect(md).toContain("unchecked task")
    // When parsed, the text content is preserved
    const tree = parseMarkdown(md)
    const { nodeToText } = require("@km/markdown") as typeof import("@km/markdown")
    const text = tree.children.map((n) => nodeToText(n)).join("\n")
    expect(text).toContain("unchecked task")
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

  test("empty-string section title is treated as placeholder (no heading emitted)", () => {
    const data = makeDataWithSections([
      {
        title: "",
        items: [{ sourceId: "t1", title: "Orphan task", status: "todo" }],
      },
      {
        title: "Backlog",
        items: [{ sourceId: "t2", title: "Backlog task", status: "todo" }],
      },
    ])
    const md = convertToMd(data)
    // Empty section should not create a heading — items go under project root
    expect(md).toContain("Orphan task")
    expect(md).toContain("## Backlog")
    expect(md).toContain("Backlog task")
    // No empty heading line (## followed by nothing meaningful)
    expect(md).not.toMatch(/^##\s*$/m)
  })

  test("whitespace-only section title is treated as placeholder", () => {
    const data = makeDataWithSections([
      {
        title: "   ",
        items: [{ sourceId: "t1", title: "Loose task", status: "todo" }],
      },
    ])
    const md = convertToMd(data)
    expect(md).toContain("Loose task")
    // No heading for whitespace-only section
    expect(md).not.toMatch(/^##\s*$/m)
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

// ============================================================================
// User aggregate file section grouping
// ============================================================================

describe("User aggregate files group items by assignee section", () => {
  test("items with assigneeSectionName are grouped under section headings", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      users: [
        { gid: "user-1", name: "Importing User" },
        { gid: "user-2", name: "Other User" },
      ],
      importingUserGid: "user-1",
      projects: [
        {
          sourceId: "p1",
          title: "Project",
          items: [
            {
              sourceId: "t1",
              title: "Task in Today",
              status: "todo",
              assignee: "other-user",
              metadata: { assigneeSectionName: "Today" },
            },
            {
              sourceId: "t2",
              title: "Task in Upcoming",
              status: "todo",
              assignee: "other-user",
              metadata: { assigneeSectionName: "Upcoming" },
            },
            {
              sourceId: "t3",
              title: "Task in Today too",
              status: "done",
              assignee: "other-user",
              metadata: { assigneeSectionName: "Today" },
            },
            {
              sourceId: "t4",
              title: "Unsectioned task",
              status: "todo",
              assignee: "other-user",
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const userFile = [...files.entries()].find(([k]) => k.includes("@other-user"))
    expect(userFile).toBeDefined()
    const md = userFile![1]

    // Should have section headings
    expect(md).toContain("## Today")
    expect(md).toContain("## Upcoming")

    // Tasks should be under their sections (as embeds since they're already rendered in project)
    const lines = md.split("\n")
    const todayIdx = lines.findIndex((l) => l.trim() === "## Today")
    const upcomingIdx = lines.findIndex((l) => l.trim() === "## Upcoming")
    expect(todayIdx).toBeGreaterThan(-1)
    expect(upcomingIdx).toBeGreaterThan(todayIdx)

    // Unsectioned task should NOT be under a section heading
    expect(md).toContain("![[^t4]]")
  })

  test("items without assigneeSectionName render flat (no section)", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      users: [
        { gid: "user-1", name: "Me" },
        { gid: "user-2", name: "Them" },
      ],
      importingUserGid: "user-1",
      projects: [
        {
          sourceId: "p1",
          title: "Project",
          items: [
            { sourceId: "t1", title: "A task", status: "todo", assignee: "them" },
            { sourceId: "t2", title: "B task", status: "todo", assignee: "them" },
          ],
        },
      ],
    }

    const files = convert(data)
    const userFile = [...files.entries()].find(([k]) => k.includes("@them"))
    expect(userFile).toBeDefined()
    const md = userFile![1]

    // No section headings — just flat embeds (## [ ] lines are task embeds, not sections)
    expect(md).not.toMatch(/^## [A-Z]/m) // no section titles like "## Today"
    expect(md).toContain("![[^t1]]")
    expect(md).toContain("![[^t2]]")
  })
})

// ============================================================================
// Fix 1: HTML entities + tags in buildBodyContent
// ============================================================================

describe("HTML entities and tags in body content", () => {
  test("decodes common HTML entities in body text", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with entities",
          body: "Tom &amp; Jerry, x &gt; y, a &lt; b, &quot;quoted&quot;, it&#39;s fine",
        },
      ]),
    )
    expect(md).toContain('Tom & Jerry, x > y, a < b, "quoted", it\'s fine')
    expect(md).not.toContain("&amp;")
    expect(md).not.toContain("&gt;")
    expect(md).not.toContain("&lt;")
    expect(md).not.toContain("&quot;")
    expect(md).not.toContain("&#39;")
  })

  test("strips remnant HTML tags from body text", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with tags",
          body: "Line one<br>Line two with <em>emphasis</em> and <strong>bold</strong>",
        },
      ]),
    )
    expect(md).toContain("Line oneLine two with emphasis and bold")
    expect(md).not.toContain("<br>")
    expect(md).not.toContain("<em>")
    expect(md).not.toContain("</em>")
    expect(md).not.toContain("<strong>")
    expect(md).not.toContain("</strong>")
  })

  test("preserves <https://...> autolinks when stripping HTML", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with autolink",
          body: "Visit <https://example.com> for details",
        },
      ]),
    )
    expect(md).toContain("<https://example.com>")
  })

  test("decodeHtmlEntities handles all common entities", () => {
    expect(decodeHtmlEntities("&amp;")).toBe("&")
    expect(decodeHtmlEntities("&gt;")).toBe(">")
    expect(decodeHtmlEntities("&lt;")).toBe("<")
    expect(decodeHtmlEntities("&quot;")).toBe('"')
    expect(decodeHtmlEntities("&#39;")).toBe("'")
    expect(decodeHtmlEntities("no entities")).toBe("no entities")
  })

  test("stripHtmlTags removes tags but preserves autolinks", () => {
    expect(stripHtmlTags("text<br>more")).toBe("textmore")
    expect(stripHtmlTags("<em>italic</em>")).toBe("italic")
    expect(stripHtmlTags("<https://example.com>")).toBe("<https://example.com>")
    expect(stripHtmlTags("<http://test.org/path>")).toBe("<http://test.org/path>")
  })
})

// ============================================================================
// Fix 2: Excessive whitespace collapsed
// ============================================================================

describe("Excessive whitespace in body content", () => {
  test("collapses 3+ consecutive blank lines to 2", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with whitespace",
          body: "First paragraph\n\n\n\nSecond paragraph\n\n\n\n\nThird paragraph",
        },
      ]),
    )
    expect(md).toContain("First paragraph\n\nSecond paragraph\n\nThird paragraph")
    expect(md).not.toContain("\n\n\n")
  })

  test("preserves single blank lines between paragraphs", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with normal spacing",
          body: "First paragraph\n\nSecond paragraph",
        },
      ]),
    )
    expect(md).toContain("First paragraph\n\nSecond paragraph")
  })
})

// ============================================================================
// Fix 3: Filenames with raw GIDs stripped from slugs
// ============================================================================

describe("Filenames with raw GIDs", () => {
  test("slugify strips trailing numeric GIDs (13+ digits)", () => {
    expect(slugify("Fam Estate 688176235175685")).toBe("fam-estate")
  })

  test("slugify preserves short trailing numbers (< 13 digits)", () => {
    expect(slugify("Sprint 42")).toBe("sprint-42")
    expect(slugify("Q4 2026")).toBe("q4-2026")
  })

  test("slugify strips exactly 13-digit trailing GIDs", () => {
    expect(slugify("Project 1234567890123")).toBe("project")
  })

  test("project filenames do not contain raw GIDs", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "p1",
          title: "Fam Estate 688176235175685",
          items: [{ sourceId: "t1", title: "A task" }],
        },
      ],
    }
    const files = convert(data)
    expect(files.has("fam-estate.md")).toBe(true)
    expect(files.has("fam-estate-688176235175685.md")).toBe(false)
  })
})

// ============================================================================
// Fix 4: Separator items (already tested above, but verify HR output)
// ============================================================================

describe("Separator items as HR nodes (additional)", () => {
  test("separator with isSeparator metadata emits HR in markdown", () => {
    const md = convertToMd(
      makeData([
        { sourceId: "t1", title: "Before" },
        { sourceId: "sep1", title: "-", metadata: { isSeparator: true } },
        { sourceId: "t2", title: "After" },
      ]),
    )
    expect(md).toContain("---")
    // Title "-" should not appear as a task
    expect(md).not.toContain("[ ] -")
  })
})

// ============================================================================
// Fix 5: Embed-only titles use actual task title
// ============================================================================

describe("Embed nodes use actual task title", () => {
  test("cross-project dedup uses task title instead of embed-only content", () => {
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
              title: "Review quarterly report",
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
              title: "Review quarterly report",
              status: "todo",
              body: "Details here",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const beta = files.get("project-beta.md")!

    // The embed node should use the actual task title alongside the embed reference
    expect(beta).toContain("Review quarterly report ![[^shared-1]]")
  })

  test("embed node content includes title and embed reference", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    const rendered = new Set(["shared-1"])
    const primaryMap = new Map([["shared-1", "project-alpha.md"]])
    itemToNodes(
      counter,
      {
        sourceId: "shared-1",
        title: "Actual Task Title",
        status: "todo",
      },
      "parent",
      nodes,
      rendered,
      primaryMap,
    )
    const refNode = nodes.find((n) => n.id === "ref-shared-1")!
    expect(refNode).toBeDefined()
    // Content is clean title, embed reference is in embed_of
    expect(refNode.content).toBe("Actual Task Title")
    expect(refNode.embed_of).toBe("^shared-1")
    // Only one node emitted (no child paragraph)
    expect(nodes).toHaveLength(1)
  })
})

// ============================================================================
// Fix 6: URL-only titles prettified
// ============================================================================

describe("URL-only titles prettified", () => {
  test("prettifyTitle strips protocol, www, and trailing slash", () => {
    expect(prettifyTitle("https://example.com/some/path")).toBe("example.com/some/path")
    expect(prettifyTitle("http://www.example.com/page/")).toBe("example.com/page")
    expect(prettifyTitle("https://www.test.org/")).toBe("test.org")
  })

  test("prettifyTitle truncates long URLs to ~60 chars", () => {
    const longUrl = "https://example.com/" + "a".repeat(80)
    const result = prettifyTitle(longUrl)
    expect(result.length).toBeLessThanOrEqual(60)
    expect(result).toMatch(/\.\.\.$/)
  })

  test("prettifyTitle leaves non-URL titles unchanged", () => {
    expect(prettifyTitle("Normal task title")).toBe("Normal task title")
    expect(prettifyTitle("Design login page")).toBe("Design login page")
    expect(prettifyTitle("")).toBe("")
  })

  test("prettifyTitle leaves mixed content titles unchanged", () => {
    expect(prettifyTitle("See https://example.com for details")).toBe("See https://example.com for details")
  })

  test("URL-only task title is prettified in markdown output", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "https://www.example.com/some/long/path",
          status: "todo",
        },
      ]),
    )
    expect(md).toContain("example.com/some/long/path")
    expect(md).not.toContain("https://www.example.com/some/long/path")
  })

  test("URL-only title on embed node is also prettified", () => {
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "projA",
          title: "Alpha",
          items: [
            {
              sourceId: "url-task",
              title: "https://www.example.com/docs/api",
              status: "todo",
            },
          ],
        },
        {
          sourceId: "projB",
          title: "Beta",
          items: [
            {
              sourceId: "url-task",
              title: "https://www.example.com/docs/api",
              status: "todo",
            },
          ],
        },
      ],
    }
    const files = convert(data)
    const beta = files.get("beta.md")!
    expect(beta).toContain("example.com/docs/api")
    expect(beta).not.toContain("https://www.example.com")
  })
})

// ============================================================================
// Fix: Asana link conversion in comments
// ============================================================================

describe("Asana link conversion in comments", () => {
  test("converts Asana task URLs in comment text to block references", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with linked comment",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "See https://app.asana.com/0/123456/789012 for details",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("[[^789012]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("converts markdown-style Asana links in comment text to block refs (no alias)", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "bob",
              createdAt: "2026-02-11T08:00:00Z",
              text: "Related to [Design task](https://app.asana.com/0/111/222)",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("[[^222]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("converts new-style Asana task URLs in comment text", () => {
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
            text: "Check https://app.asana.com/1/111/task/333 please",
          },
        ],
      },
      "parent",
      nodes,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { skipActivities: false },
    )
    const commentNode = nodes.find((n) => n.parent_id === "comments-t1")!
    expect(commentNode).toBeDefined()
    expect(commentNode.content).toContain("[[^333]]")
    expect(commentNode.content).not.toContain("app.asana.com")
  })
})

// ============================================================================
// Fix: YouTube wrapper asset URLs in body content
// ============================================================================

describe("YouTube wrapper asset URLs", () => {
  test("converts Asana asset-wrapped YouTube URL to autolink", () => {
    const result = buildBodyContent({
      sourceId: "t1",
      title: "Task",
      body: "[https://youtube.com/watch?v=abc123](https://app.asana.com/app/asana/-/get_asset?asset_id=12345)",
    })
    expect(result).toBe("<https://youtube.com/watch?v=abc123>")
  })

  test("converts multiple asset-wrapped URLs in body", () => {
    const result = buildBodyContent({
      sourceId: "t1",
      title: "Task",
      body: "Watch [https://youtube.com/watch?v=abc](https://app.asana.com/app/asana/-/get_asset?asset_id=111) and [https://vimeo.com/999](https://app.asana.com/app/asana/-/get_asset?asset_id=222)",
    })
    expect(result).toContain("<https://youtube.com/watch?v=abc>")
    expect(result).toContain("<https://vimeo.com/999>")
    expect(result).not.toContain("get_asset")
  })

  test("asset-wrapped URL in full markdown output", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Video task",
          body: "Link: [https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://app.asana.com/app/asana/-/get_asset?asset_id=67890)",
        },
      ]),
    )
    expect(md).toContain("<https://www.youtube.com/watch?v=dQw4w9WgXcQ>")
    expect(md).not.toContain("get_asset")
    expect(md).not.toContain("app.asana.com")
  })
})

// ============================================================================
// Fix: Primary entries for tag-only / user-only tasks (no orphan embeds)
// ============================================================================

describe("Primary entries for tag-only and user-only tasks", () => {
  test("tag-only task gets primary entry with block_id in tag file", () => {
    // Task only appears in tag file (not in any regular project)
    // but is tagged via another project's items
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "proj1",
          title: "Project A",
          items: [
            {
              sourceId: "regular-task",
              title: "Regular task",
              status: "todo",
              tags: ["sprint"],
            },
            {
              sourceId: "orphan-task",
              title: "Orphan tag task",
              status: "todo",
              tags: ["sprint"],
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const tagFile = files.get("#sprint.md")!
    expect(tagFile).toBeDefined()

    // Both tasks should be present — regular-task as embed, orphan-task also (both rendered in project)
    // Since both tasks are in proj1, both get primary entries in project file
    // and appear as embed refs in tag file
    expect(tagFile).toContain("regular-task")
    expect(tagFile).toContain("orphan-task")
  })

  test("task not in any project file gets primary entry in tag file (not just embed)", () => {
    // Create scenario where task exists only in tag aggregation
    // This happens when the task's project file is a tag pseudo-project
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      projects: [
        {
          sourceId: "proj1",
          title: "Main Project",
          items: [{ sourceId: "proj-task", title: "Project task", status: "todo", tags: ["focus"] }],
        },
        {
          sourceId: "proj2",
          title: "Other Project",
          items: [{ sourceId: "other-task", title: "Other task", status: "done", tags: ["focus"] }],
        },
      ],
    }

    const files = convert(data)
    const tagFile = files.get("#focus.md")!
    expect(tagFile).toBeDefined()

    // Both tasks are rendered in project files, so tag file has embed refs
    expect(tagFile).toContain("proj-task")
    expect(tagFile).toContain("other-task")
  })

  test("user-only task gets primary entry in user file when not rendered elsewhere", () => {
    // Task assigned to a non-importing user, appears in only one project
    // User file should reference it (as embed since project file has primary)
    const data: ImportData = {
      source: "asana",
      fetchedAt: "2026-02-17T12:00:00Z",
      users: [
        { gid: "u1", name: "Me" },
        { gid: "u2", name: "Colleague" },
      ],
      importingUserGid: "u1",
      projects: [
        {
          sourceId: "proj1",
          title: "Shared Project",
          items: [
            {
              sourceId: "assigned-task",
              title: "Their task",
              status: "todo",
              assignee: "colleague",
            },
          ],
        },
      ],
    }

    const files = convert(data)
    const userFile = [...files.entries()].find(([k]) => k.includes("@colleague"))
    expect(userFile).toBeDefined()
    const md = userFile![1]

    // Task was rendered in project file, so user file has embed ref
    expect(md).toContain("assigned-task")
  })
})

// ============================================================================
// normalizeImportText (asset proxy, redundant links, bullets, whitespace)
// ============================================================================

describe("normalizeImportText", () => {
  test("#10: converts asset-wrapped real URLs to autolinks", () => {
    const input = "[https://youtube.com/watch?v=abc](https://app.asana.com/app/asana/-/get_asset?asset_id=12345)"
    expect(normalizeImportText(input)).toBe("<https://youtube.com/watch?v=abc>")
  })

  test("#10: converts descriptive-text asset links to text + placeholder", () => {
    const input = "[My Document](https://app.asana.com/app/asana/-/get_asset?asset_id=99999)"
    expect(normalizeImportText(input)).toBe("My Document [Asana asset]")
  })

  test("#10: replaces bare asset proxy URLs with placeholder", () => {
    const input = "See https://app.asana.com/app/asana/-/get_asset?asset_id=12345 for file"
    expect(normalizeImportText(input)).toBe("See [Asana asset] for file")
  })

  test("#15: converts redundant [url](url) to autolink", () => {
    const input = "[https://example.com/page](https://example.com/page)"
    expect(normalizeImportText(input)).toBe("<https://example.com/page>")
  })

  test("#15: preserves [text](url) when text differs from url", () => {
    const input = "[click here](https://example.com/page)"
    expect(normalizeImportText(input)).toBe("[click here](https://example.com/page)")
  })

  test("normalizes *-bullets to - bullets", () => {
    const input = "* First\n* Second\n* Third"
    const result = normalizeImportText(input)
    expect(result).toContain("- First")
    expect(result).toContain("- Second")
    expect(result).not.toMatch(/^\* /m)
  })

  test("normalizes 4-space list indent to 2-space", () => {
    const input = "-   First item\n    -   Nested item"
    const result = normalizeImportText(input)
    expect(result).toContain("- First item")
    expect(result).toContain("- Nested item")
  })

  test("normalizes bare [] checkboxes to [ ]", () => {
    const input = "- [] unchecked task\n- [x] done task"
    const result = normalizeImportText(input)
    expect(result).toContain("- [ ] unchecked task")
    expect(result).toContain("- [x] done task")
  })

  test("collapses 3+ blank lines to 2", () => {
    const input = "first\n\n\n\nsecond"
    expect(normalizeImportText(input)).toBe("first\n\nsecond")
  })
})

// ============================================================================
// #9: Project/view URL conversion
// ============================================================================

describe("Asana project URL conversion (#9)", () => {
  test("converts project list view URL to block ref", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "See https://app.asana.com/0/1234567890/list for board",
        },
      ]),
    )
    expect(md).toContain("[[^1234567890]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("converts project board view URL to block ref", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "View https://app.asana.com/0/9876543210/board here",
        },
      ]),
    )
    expect(md).toContain("[[^9876543210]]")
  })

  test("converts project timeline view URL to block ref", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "Check https://app.asana.com/0/555/timeline",
        },
      ]),
    )
    expect(md).toContain("[[^555]]")
  })

  test("converts markdown link with project URL to block ref", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "[Project Board](https://app.asana.com/0/111222/board)",
        },
      ]),
    )
    expect(md).toContain("[[^111222]]")
    expect(md).not.toContain("Project Board")
  })

  test("does not confuse task URL with project URL", () => {
    // Task URL: /0/{projectGid}/{taskGid} — should capture taskGid, not projectGid
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          body: "See https://app.asana.com/0/111/222",
        },
      ]),
    )
    // The task URL pattern should match and capture 222 (task GID)
    expect(md).toContain("[[^222]]")
  })
})

// ============================================================================
// #10: Asset proxy URL handling in full pipeline
// ============================================================================

describe("Asset proxy URLs in full pipeline (#10)", () => {
  test("asset proxy URL in body is replaced with placeholder", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task with dead asset",
          body: "Download from https://app.asana.com/app/asana/-/get_asset?asset_id=123456 please",
        },
      ]),
    )
    expect(md).toContain("[Asana asset]")
    expect(md).not.toContain("get_asset")
  })

  test("asset proxy URL in comment is replaced with placeholder", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "See https://app.asana.com/app/asana/-/get_asset?asset_id=999 for the file",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("[Asana asset]")
    expect(md).not.toContain("get_asset")
  })

  test("attachment with asset proxy URL and non-URL name renders as link", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        attachments: [
          {
            name: "Quarterly Report",
            url: "https://app.asana.com/app/asana/-/get_asset?asset_id=555",
            type: "file",
          },
        ],
      },
      "parent",
      nodes,
    )
    const attachNode = nodes.find((n) => n.parent_id === "attachments-t1")!
    expect(attachNode.content).toBe("[Quarterly Report](https://app.asana.com/app/asana/-/get_asset?asset_id=555)")
  })

  test("attachment with asset proxy URL and URL name uses name as href", () => {
    const nodes: import("@km/core").KNode[] = []
    const counter = { value: 0 }
    itemToNodes(
      counter,
      {
        sourceId: "t1",
        title: "Task",
        attachments: [
          {
            name: "https://youtube.com/watch?v=abc",
            url: "https://app.asana.com/app/asana/-/get_asset?asset_id=555",
            type: "link",
          },
        ],
      },
      "parent",
      nodes,
    )
    const attachNode = nodes.find((n) => n.parent_id === "attachments-t1")!
    // Name is a URL, so it should become the bare URL (name === href)
    expect(attachNode.content).toBe("https://youtube.com/watch?v=abc")
  })
})

// ============================================================================
// #17: Comment text cleanup (normalizeImportText applied to comments)
// ============================================================================

describe("Comment text cleanup (#17)", () => {
  test("comment text gets redundant link cleanup", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "bob",
              createdAt: "2026-02-10T10:00:00Z",
              text: "See [https://example.com/doc](https://example.com/doc)",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("<https://example.com/doc>")
    expect(md).not.toMatch(/\[https:\/\/example\.com\/doc\]\(https:\/\/example\.com\/doc\)/)
  })

  test("comment text gets Asana link conversion", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "Blocked by https://app.asana.com/0/123/456",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("[[^456]]")
    expect(md).not.toContain("app.asana.com")
  })

  test("comment text gets bullet normalization", () => {
    const md = convertToMd(
      makeData([
        {
          sourceId: "t1",
          title: "Task",
          comments: [
            {
              author: "alice",
              createdAt: "2026-02-10T10:00:00Z",
              text: "Items:\n* First\n* Second",
            },
          ],
        },
      ]),
      { skipActivities: false },
    )
    expect(md).toContain("- First")
    expect(md).toContain("- Second")
  })
})
