/**
 * Markdown Parsing Tests
 *
 * Tests for parsing markdown to nodes and serializing nodes back to markdown.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Test file accesses untyped AST nodes from markdown parser */

import { describe, expect, test } from "vitest"
import { buildNodeTree, parseMarkdownToNodes, parseMarkdownWithLinks } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import {
  extractFrontmatter,
  extractMentions,
  extractProjects,
  extractTags,
  parseMarkdown,
  parseTaskMetadata,
  parseWikiLinks,
  slugify,
} from "../src/parser.ts"
import { parseHeadingRules } from "@km/core"
import { makeTestNode } from "./helpers/test-utils.ts"

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

/** Create a paragraph node for serialization tests */
const makeParagraph = (content: string) => makeTestNode({ type: "p", content })

/** Create a task node for serialization tests */
const makeTask = (
  content: string,
  opts: {
    status?: "todo" | "done" | "wip" | "dropped" | "blocked"
    marker?: "[ ]" | "[x]" | "[X]" | "[/]" | "[-]" | "[!]"
    dueAt?: string
    priority?: string
  } = {},
) =>
  makeTestNode({
    type: "p",
    item: { list: "-", task: { status: opts.status ?? "todo", marker: opts.marker ?? "[ ]" } },
    content,
    due_at: opts.dueAt,
    priority: opts.priority,
  })

/** Create a section node for serialization tests */
const makeSection = (content: string, _depth?: number) =>
  makeTestNode({
    type: "h",
    item: {},
    fstype: "mdsection",
    content,
    name: content.toLowerCase().replace(/\s+/g, "-"),
  })

/** Create a code node for serialization tests */
const makeCode = (content: string, lang?: string) => makeTestNode({ type: "code", content, data: { lang } })

/** Create a quote node for serialization tests */
const makeQuote = (content: string) => makeTestNode({ type: "quote", content })

/** Create an hr node for serialization tests */
const makeHr = () => makeTestNode({ type: "hr" })

describe("Markdown Parser", () => {
  describe("parseMarkdown", () => {
    test("should parse simple paragraph", () => {
      const ast = parseMarkdown("Hello world")
      expect(ast.type).toBe("root")
      expect(ast.children.length).toBeGreaterThan(0)
    })

    test("should parse headings", () => {
      const ast = parseMarkdown("# Heading 1\n## Heading 2\n### Heading 3")
      const headings = ast.children.filter((n) => n.type === "heading")
      expect(headings.length).toBe(3)
    })

    test("should parse task lists", () => {
      const md = `
- [ ] Open task
- [x] Completed task
- [-] Cancelled task
`
      const ast = parseMarkdown(md)
      const list = ast.children.find((n): n is import("mdast").List => n.type === "list")
      expect(list).toBeDefined()
      expect(list!.children.length).toBe(3)
    })

    test("should parse code blocks", () => {
      const md = "```javascript\nconst x = 1;\n```"
      const ast = parseMarkdown(md)
      const code = ast.children.find((n): n is import("mdast").Code => n.type === "code")
      expect(code).toBeDefined()
      expect(code!.lang).toBe("javascript")
    })

    test("should parse blockquotes", () => {
      const md = "> This is a quote\n> Second line"
      const ast = parseMarkdown(md)
      const quote = ast.children.find((n) => n.type === "blockquote")
      expect(quote).toBeDefined()
    })

    test("should parse tables", () => {
      const md = `
| A | B |
|---|---|
| 1 | 2 |
`
      const ast = parseMarkdown(md)
      const table = ast.children.find((n) => n.type === "table")
      expect(table).toBeDefined()
    })

    test("should parse horizontal rules", () => {
      const md = "Before\n\n---\n\nAfter"
      const ast = parseMarkdown(md)
      const hr = ast.children.find((n) => n.type === "thematicBreak")
      expect(hr).toBeDefined()
    })
  })

  describe("extractFrontmatter", () => {
    test("should extract YAML frontmatter as raw string", () => {
      const md = `---
title: Test Document
tags: [a, b, c]
---

# Content`

      const { frontmatter, body } = extractFrontmatter(md)
      expect(frontmatter).toContain("title: Test Document")
      expect(frontmatter).toContain("tags: [a, b, c]")
      expect(body.trim()).toBe("# Content")
    })

    test("should handle missing frontmatter", () => {
      const md = "# Just content\n\nNo frontmatter here."
      const { frontmatter, body } = extractFrontmatter(md)
      expect(frontmatter).toBeNull()
      expect(body).toBe(md)
    })

    test("should handle empty frontmatter", () => {
      // The regex requires content between the --- delimiters
      // "---\n\n---\n" gives empty string, "---\n---\n" doesn't match
      const md = "---\n\n---\n# Content"
      const { frontmatter, body } = extractFrontmatter(md)
      expect(frontmatter).toBe("")
    })
  })

  describe("parseTaskMetadata", () => {
    test.each([
      // Emoji format
      {
        text: "Task with due 📅 2025-03-15",
        field: "dueAt",
        expected: "2025-03-15",
      },
      {
        text: "Task scheduled ⏳ 2025-03-10",
        field: "startAt",
        expected: "2025-03-10",
      },
      // Inline field format
      {
        text: "Submit report due:2026-01-20",
        field: "dueAt",
        expected: "2026-01-20",
      },
      // start:DATE legacy format is no longer read (only start:: and ⏳ are)
      {
        text: "Call client start:: 2026-01-15",
        field: "startAt",
        expected: "2026-01-15",
      },
    ] as const)("should parse $field from '$text'", ({ text, field, expected }) => {
      expect(parseTaskMetadata(text)[field]).toBe(expected)
    })

    test.each([
      // Only priority:: format is recognized
      { text: "Important task priority:: P1", expected: "P1" },
      { text: "Normal task priority:: P2", expected: "P2" },
      { text: "Low task priority:: P3", expected: "P3" },
    ])("should parse priority $expected from '$text'", ({ text, expected }) => {
      expect(parseTaskMetadata(text).priority).toBe(expected)
    })

    test("emoji/legacy priority not extracted", () => {
      expect(parseTaskMetadata("High priority ⏫").priority).toBeUndefined()
      expect(parseTaskMetadata("Task p:1").priority).toBeUndefined()
    })

    test("should parse multiple inline fields", () => {
      const result = parseTaskMetadata("Submit report due:2026-01-20 priority:: P1")
      expect(result.dueAt).toBe("2026-01-20")
      expect(result.priority).toBe("P1")
    })

    test("text format takes precedence over emoji (canonical format)", () => {
      const result = parseTaskMetadata("Task 📅 2025-03-15 due:2026-01-20")
      expect(result.dueAt).toBe("2026-01-20") // Text format is canonical
    })

    test("parses due date with time", () => {
      const result = parseTaskMetadata("Task 📅 2025-03-15T14:30")
      expect(result.dueAt).toBe("2025-03-15T14:30")
    })

    test("parses scheduled date with time", () => {
      const result = parseTaskMetadata("Task ⏳ 2025-03-10T09:00")
      expect(result.startAt).toBe("2025-03-10T09:00")
    })

    test("date without time is date-only string", () => {
      const result = parseTaskMetadata("Task 📅 2025-03-15 ⏳ 2025-03-10")
      expect(result.dueAt).toBe("2025-03-15")
      expect(result.startAt).toBe("2025-03-10")
    })
  })

  describe("parseWikiLinks", () => {
    test("should parse simple wikilinks", () => {
      const text = "Check out [[Other Page]] for more info."
      const links = parseWikiLinks(text)
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("Other Page")
      expect(links[0]!.alias).toBeUndefined()
      expect(links[0]!.embedded).toBeUndefined()
    })

    test("should parse aliased wikilinks", () => {
      const text = "See [[Target Page|this link]] here."
      const links = parseWikiLinks(text)
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("Target Page")
      expect(links[0]!.alias).toBe("this link")
    })

    test("should parse multiple wikilinks", () => {
      const text = "Links to [[Page A]], [[Page B|B]], and [[Page C]]."
      const links = parseWikiLinks(text)
      expect(links.length).toBe(3)
    })

    test("should handle no wikilinks", () => {
      const text = "No links here, just plain text."
      const links = parseWikiLinks(text)
      expect(links.length).toBe(0)
    })

    test("should detect embedding wikilinks with ! prefix", () => {
      const text = "Embed this: ![[Tasks/Todo]]"
      const links = parseWikiLinks(text)
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("Tasks/Todo")
      expect(links[0]!.embedded).toBe(true)
    })

    test("should detect embedding with section anchor", () => {
      const text = "![[Project#Tasks]]"
      const links = parseWikiLinks(text)
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("Project")
      expect(links[0]!.section).toBe("Tasks")
      expect(links[0]!.embedded).toBe(true)
    })

    test("should detect embedding with alias", () => {
      const text = "![[Project/API|API Docs]]"
      const links = parseWikiLinks(text)
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("Project/API")
      expect(links[0]!.alias).toBe("API Docs")
      expect(links[0]!.embedded).toBe(true)
    })

    test("should distinguish embeddings from regular links in same text", () => {
      const text = "See [[Regular Link]] and embed ![[Embedded Link]]"
      const links = parseWikiLinks(text)
      expect(links.length).toBe(2)

      const regular = links.find((l) => l.target === "Regular Link")
      const embedded = links.find((l) => l.target === "Embedded Link")

      expect(regular).toBeDefined()
      expect(regular!.embedded).toBeUndefined()

      expect(embedded).toBeDefined()
      expect(embedded!.embedded).toBe(true)
    })
  })

  describe("relative wikilinks (./prefix)", () => {
    test("![[./child]] sets relative flag and strips prefix", () => {
      const links = parseWikiLinks("![[./mip]]")
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("mip")
      expect(links[0]!.embedded).toBe(true)
      expect(links[0]!.relative).toBe(true)
    })

    test("[[./child]] sets relative on non-embed link", () => {
      const links = parseWikiLinks("[[./readme]]")
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("readme")
      expect(links[0]!.relative).toBe(true)
      expect(links[0]!.embedded).toBeUndefined()
    })

    test("regular embed does not set relative", () => {
      const links = parseWikiLinks("![[mip]]")
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("mip")
      expect(links[0]!.relative).toBeUndefined()
    })

    test("./child with section anchor", () => {
      const links = parseWikiLinks("![[./project#tasks]]")
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("project")
      expect(links[0]!.section).toBe("tasks")
      expect(links[0]!.relative).toBe(true)
    })

    test("./child with alias", () => {
      const links = parseWikiLinks("![[./project|My Project]]")
      expect(links.length).toBe(1)
      expect(links[0]!.target).toBe("project")
      expect(links[0]!.alias).toBe("My Project")
      expect(links[0]!.relative).toBe(true)
    })
  })

  describe("extractTags", () => {
    test.each([
      {
        text: "Task with #urgent and #work tags",
        expected: ["urgent", "work"],
      },
      { text: "No tags here", expected: [] },
      { text: "#my-tag and #another_tag", expected: ["my-tag", "another_tag"] },
    ])("should extract tags from '$text'", ({ text, expected }) => {
      expect(extractTags(text)).toEqual(expected)
    })
  })

  describe("extractMentions", () => {
    test.each([
      { text: "Assigned to @john and @jane", expected: ["john", "jane"] },
      { text: "No mentions here", expected: [] },
    ])("should extract mentions from '$text'", ({ text, expected }) => {
      expect(extractMentions(text)).toEqual(expected)
    })
  })

  describe("extractProjects", () => {
    test.each([
      {
        text: "Part of +project-alpha and +beta",
        expected: ["project-alpha", "beta"],
      },
      { text: "No projects here", expected: [] },
    ])("should extract projects from '$text'", ({ text, expected }) => {
      expect(extractProjects(text)).toEqual(expected)
    })
  })

  describe("slugify", () => {
    test.each([
      // URL-safe slugs
      { input: "Hello World", expected: "hello-world" },
      { input: "What's New?", expected: "whats-new" },
      { input: "  Extra   Spaces  ", expected: "extra-spaces" },
      // Special characters
      { input: "C++ Programming", expected: "c-programming" },
      { input: "100% Complete", expected: "100-complete" },
      // Unicode (removes non-ASCII chars)
      { input: "Über Cool", expected: "ber-cool" },
    ])("slugify('$input') -> '$expected'", ({ input, expected }) => {
      expect(slugify(input)).toBe(expected)
    })
  })
})

describe("AST to Nodes", () => {
  describe("parseMarkdownToNodes", () => {
    test("should convert simple markdown to nodes", () => {
      const md = `# Title

This is a paragraph.

- [ ] Task one
- [x] Task two
`
      const nodes = parseMarkdownToNodes(md, "test-file.md")
      expect(nodes.length).toBeGreaterThan(0)

      // H1 is merged into file node, so check file has title
      const fileNode = nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
      expect(fileNode?.title).toBe("Title")

      // Should have tasks (li with item.task.marker)
      const tasks = nodes.filter((n) => n.type === "p" && n.item != null && n.item?.task?.marker)
      expect(tasks.length).toBe(2)
    })

    test("should extract task metadata with emoji format (dates only, not priority)", () => {
      const md = `- [ ] Task with due 📅 2025-03-15 priority:: P1`
      const nodes = parseMarkdownToNodes(md, "test.md")
      const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

      expect(task).toBeDefined()
      expect(task!.due_at).toBe("2025-03-15")
      expect(task!.priority).toBe("P1")
    })

    test("should strip task metadata from content field", () => {
      const md = `- [ ] Buy groceries due:: 2024-04-18 created:: 2022-11-02 completed:: 2024-04-18`
      const nodes = parseMarkdownToNodes(md, "test.md")
      const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

      expect(task).toBeDefined()
      // Task-specific metadata (due::) stripped from content, extracted to node fields
      expect(task!.due_at).toBe("2024-04-18")
      expect(task!.content).not.toContain("due:: 2024-04-18")
      // Inline properties (created::, completed::) also stripped — stored in data.metadata,
      // reconstructed by the serializer via stringifyMetadata.
      expect(task!.content).not.toContain("created:: 2022-11-02")
      expect(task!.content).not.toContain("completed:: 2024-04-18")
      expect(task!.content).toContain("Buy groceries")
      // Verify they're stored in data.metadata
      const meta = task!.data?.metadata as Record<string, string>
      expect(meta?.created).toBe("2022-11-02")
      expect(meta?.completed).toBe("2024-04-18")
    })

    test("should strip all task metadata formats from content", () => {
      // Emoji format: date emoji stripped, priority emoji stays as plain text
      const emojiTask = parseMarkdownToNodes(`- [ ] Task A 📅 2025-03-15 ⏫`, "test.md").find(
        (n) => n.type === "p" && n.item != null && n.item?.task?.marker,
      )
      expect(emojiTask!.content).toBe("Task A ⏫")
      expect(emojiTask!.due_at).toBe("2025-03-15")
      expect(emojiTask!.priority).toBeUndefined()

      // Legacy format: due: stripped, p:N stays as plain text
      const legacyTask = parseMarkdownToNodes(`- [ ] Task B due:2025-06-01 p:2`, "test.md").find(
        (n) => n.type === "p" && n.item != null && n.item?.task?.marker,
      )
      expect(legacyTask!.content).toBe("Task B p:2")
      expect(legacyTask!.due_at).toBe("2025-06-01")
      expect(legacyTask!.priority).toBeUndefined()

      // New key:: value format — priority:: is stripped and extracted
      const newTask = parseMarkdownToNodes(`- [ ] Task C due:: 2025-09-01 priority:: P3`, "test.md").find(
        (n) => n.type === "p" && n.item != null && n.item?.task?.marker,
      )
      expect(newTask!.content).toBe("Task C")
      expect(newTask!.due_at).toBe("2025-09-01")
      expect(newTask!.priority).toBe("P3")
    })

    test("should not strip metadata from non-task list items", () => {
      const md = `- Regular item due:: 2025-03-15`
      const nodes = parseMarkdownToNodes(md, "test.md")
      const item = nodes.find((n) => n.type === "p" && n.item != null && !n.item?.task?.marker)

      expect(item).toBeDefined()
      // Non-task items keep metadata in content (no stripping)
      expect(item!.content).toContain("due:: 2025-03-15")
    })

    test("should handle nested structure", () => {
      const md = `# Top Level

## Section A

Content A

## Section B

Content B

### Subsection B1

More content
`
      const nodes = parseMarkdownToNodes(md, "nested.md")
      const sections = nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
      // H1 is merged into file, so we have 3 sections: A, B, B1
      expect(sections.length).toBeGreaterThanOrEqual(3)

      // File node should have H1 title
      const fileNode = nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
      expect(fileNode?.title).toBe("Top Level")
    })

    test("should parse code blocks with language", () => {
      const md = "```typescript\nconst x: number = 1;\n```"
      const nodes = parseMarkdownToNodes(md, "code.md")
      const code = nodes.find((n) => n.type === "code")

      expect(code).toBeDefined()
      // Implementation stores language in data.lang, not data.language
      expect(code!.data.lang).toBe("typescript")
    })

    test("should parse standard task marks", () => {
      // Note: GFM only recognizes [ ] and [x]/[X] as tasks.
      // Custom marks like [/], [-], [?] are parsed as regular list items
      // because the mdast parser sets `checked` to undefined for those.
      const md = `
- [ ] Open task
- [x] Completed task
- [X] Also completed
`
      const nodes = parseMarkdownToNodes(md, "tasks.md")
      const tasks = nodes.filter((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

      expect(tasks.length).toBe(3)

      const statuses = tasks.map((t) => t.item?.task?.status)
      expect(statuses).toContain("todo")
      expect(statuses).toContain("done")
    })

    test("should handle custom task marks", () => {
      // km extends GFM with custom task marks: [/], [-], [!]
      // These are recognized as tasks with appropriate statuses
      const md = `
- [/] In progress
- [-] Cancelled
- [!] Blocked
- [?] Unknown mark (not supported)
`
      const nodes = parseMarkdownToNodes(md, "tasks.md")
      const tasks = nodes.filter((n) => n.type === "p" && n.item != null && n.item?.task?.marker)
      const listItems = nodes.filter((n) => n.type === "p" && n.item != null && !n.item?.task?.marker)

      // Custom marks [/], [-], [!] are recognized as tasks
      expect(tasks.length).toBe(3)
      // [?] is not a supported mark, so it's a regular list item
      expect(listItems.length).toBe(1)

      // Check statuses
      const statuses = tasks.map((t) => t.item?.task?.status)
      expect(statuses).toContain("wip") // [/]
      expect(statuses).toContain("dropped") // [-]
      expect(statuses).toContain("blocked") // [!]
    })

    test("should not include nested list content in parent task content (km-4u2w)", () => {
      // Bug fix: nested list items were being concatenated into parent content
      const md = `- [ ] Parent task with description
  - Subtask 1A
  - Subtask 1B
`
      const nodes = parseMarkdownToNodes(md, "nested.md")
      const tasks = nodes.filter((n) => n.type === "p" && n.item != null && n.item?.task?.marker)
      const listItems = nodes.filter((n) => n.type === "p" && n.item != null && !n.item?.task?.marker)

      // Parent is a task, children are list items
      expect(tasks.length).toBe(1)
      expect(listItems.length).toBe(2)

      // Critical: parent content should NOT include child content
      const parentTask = tasks[0]
      expect(parentTask!.content).toBe("Parent task with description")
      expect(parentTask!.content).not.toContain("Subtask")

      // Children have their own content
      expect(listItems[0]!.content).toBe("Subtask 1A")
      expect(listItems[1]!.content).toBe("Subtask 1B")
    })
  })

  describe("buildNodeTree", () => {
    test("should build hierarchical tree from flat nodes", () => {
      const md = `# Project

## Phase 1

- [ ] Task 1.1
- [ ] Task 1.2

## Phase 2

- [ ] Task 2.1
`
      const flatNodes = parseMarkdownToNodes(md, "project.md")
      const tree = buildNodeTree(flatNodes)

      // buildNodeTree returns a Map<string, Node[]>
      expect(tree instanceof Map).toBe(true)
      expect(tree.size).toBeGreaterThan(0)
    })
  })
})

describe("Nodes to Markdown", () => {
  describe("nodesToMarkdown", () => {
    test("should serialize paragraph node", () => {
      expect(nodesToMarkdown([makeParagraph("Hello world!")])).toContain("Hello world!")
    })

    test("should serialize task node", () => {
      const md = nodesToMarkdown([makeTask("Test task")])
      expect(md).toContain("- [ ]")
      expect(md).toContain("Test task")
    })

    test("should serialize completed task", () => {
      expect(nodesToMarkdown([makeTask("Done task", { status: "done", marker: "[x]" })])).toContain("- [x]")
    })

    test("should serialize task with metadata using key:: value format", () => {
      const md = nodesToMarkdown([makeTask("Important task", { dueAt: "2025-03-15", priority: "P1" })])
      expect(md).toContain("due:: 2025-03-15")
      expect(md).toContain("priority:: P1")
    })

    test("should serialize section node as heading", () => {
      expect(nodesToMarkdown([makeSection("My Section", 2)])).toContain("## My Section")
    })

    test("should serialize code block", () => {
      const md = nodesToMarkdown([makeCode('console.log("hello");', "javascript")])
      expect(md).toContain("```javascript")
      expect(md).toContain('console.log("hello");')
      expect(md).toContain("```")
    })

    test("should serialize quote block", () => {
      expect(nodesToMarkdown([makeQuote("Famous quote here")])).toContain("> Famous quote here")
    })

    test("should serialize horizontal rule", () => {
      expect(nodesToMarkdown([makeHr()])).toContain("---")
    })

    test("should serialize task with due_at including time", () => {
      const node = makeTestNode({
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "Meeting prep",
        due_at: "2025-03-15T14:30",
      })
      const md = nodesToMarkdown([node])
      expect(md).toContain("due:: 2025-03-15T14:30")
    })

    test("should serialize task with start_at including time", () => {
      const node = makeTestNode({
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "Start project",
        start_at: "2025-03-10T09:00",
      })
      const md = nodesToMarkdown([node])
      expect(md).toContain("start:: 2025-03-10T09:00")
    })

    test("should serialize recurrence from top-level field", () => {
      const node = makeTestNode({
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "Daily standup",
        rrule: "every day",
      })
      const md = nodesToMarkdown([node])
      expect(md).toContain('recur:: "every day"')
    })

    test("should serialize recurrence from data.rrule", () => {
      const node = makeTestNode({
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "Weekly review",
        data: { rrule: "every week" },
      })
      const md = nodesToMarkdown([node])
      expect(md).toContain('recur:: "every week"')
    })

    test("should not duplicate recurrence if already in content", () => {
      const node = makeTestNode({
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "Weekly review 🔁 every week",
        rrule: "every week",
      })
      const md = nodesToMarkdown([node])
      // Should appear exactly once
      const matches = md.match(/🔁/g)
      expect(matches).toHaveLength(1)
    })
  })
})

// NOTE: Round-trip and fixture file tests are in roundtrip.test.ts to avoid duplication

describe("H1 Heading Validation", () => {
  test("should warn when file has no H1 heading", () => {
    const md = `## Section Two

Some content without a top-level heading.

## Another Section

More content.`

    const result = parseMarkdownWithLinks(md, "no-h1.md")
    expect(result.warnings).toHaveLength(1)
    const warning = result.warnings[0]!
    expect(warning.type).toBe("missing_h1")
    expect(warning.message).toContain("Missing H1 heading")
  })

  test("multiple H1 headings are clamped — no warning (depth clamping prevents escape)", () => {
    const md = `# First Title

Some content.

# Second Title

More content.

# Third Title

Even more content.`

    const result = parseMarkdownWithLinks(md, "multiple-h1.md")
    // With heading depth clamping, subsequent H1s become H2 (clamped to root+1)
    // so they're no longer detected as multiple H1s
    expect(result.warnings).toHaveLength(0)
    // First H1 is merged into file, others become H2 children
    expect(result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")?.title).toBe(
      "First Title",
    )
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
    expect(sections).toHaveLength(2) // "Second Title" and "Third Title" as H2s
  })

  test("should not warn when file has exactly one H1 heading", () => {
    const md = `# Document Title

## Section One

Content.

## Section Two

More content.`

    const result = parseMarkdownWithLinks(md, "valid.md")
    expect(result.warnings).toHaveLength(0)
  })

  test("should not warn for empty file", () => {
    // Empty file has no H1, but we might want to be lenient here
    // Current behavior: warns about missing H1
    const result = parseMarkdownWithLinks("", "empty.md")
    expect(result.warnings).toHaveLength(1)
    const warning = result.warnings[0]!
    expect(warning.type).toBe("missing_h1")
  })
})

describe("parseHeadingRules", () => {
  test.each([
    // Single rules with various formats
    {
      heading: "Today km.add:: due:past status:open",
      title: "Today",
      rules: { add: "due:past status:open" },
    },
    {
      heading: "Blocked km.sync:: status:blocked",
      title: "Blocked",
      rules: { sync: "status:blocked" },
    },
    {
      heading: "Done km.collapse:: true",
      title: "Done",
      rules: { collapse: true },
    },
    {
      heading: "In Progress km.limit:: 5",
      title: "In Progress",
      rules: { limit: 5 },
    },
    {
      heading: "Inbox km.default:: true",
      title: "Inbox",
      rules: { default: true },
    },
    // Color rules
    {
      heading: "Next Actions km.color:: cyan",
      title: "Next Actions",
      rules: { color: "cyan" },
    },
    {
      heading: "Waiting For km.color:: yellow",
      title: "Waiting For",
      rules: { color: "yellow" },
    },
    {
      heading: "My Board km.color:: magenta",
      title: "My Board",
      rules: { color: "magenta" },
    },
    // Edge cases
    { heading: "Simple Heading", title: "Simple Heading", rules: {} },
    {
      heading: "2025 Taxes - Q1 km.add:: project:taxes",
      title: "2025 Taxes - Q1",
      rules: { add: "project:taxes" },
    },
  ])("should parse '$heading'", ({ heading, title, rules }) => {
    const result = parseHeadingRules(heading)
    expect(result.title).toBe(title)
    for (const [key, value] of Object.entries(rules)) {
      expect(result.rules[key as keyof typeof result.rules]).toBe(value)
    }
    if (Object.keys(rules).length === 0) {
      expect(result.rules).toEqual({})
    }
  })

  test("should extract multiple rules", () => {
    const result = parseHeadingRules("Today km.add:: due:past km.sync:: status:open km.limit:: 10 km.collapse:: true")
    expect(result.title).toBe("Today")
    expect(result.rules.add).toBe("due:past")
    expect(result.rules.sync).toBe("status:open")
    expect(result.rules.limit).toBe(10)
    expect(result.rules.collapse).toBe(true)
  })

  test("should accumulate multiple km.add:: into array", () => {
    const result = parseHeadingRules("Inbox km.add:: ./inbox/** km.add:: /some/external/path/** km.default:: true")
    expect(result.title).toBe("Inbox")
    expect(result.rules.add).toEqual(["./inbox/**", "/some/external/path/**"])
    expect(result.rules.default).toBe(true)
  })

  test("single km.add:: stays string (backward compat)", () => {
    const result = parseHeadingRules("Ready km.add:: status:todo")
    expect(result.title).toBe("Ready")
    expect(result.rules.add).toBe("status:todo")
    expect(typeof result.rules.add).toBe("string")
  })

  test("should warn on duplicate singleton keys", () => {
    const result = parseHeadingRules("Title km.color:: cyan km.color:: magenta")
    expect(result.title).toBe("Title")
    expect(result.rules.color).toBe("magenta") // last value wins
    expect(result.warnings).toEqual(['duplicate key "color" — last value wins'])
  })

  test("should handle unknown km.key:: value (stripped from title)", () => {
    const result = parseHeadingRules("Title km.custom:: hello km.color:: cyan")
    expect(result.title).toBe("Title")
    expect(result.rules.color).toBe("cyan")
    // unknown key "custom" is stripped from title but otherwise ignored
  })
})

describe("Section title and rules parsing", () => {
  test("should populate title and rules on section nodes", () => {
    const md = `# Document Title

## Today km.add:: due:past status:open

- [ ] Task 1

## Done km.sync:: status:done km.collapse:: true

- [x] Completed task
`
    const result = parseMarkdownWithLinks(md, "board.md")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    // H1 is merged into file node, so no H1 sections should remain
    // (sections only contains H2+ headings)
    expect(sections.length).toBe(2)

    // Today column
    const today = sections.find((s) => s.title === "Today")
    expect(today).toBeDefined()
    expect(today?.rules?.add).toBe("due:past status:open")
    expect(today?.content).toBe("Today") // Clean content (props stripped by kmast transforms)

    // Done column
    const done = sections.find((s) => s.title === "Done")
    expect(done).toBeDefined()
    expect(done?.rules?.sync).toBe("status:done")
    expect(done?.rules?.collapse).toBe(true)
  })
})

describe("H1 merge into file node", () => {
  test("should merge H1 properties into file node", () => {
    const md = `# Board Title

## Column One

- [ ] Task 1

## Column Two

- [ ] Task 2
`
    const result = parseMarkdownWithLinks(md, "board.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    // File node should have H1's title
    expect(fileNode?.title).toBe("Board Title")
    expect(fileNode?.content).toBe("Board Title")

    // No H1 sections (H1 was merged into file node)
    // All remaining sections should be direct children of file
    expect(sections.length).toBe(2)
    expect(fileNode).toBeDefined()
    for (const s of sections) {
      expect(s.parent_id).toBe(fileNode!.id)
    }
  })

  test("should re-parent H1 children to file node", () => {
    const md = `# Main Title

## Section A

Content A

## Section B

Content B
`
    const result = parseMarkdownWithLinks(md, "test.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    // All sections should be children of the file node
    expect(fileNode).toBeDefined()
    for (const section of sections) {
      expect(section.parent_id).toBe(fileNode!.id)
    }
  })

  test("should preserve H1 rules when merging into file node", () => {
    const md = `# Board km.default:: true km.collapse:: true

## Column One

- [ ] Task
`
    const result = parseMarkdownWithLinks(md, "board.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")

    expect(fileNode?.title).toBe("Board")
    expect(fileNode?.rules?.default).toBe(true)
    expect(fileNode?.rules?.collapse).toBe(true)
  })

  test("should handle file without H1 (no merge needed)", () => {
    const md = `## Just H2

- [ ] Task
`
    const result = parseMarkdownWithLinks(md, "no-h1.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    // File node has no title (no H1 to merge)
    expect(fileNode?.title).toBeUndefined()

    // H2 section exists as child of file
    expect(sections.length).toBe(1)
    expect(sections[0]?.parent_id).toBe(fileNode?.id)
  })

  test("should merge frontmatter data with H1 data", () => {
    const md = `---
author: test
---

# Document Title

## Section
`
    const result = parseMarkdownWithLinks(md, "with-frontmatter.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")

    // Both frontmatter and H1 data should be present
    expect(fileNode?.data?.author).toBe("test")
    expect(fileNode?.title).toBe("Document Title")
  })

  test("multiple H1s: first is merged, subsequent are clamped to H2", () => {
    const md = `# First Title

## Section

# Second Title

More content
`
    const result = parseMarkdownWithLinks(md, "multi-h1.md")
    const fileNode = result.nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")

    // First H1 merged into file
    expect(fileNode?.title).toBe("First Title")

    // No multiple_h1 warning — depth clamping converts subsequent H1s to H2
    expect(result.warnings).toHaveLength(0)

    // "Second Title" becomes an H2 sibling of "Section"
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
    expect(sections).toHaveLength(2)
    expect(sections.map((s) => s.content)).toContain("Second Title")
  })
})

// =============================================================================
// nodeToText — image node handling (km-tui.import-mangled)
// =============================================================================

describe("nodeToText handles image nodes", () => {
  // Import nodeToText from the parser
  const { nodeToText } = require("../src/parser.ts") as typeof import("../src/parser.ts")

  test("returns alt text for image node", () => {
    const imageNode = {
      type: "image" as const,
      url: "https://example.com/photo.png",
      alt: "A photo",
    }
    expect(nodeToText(imageNode)).toBe("A photo")
  })

  test("returns empty string for image node without alt text", () => {
    const imageNode = { type: "image" as const, url: "https://example.com/photo.png", alt: "" }
    expect(nodeToText(imageNode)).toBe("")
  })

  test("returns empty string for image node with empty alt text", () => {
    const imageNode = {
      type: "image" as const,
      url: "https://example.com/photo.png",
      alt: "",
    }
    expect(nodeToText(imageNode)).toBe("")
  })

  test("extracts image alt text within paragraph children", () => {
    // Simulates a paragraph containing text + image: "See ![diagram](url) for details"
    const paragraphNode = {
      type: "paragraph" as const,
      children: [
        { type: "text" as const, value: "See " },
        {
          type: "image" as const,
          url: "https://example.com/diagram.png",
          alt: "diagram",
        },
        { type: "text" as const, value: " for details" },
      ],
    }
    expect(nodeToText(paragraphNode)).toBe("See diagram for details")
  })
})
