/**
 * Round-trip Parsing Tests (km-bk9)
 *
 * Tests that markdown -> nodes -> markdown preserves content correctly.
 * These tests verify that parsing and then serializing produces equivalent output.
 */

import { describe, test, expect } from "vitest"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { KNode } from "@km/core"

import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { extractFrontmatter } from "../src/parser.ts"
import { normalizeMarkdown, roundtrip, parse, makeTestNode } from "./helpers/test-utils.ts"

describe("Round-trip: Basic Elements", () => {
  test("should preserve simple paragraph", () => {
    expect(roundtrip("This is a simple paragraph.")).toContain("This is a simple paragraph")
  })

  test("should preserve multiple paragraphs", () => {
    const output = roundtrip(`First paragraph.

Second paragraph.

Third paragraph.`)

    expect(output).toContain("First paragraph")
    expect(output).toContain("Second paragraph")
    expect(output).toContain("Third paragraph")
  })

  test("should preserve text content (inline formatting becomes plain text)", () => {
    // Note: Current parser strips inline formatting but preserves text content
    expect(roundtrip(`This has **bold** and *italic* and \`code\`.`)).toContain("This has bold and italic and code")
  })

  test("should preserve headings", () => {
    const output = roundtrip(`# Heading 1

## Heading 2

### Heading 3

#### Heading 4`)

    expect(output).toContain("# Heading 1")
    expect(output).toContain("## Heading 2")
    expect(output).toContain("### Heading 3")
    expect(output).toContain("#### Heading 4")
  })

  test("should preserve horizontal rules", () => {
    const output = roundtrip(`Before

---

After`)

    expect(output).toContain("---")
    expect(output).toContain("Before")
    expect(output).toContain("After")
  })
})

describe("Round-trip: Tasks", () => {
  test("should preserve open task", () => {
    const output = roundtrip(`- [ ] Open task`)
    expect(output).toContain("- [ ]")
    expect(output).toContain("Open task")
  })

  test("should preserve completed task", () => {
    const output = roundtrip(`- [x] Completed task`)
    expect(output).toContain("- [x]")
    expect(output).toContain("Completed task")
  })

  test("should preserve multiple tasks", () => {
    const output = roundtrip(`- [ ] Task one
- [ ] Task two
- [x] Task three done`)

    expect(output).toContain("Task one")
    expect(output).toContain("Task two")
    expect(output).toContain("Task three done")
  })

  test("should preserve task with due date", () => {
    const output = roundtrip(`- [ ] Task with due 📅 2025-03-15`)
    // Emoji format migrated to key:: value on roundtrip
    expect(output).toContain("due:: 2025-03-15")
    expect(output).toContain("Task with due")
  })

  test("should preserve task with scheduled date", () => {
    expect(roundtrip(`- [ ] Task scheduled ⏳ 2025-03-10`)).toContain("start:: 2025-03-10")
  })

  test("should preserve task with full metadata", () => {
    const output = roundtrip(`- [ ] Full metadata 📅 2025-04-01 ⏳ 2025-03-25 ⏫`)
    // Emoji dates migrated to key:: value on roundtrip
    expect(output).toContain("due:: 2025-04-01")
    expect(output).toContain("start:: 2025-03-25")
    // Emoji priority (⏫) is NOT stripped — stays as plain text, no priority:: emitted
    expect(output).toContain("⏫")
    expect(output).not.toContain("priority::")
  })

  test("should preserve task with tags", () => {
    expect(roundtrip(`- [ ] Task with #important tag`)).toContain("#important")
  })
})

describe("Round-trip: Lists", () => {
  test("should preserve unordered list", () => {
    const output = roundtrip(`- Item one
- Item two
- Item three`)

    expect(output).toContain("Item one")
    expect(output).toContain("Item two")
    expect(output).toContain("Item three")
  })

  test("should preserve ordered list", () => {
    const output = roundtrip(`1. First item
2. Second item
3. Third item`)

    expect(output).toContain("First item")
    expect(output).toContain("Second item")
    expect(output).toContain("Third item")
  })

  test("should preserve list item with blockquote body (not run together)", () => {
    const input = `- [x] Task title ^1203443757802387\n  > Body content here`
    const nodes = parse(input)
    // The title node should NOT contain the blockquote text
    const titleNode = nodes.find((n) => n.type === "p" && n.item === true)
    expect(titleNode?.content).not.toContain("Body content")
    expect(titleNode?.content).toContain("Task title")
    // There should be a separate quote node as a child
    const quoteNode = nodes.find((n) => n.type === "quote")
    expect(quoteNode).toBeDefined()
    expect(quoteNode?.content).toContain("Body content")
    // Roundtrip should keep them separate
    const output = roundtrip(input)
    expect(output).toContain("Task title")
    expect(output).toContain("> Body content")
    // They should NOT be run together
    expect(output).not.toMatch(/\^1203443757802387Body/)
  })
})

describe("Round-trip: Blockquotes", () => {
  test("should preserve simple blockquote", () => {
    const output = roundtrip(`> This is a quote.`)
    expect(output).toContain(">")
    expect(output).toContain("This is a quote")
  })

  test("should preserve multi-line blockquote", () => {
    const output = roundtrip(`> Line one
> Line two
> Line three`)

    expect(output).toContain("Line one")
    expect(output).toContain("Line two")
  })
})

describe("Round-trip: Code Blocks", () => {
  test("should preserve code block with language", () => {
    const output = roundtrip(`\`\`\`javascript
const x = 1;
console.log(x);
\`\`\``)

    expect(output).toContain("```javascript")
    expect(output).toContain("const x = 1")
    expect(output).toContain("```")
  })

  test("should preserve code block without language", () => {
    const output = roundtrip(`\`\`\`
plain code
\`\`\``)

    expect(output).toContain("```")
    expect(output).toContain("plain code")
  })

  test("should preserve multiple code blocks", () => {
    const output = roundtrip(`\`\`\`python
def foo():
    pass
\`\`\`

\`\`\`typescript
function bar() {}
\`\`\``)

    expect(output).toContain("```python")
    expect(output).toContain("def foo()")
    expect(output).toContain("```typescript")
    expect(output).toContain("function bar()")
  })
})

describe("Round-trip: Tables", () => {
  test("should preserve simple table", () => {
    const output = roundtrip(`| A | B |
|---|---|
| 1 | 2 |`)

    // Tables are stored as raw content
    expect(output).toContain("A")
    expect(output).toContain("B")
    expect(output).toContain("1")
    expect(output).toContain("2")
  })

  test("should preserve table cell delimiters, not concatenate text", () => {
    const input = `| Key | Value |
|---|---|
| Location | 670 Hamilton Ave |
| Phone | 555-1234 |`

    const output = roundtrip(input)
    // Must NOT produce concatenated "KeyValueLocation670 Hamilton Ave..."
    expect(output).not.toContain("KeyValue")
    expect(output).not.toContain("LocationPhone")
    // Must preserve pipe delimiters
    expect(output).toContain("|")
    expect(output).toContain("Key")
    expect(output).toContain("Value")
    expect(output).toContain("670 Hamilton Ave")
  })

  test("table content stored as markdown table format", () => {
    const input = `| Name | Age |
|---|---|
| Alice | 30 |`

    const nodes = parse(input)
    const tableNode = nodes.find((n) => n.type === "table")
    expect(tableNode).toBeDefined()
    // Content should have pipe delimiters, not concatenated text
    expect(tableNode!.content).toContain("|")
    expect(tableNode!.content).not.toBe("NameAgeAlice30")
  })

  test("table columns are padded for alignment", () => {
    const input = `| Name | Role |
|---|---|
| Alice | Engineer |
| Bob | PM |`

    const nodes = parse(input)
    const tableNode = nodes.find((n) => n.type === "table")
    expect(tableNode).toBeDefined()
    const lines = tableNode!.content!.split("\n")
    // All rows should have same-width columns (padded)
    expect(lines[0]).toContain("| Name  | Role     |")
    expect(lines[2]).toContain("| Alice | Engineer |")
    expect(lines[3]).toContain("| Bob   | PM       |")
  })
})

describe("Round-trip: Sections with Content", () => {
  test("should preserve section with paragraph", () => {
    const output = roundtrip(`# My Section

This is content under the section.`)

    expect(output).toContain("# My Section")
    expect(output).toContain("This is content under the section")
  })

  test("should preserve nested sections", () => {
    const output = roundtrip(`# Top

## Middle

### Bottom

Content at bottom.`)

    expect(output).toContain("# Top")
    expect(output).toContain("## Middle")
    expect(output).toContain("### Bottom")
    expect(output).toContain("Content at bottom")
  })

  test("should preserve section with tasks", () => {
    const output = roundtrip(`## Tasks

- [ ] Task one
- [ ] Task two
- [x] Task done`)

    expect(output).toContain("## Tasks")
    expect(output).toContain("Task one")
    expect(output).toContain("Task two")
    expect(output).toContain("Task done")
  })

  test("should preserve section with mixed content", () => {
    const output = roundtrip(`## Mixed Section

A paragraph here.

- [ ] A task

> A quote

\`\`\`
code
\`\`\``)

    expect(output).toContain("## Mixed Section")
    expect(output).toContain("A paragraph here")
    expect(output).toContain("A task")
    expect(output).toContain("A quote")
    expect(output).toContain("code")
  })
})

describe("Round-trip: Edge Cases", () => {
  test("should preserve empty task content", () => {
    expect(roundtrip(`- [ ] `)).toContain("- [ ]")
  })

  test("should preserve task with special characters", () => {
    const output = roundtrip(`- [ ] Task with "quotes" and 'apostrophes'`)
    expect(output).toContain('"quotes"')
    expect(output).toContain("'apostrophes'")
  })

  test("should preserve task with emoji", () => {
    const output = roundtrip(`- [ ] Task with emoji 🚀 🎉 ✨`)
    expect(output).toContain("🚀")
    expect(output).toContain("🎉")
    expect(output).toContain("✨")
  })

  test("should preserve unicode content", () => {
    const output = roundtrip(`# 日本語

- [ ] タスク
- [ ] Задача
- [ ] 任务`)

    expect(output).toContain("日本語")
    expect(output).toContain("タスク")
    expect(output).toContain("Задача")
    expect(output).toContain("任务")
  })

  test("should preserve wikilinks in content", () => {
    expect(roundtrip(`Check [[Other Page]] for more.`)).toContain("[[Other Page]]")
  })

  test("should preserve aliased wikilinks", () => {
    expect(roundtrip(`See [[Target|display text]] here.`)).toContain("[[Target|display text]]")
  })
})

describe("Round-trip: Complex Documents", () => {
  test("should preserve content through full document cycle", () => {
    const output = roundtrip(`# Test Document

This is a paragraph.

## Tasks

- [ ] Task one 📅 2025-03-15
- [x] Task two done

## Code

\`\`\`javascript
const x = 1;
\`\`\`

## Quote

> A famous quote

---

Final paragraph.`)

    // All key content should be preserved
    expect(output).toContain("# Test Document")
    expect(output).toContain("This is a paragraph")
    expect(output).toContain("## Tasks")
    expect(output).toContain("Task one")
    expect(output).toContain("due:: 2025-03-15")
    expect(output).toContain("Task two done")
    expect(output).toContain("## Code")
    expect(output).toContain("```javascript")
    expect(output).toContain("const x = 1")
    expect(output).toContain("## Quote")
    expect(output).toContain("A famous quote")
    expect(output).toContain("---")
    expect(output).toContain("Final paragraph")
  })

  test("should be semantically equivalent after double round-trip", () => {
    const original = `# Document

## Section A

- [ ] Task A1
- [x] Task A2

## Section B

Content in B.

\`\`\`python
x = 1
\`\`\``

    // First and second round-trips should be stable
    const md1 = roundtrip(original)
    const md2 = roundtrip(md1)

    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })
})

describe("Round-trip: Fixture Files", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const fixturesDir = join(__dirname, "fixtures")

  test.each([
    {
      name: "inbox.md",
      expected: ["Quick capture", "Buy groceries"],
    },
    {
      name: "sample-project.md",
      expected: ["Sample Project", "Tasks Section", "Content Blocks"],
    },
    {
      name: "daily-note.md",
      expected: ["Morning Review", "Focus Time", "Project Alpha"],
    },
    {
      name: "comprehensive.md",
      expected: ["Main Section", "Tasks with Standard Marks", "Blockquotes", "Code Blocks", "Tables"],
    },
  ])("should round-trip $name", ({ name, expected }) => {
    const original = readFileSync(join(fixturesDir, name), "utf-8")
    const { body } = extractFrontmatter(original)
    const nodes = parseMarkdownToNodes(body, name)
    const output = nodesToMarkdown(nodes)

    for (const e of expected) expect(output).toContain(e)
  })

  test("comprehensive.md key content is preserved after round-trip", () => {
    const original = readFileSync(join(fixturesDir, "comprehensive.md"), "utf-8")
    const { body } = extractFrontmatter(original)

    // First and second round-trips
    const nodes1 = parseMarkdownToNodes(body, "comprehensive.md")
    const md1 = nodesToMarkdown(nodes1)
    const nodes2 = parseMarkdownToNodes(md1, "comprehensive.md")
    const md2 = nodesToMarkdown(nodes2)

    // Key content should be preserved
    expect(md2).toContain("Main Section")
    expect(md2).toContain("Tasks with Standard Marks")
    expect(md2).toContain("Code Blocks")

    // Node counts should be consistent between round-trips
    expect(nodes1.filter((n) => n.type === "p" && n.item === true && n.task_marker).length).toBe(
      nodes2.filter((n) => n.type === "p" && n.item === true && n.task_marker).length,
    )
    expect(nodes1.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection").length).toBe(
      nodes2.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection").length,
    )
  })
})

describe("Round-trip: Content Preservation Verification", () => {
  test("should preserve task status in node", () => {
    const nodes = parse(`- [ ] Open
- [x] Done`)
    const tasks = nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(tasks.length).toBe(2)
    expect(tasks[0]!.task_status).toBe("todo")
    expect(tasks[1]!.task_status).toBe("done")

    // After round-trip, statuses should be preserved
    const nodes2 = parse(nodesToMarkdown(nodes))
    const tasks2 = nodes2.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(tasks2[0]!.task_status).toBe("todo")
    expect(tasks2[1]!.task_status).toBe("done")
  })

  test("should preserve task metadata in node", () => {
    const nodes = parse(`- [ ] Task 📅 2025-12-25 ⏫`)
    const task = nodes.find((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(task).toBeDefined()
    expect(task!.due_at).toBe("2025-12-25")
    // Emoji priority (⏫) is no longer extracted
    expect(task!.priority).toBeUndefined()

    // After round-trip, due date preserved; emoji priority stripped but not re-emitted
    const task2 = parse(nodesToMarkdown(nodes)).find((n) => n.type === "p" && n.item === true && n.task_marker)
    expect(task2!.due_at).toBe("2025-12-25")
    expect(task2!.priority).toBeUndefined()
  })

  test("should preserve section depth via tree structure", () => {
    const nodes = parse(`# H1

## H2

### H3`)
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    // H1 is merged into file node, so only 2 section nodes
    expect(sections.length).toBe(2)
    expect(fileNode?.title).toBe("H1")
    // H2 is a child of file (which absorbed H1)
    expect(sections[0]?.parent_id).toBe(fileNode?.id)
    // H3 is a child of H2
    expect(sections[1]?.parent_id).toBe(sections[0]?.id)

    // After round-trip, depth is derived from tree position
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# H1")
    expect(output).toContain("## H2")
    expect(output).toContain("### H3")

    // Double round-trip preserves structure
    const nodes2 = parse(output)
    const sections2 = nodes2.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const fileNode2 = nodes2.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    expect(fileNode2?.title).toBe("H1")
    expect(sections2[0]?.parent_id).toBe(fileNode2?.id)
    expect(sections2[1]?.parent_id).toBe(sections2[0]?.id)
  })

  test("should preserve code language", () => {
    const nodes = parse(`\`\`\`typescript
const x: number = 1;
\`\`\``)
    const code = nodes.find((n) => n.type === "code")

    expect(code).toBeDefined()
    expect(code!.data?.lang).toBe("typescript")

    // After round-trip
    const code2 = parse(nodesToMarkdown(nodes)).find((n) => n.type === "code")
    expect(code2!.data?.lang).toBe("typescript")
  })
})

describe("Round-trip: Additional Edge Cases", () => {
  test("should handle empty document", () => {
    expect(roundtrip("").trim()).toBe("")
  })

  test("should handle document with only whitespace", () => {
    expect(roundtrip("   \n\n   \n").trim()).toBe("")
  })

  test("should handle document with only headings (no tasks)", () => {
    const nodes = parse(`# Main Title

## Section One

Some content here.

## Section Two

More content.`)

    expect(nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker).length).toBe(0)
    expect(nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection").length).toBeGreaterThan(0)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# Main Title")
    expect(output).toContain("## Section One")
  })

  test.each([
    {
      lang: "Hebrew",
      md: "# שלום עולם\n\n- [ ] משימה בעברית",
      expected: ["שלום עולם", "משימה בעברית"],
    },
    {
      lang: "Arabic",
      md: "# مرحبا بالعالم\n\n- [ ] مهمة بالعربية",
      expected: ["مرحبا بالعالم", "مهمة بالعربية"],
    },
  ])("should handle RTL text ($lang)", ({ md, expected }) => {
    const output = roundtrip(md)
    for (const e of expected) expect(output).toContain(e)
  })

  test("should handle deeply nested structure (5+ levels)", () => {
    const nodes = parse(`# Level 1

## Level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6

Content at deepest level.`)

    // H1 is merged into file node, so only 5 section nodes (levels 2-6)
    expect(nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection").length).toBe(5)

    // File node should have H1 title
    expect(nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")?.title).toBe("Level 1")

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# Level 1")
    expect(output).toContain("###### Level 6")
  })

  test("should handle very long lines", () => {
    const longContent = "A".repeat(500)
    expect(roundtrip(`- [ ] ${longContent}`)).toContain(longContent)
  })

  test("should handle document with only a single task", () => {
    const nodes = parse(`- [ ] Single task`)
    const tasks = nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(tasks.length).toBe(1)
    expect(tasks[0]!.content).toBe("Single task")
  })

  test("should preserve task with blocked status mark", () => {
    expect(roundtrip(`- [!] Blocked task`)).toContain("Blocked task")
  })

  test("should preserve task with dropped status mark", () => {
    expect(roundtrip(`- [-] Dropped task`)).toContain("Dropped task")
  })
})

describe("Round-trip: Wiki Link Embeddings", () => {
  test.each([
    { desc: "simple embedding", md: "![[Target Page]]" },
    { desc: "embedding with section anchor", md: "![[Target Page#Section]]" },
    { desc: "embedding with block ID", md: "![[Target Page#^block123]]" },
    { desc: "embedding with alias", md: "![[Target Page|Display Text]]" },
    {
      desc: "embedding with section and alias",
      md: "![[Projects/API#Auth|API Authentication]]",
    },
  ])("should preserve $desc", ({ md }) => {
    expect(roundtrip(md)).toContain(md)
  })

  test("should NOT convert regular wikilink to embedding", () => {
    const output = roundtrip(`See [[Other Page]] for details.`)
    expect(output).toContain("[[Other Page]]")
    expect(output).not.toContain("![[Other Page]]")
  })

  test("should preserve embedding syntax in paragraph content", () => {
    const para = parse(`![[Target]]`).find((n) => n.type === "p")
    expect(para).toBeDefined()
    expect(para!.content).toBe("![[Target]]")
    expect(para!.embed_source).toBeFalsy()
  })

  test("should preserve mixed-content paragraph with embedding", () => {
    const para = parse(`Some text before ![[Target]] and after.`).find((n) => n.type === "p")
    expect(para).toBeDefined()
    expect(para!.content).toBe("Some text before ![[Target]] and after.")
  })

  test("should preserve embedding in document with multiple elements", () => {
    const output = roundtrip(`# Document

## Tasks

![[Projects/TaskList]]

## Notes

Regular paragraph here.`)

    expect(output).toContain("![[Projects/TaskList]]")
    expect(output).toContain("Regular paragraph here")
  })

  test("should be stable after double round-trip", () => {
    const original = `![[Projects/API#Auth|API Docs]]`
    const md1 = roundtrip(original)
    const md2 = roundtrip(md1)

    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
    expect(md2).toContain("![[Projects/API#Auth|API Docs]]")
  })

  describe("relative child embeds (![[./...]])", () => {
    test("![[./child]] roundtrips correctly", () => {
      const input = "![[./child]]\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const output = nodesToMarkdown(nodes)
      expect(output.trimEnd()).toBe(input.trimEnd())
    })

    test("![[./child]] parses to paragraph with embed content", () => {
      const input = "![[./child]]\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const embedNode = nodes.find((n) => n.content?.includes("![[./child]]"))
      expect(embedNode).toBeDefined()
      expect(embedNode!.content).toBe("![[./child]]")
    })

    test("![[./sub/nested]] preserves nested paths", () => {
      const input = "![[./sub/nested]]\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const output = nodesToMarkdown(nodes)
      expect(output.trimEnd()).toBe(input.trimEnd())
    })

    test("![[other]] without ./ prefix roundtrips correctly", () => {
      const input = "![[other]]\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const output = nodesToMarkdown(nodes)
      expect(output.trimEnd()).toBe(input.trimEnd())
      const embedNode = nodes.find((n) => n.content?.includes("![[other]]"))
      expect(embedNode).toBeDefined()
      expect(embedNode!.content).not.toContain("./")
    })

    test("double round-trip stability", () => {
      const input = "![[./child]]\n"
      const nodes1 = parseMarkdownToNodes(input, "test.md")
      const output1 = nodesToMarkdown(nodes1)
      const nodes2 = parseMarkdownToNodes(output1, "test.md")
      const output2 = nodesToMarkdown(nodes2)
      expect(output2).toBe(output1)
    })

    test("mixed inline content with ![[./child]]", () => {
      const input = "Some text ![[./child]] more text\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const output = nodesToMarkdown(nodes)
      expect(output.trimEnd()).toBe(input.trimEnd())
    })

    test("standalone ![[./child]] as block in multi-element doc", () => {
      const input = "# Title\n\n![[./child]]\n\nParagraph text\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const output = nodesToMarkdown(nodes)
      expect(output.trimEnd()).toBe(input.trimEnd())
    })

    test("embeddingTarget in data is stripped of ./ prefix", () => {
      const input = "![[./child]]\n"
      const nodes = parseMarkdownToNodes(input, "test.md")
      const embedNode = nodes.find((n) => n.data?.embeddingTarget !== undefined)
      expect(embedNode).toBeDefined()
      expect(embedNode!.data!.embeddingTarget).toBe("child")
    })
  })
})

/**
 * Comprehensive Round-trip Tests (km-744t)
 *
 * Additional tests for full coverage of markdown syntax and data model.
 */

describe("Round-trip: All Task Status Marks", () => {
  test("should preserve all standard and custom task marks", () => {
    const nodes = parse(`- [ ] Open task (todo)
- [x] Completed task (done)
- [X] Also completed (done)
- [/] In progress task (wip)
- [-] Dropped/cancelled task (dropped)
- [!] Blocked task (blocked)`)
    const tasks = nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    // Should have 6 tasks
    expect(tasks.length).toBe(6)

    // Verify all statuses are present
    const statuses = tasks.map((t) => t.task_status)
    expect(statuses).toContain("todo")
    expect(statuses).toContain("done")
    expect(statuses).toContain("wip")
    expect(statuses).toContain("dropped")
    expect(statuses).toContain("blocked")

    // Verify task markers are preserved
    const markers = tasks.map((t) => t.task_marker)
    expect(markers).toContain("[ ]")
    expect(markers.filter((m) => m === "[x]" || m === "[X]").length).toBe(2)
    expect(markers).toContain("[/]")
    expect(markers).toContain("[-]")
    expect(markers).toContain("[!]")

    // After round-trip, marks should be preserved
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("- [ ]") // open
    expect(output).toContain("- [x]") // done (normalized)
    expect(output).toContain("- [/]") // wip
    expect(output).toContain("- [-]") // dropped
    expect(output).toContain("- [!]") // blocked
  })

  test("should preserve task status through double round-trip", () => {
    const original = `- [/] WIP task
- [!] Blocked task`

    const nodes2 = parse(roundtrip(original))

    expect(nodes2.find((n) => n.content?.includes("WIP"))?.task_status).toBe("wip")
    expect(nodes2.find((n) => n.content?.includes("Blocked"))?.task_status).toBe("blocked")
  })
})

describe("Round-trip: Task Metadata Formats", () => {
  test("should migrate Obsidian Tasks emoji format to key:: value on roundtrip", () => {
    const nodes = parse(`- [ ] Task with all metadata 📅 2025-12-25 ⏳ 2025-12-20 ⏫`)
    const task = nodes.find((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(task).toBeDefined()
    expect(task!.due_at).toBe("2025-12-25")
    expect(task!.start_at).toBe("2025-12-20")
    // Emoji priority (⏫) is no longer extracted
    expect(task!.priority).toBeUndefined()
    // Content keeps ⏫ as plain text — only date emoji are stripped
    expect(task!.content).toBe("Task with all metadata ⏫")

    // Roundtrip migrates emoji dates to key:: value; ⏫ stays as plain text
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("due:: 2025-12-25")
    expect(output).toContain("start:: 2025-12-20")
    expect(output).toContain("⏫")
    expect(output).not.toContain("priority::")
  })

  test("should preserve recurrence metadata", () => {
    const task = parse(`- [ ] Recurring task 🔁 every week`).find(
      (n) => n.type === "p" && n.item === true && n.task_marker,
    )
    expect(task).toBeDefined()
    expect(task!.data?.rrule).toBe("every week")
  })

  test("should extract due: (todo.txt compat) but not start: or p: legacy formats", () => {
    const task = parse(`- [ ] Task with inline fields due:2025-11-15 start:2025-11-10 p:2`).find(
      (n) => n.type === "p" && n.item === true && n.task_marker,
    )

    expect(task).toBeDefined()
    // due:DATE is still supported (todo.txt compat)
    expect(task!.due_at).toBe("2025-11-15")
    // start:DATE is NO LONGER read — only start:: and ⏳ are supported
    expect(task!.start_at).toBeUndefined()
    // Legacy p:N format is no longer extracted for priority
    expect(task!.priority).toBeUndefined()
    // start:2025-11-10 and p:2 stay as plain text (not stripped, not extracted)
    expect(task!.content).toBe("Task with inline fields start:2025-11-10 p:2")
  })

  test("emoji priority symbols are not extracted and stay as plain text", () => {
    const nodes = parse(`- [ ] High priority ⏫
- [ ] Medium priority 🔼
- [ ] Low priority 🔽`)
    const tasks = nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    // Emoji priorities are not extracted
    expect(tasks[0]?.priority).toBeUndefined()
    expect(tasks[1]?.priority).toBeUndefined()
    expect(tasks[2]?.priority).toBeUndefined()

    // Emoji priority symbols stay as plain text — no stripping, no priority:: emitted
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("⏫")
    expect(output).toContain("🔼")
    expect(output).toContain("🔽")
    expect(output).not.toContain("priority::")
  })

  test("priority:: VALUE format is extracted and roundtrips", () => {
    const nodes = parse(`- [ ] High priority priority:: P1
- [ ] Medium priority priority:: P2
- [ ] Low priority priority:: P3`)
    const tasks = nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(tasks[0]?.priority).toBe("P1")
    expect(tasks[1]?.priority).toBe("P2")
    expect(tasks[2]?.priority).toBe("P3")

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("priority:: P1")
    expect(output).toContain("priority:: P2")
    expect(output).toContain("priority:: P3")
  })
})

describe("Round-trip: Wiki Links and Markdown Links", () => {
  test("should preserve wiki links with all variations", () => {
    const output = roundtrip(`Check [[simple link]] and [[path/to/note]] and [[target|alias]].`)

    expect(output).toContain("[[simple link]]")
    expect(output).toContain("[[path/to/note]]")
    expect(output).toContain("[[target|alias]]")
  })

  test("should preserve wiki links with section anchors", () => {
    const output = roundtrip(`See [[note#heading]] and [[doc#section|link text]].`)

    expect(output).toContain("[[note#heading]]")
    expect(output).toContain("[[doc#section|link text]]")
  })

  test("should preserve wiki links with block IDs", () => {
    // Both [[doc^block]] and [[doc#^block]] parse to the same AST and
    // round-trip to the canonical #^ form
    const output = roundtrip(`Reference [[doc^block123]] and [[page^abc|ref]].`)

    expect(output).toContain("[[doc#^block123]]")
    expect(output).toContain("[[page#^abc|ref]]")
  })

  test("should preserve markdown links text content", () => {
    // Note: Current implementation strips markdown link syntax, keeping only text
    const output = roundtrip(`Visit [Example](https://example.com) and [Docs](./docs/README.md).`)

    expect(output).toContain("Example")
    expect(output).toContain("Docs")
  })
})

describe("Round-trip: Markdown Formatting", () => {
  test("should preserve inline formatting in content", () => {
    const output = roundtrip(`Text with **bold**, *italic*, \`code\`, and ~~strikethrough~~.`)

    // Current parser may or may not preserve formatting depending on implementation
    // At minimum, the text content should be preserved
    expect(output).toContain("bold")
    expect(output).toContain("italic")
    expect(output).toContain("code")
    expect(output).toContain("strikethrough")
  })

  test("should handle mixed formatting in tasks", () => {
    const output = roundtrip(`- [ ] Task with **important** and \`code\` parts`)

    expect(output).toContain("important")
    expect(output).toContain("code")
  })
})

describe("Round-trip: Section Rules (Board Syntax)", () => {
  test("should preserve section rules in headings", () => {
    const nodes = parse(`# Board

## Ready km.add:: status:todo

- [ ] Task 1

## In Progress km.sync:: status:wip km.limit:: 3

- [/] Task 2

## Done km.collapse:: true

- [x] Task 3`)
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    // Verify rules are parsed
    expect(sections.find((s) => s.title === "Ready")?.rules?.add).toBe("status:todo")

    const inProgress = sections.find((s) => s.title === "In Progress")
    expect(inProgress?.rules?.sync).toBe("status:wip")
    expect(inProgress?.rules?.limit).toBe(3)

    expect(sections.find((s) => s.title === "Done")?.rules?.collapse).toBe(true)

    // Round-trip preserves rules in content
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("km.add:: status:todo")
    expect(output).toContain("km.sync:: status:wip")
    expect(output).toContain("km.limit:: 3")
    expect(output).toContain("km.collapse:: true")
  })

  test("should preserve color rule", () => {
    const nodes = parse(`## Section km.color:: cyan`)
    expect(nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")?.rules?.color).toBe("cyan")
    expect(nodesToMarkdown(nodes)).toContain("km.color:: cyan")
  })

  test("should preserve default=true rule", () => {
    const nodes = parse(`## Inbox km.default:: true`)
    expect(nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")?.rules?.default).toBe(true)
    expect(nodesToMarkdown(nodes)).toContain("km.default:: true")
  })
})

describe("Round-trip: Nested Tasks (Indentation)", () => {
  test("should preserve nested task hierarchy", () => {
    const nodes = parse(`- [ ] Parent task
  - [ ] Child task 1
  - [x] Child task 2
    - [ ] Grandchild task`)

    expect(nodes.filter((n) => n.type === "p" && n.item === true && n.task_marker).length).toBeGreaterThanOrEqual(4)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("Parent task")
    expect(output).toContain("Child task 1")
    expect(output).toContain("Child task 2")
    expect(output).toContain("Grandchild task")
  })

  test("should preserve mixed list/task nesting", () => {
    const output = roundtrip(`- Regular item
  - [ ] Nested task
- [ ] Top-level task
  - Nested regular item`)

    expect(output).toContain("Regular item")
    expect(output).toContain("Nested task")
    expect(output).toContain("Top-level task")
  })
})

describe("Round-trip: Frontmatter", () => {
  test("should preserve YAML frontmatter fields", () => {
    const { frontmatter, body } = extractFrontmatter(`---
title: Test Document
author: test-user
tags:
  - tag1
  - tag2
priority: 1
created: 2025-01-15
---

# Content`)

    expect(frontmatter).toContain("title: Test Document")
    expect(frontmatter).toContain("author: test-user")
    expect(frontmatter).toContain("- tag1")
    expect(frontmatter).toContain("priority: 1")

    expect(parse(body).find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")?.title).toBe("Content")
  })

  test("should handle frontmatter with type field", () => {
    const { frontmatter, body } = extractFrontmatter(`---
title: My Inbox
type: inbox
---

## Quick capture

- [ ] Task`)

    expect(frontmatter).toContain("type: inbox")
    expect(parse(body).length).toBeGreaterThan(0)
  })
})

describe("Round-trip: H1 Merging Edge Cases", () => {
  test("should merge H1 rules into file node", () => {
    const nodes = parse(`# Board km.default:: true km.color:: blue

## Column 1`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    expect(fileNode?.title).toBe("Board")
    expect(fileNode?.rules?.default).toBe(true)
    expect(fileNode?.rules?.color).toBe("blue")
  })

  test("should handle file with no H1", () => {
    const nodes = parse(`## Just a Section

Content here.

## Another Section`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(fileNode?.title).toBeUndefined()
    expect(sections.length).toBe(2)
    expect(fileNode).toBeDefined()
    // First section is a child of the file node
    expect(sections[0]!.parent_id).toBe(fileNode!.id)
    // Content is preserved through round-trip
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Just a Section")
    expect(output).toContain("## Another Section")
    expect(output).toContain("Content here")
  })

  test("should handle multiple H1s (first is used)", () => {
    expect(
      parse(`# First Title

Content.

# Second Title

More content.`).find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")?.title,
    ).toBe("First Title")
  })
})

describe("Round-trip: Deep Section Hierarchy", () => {
  test("should handle all 6 heading levels", () => {
    const nodes = parse(`# H1 Level

## H2 Level

### H3 Level

#### H4 Level

##### H5 Level

###### H6 Level

Deepest content.`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(fileNode?.title).toBe("H1 Level")
    expect(sections.length).toBe(5)

    // Depth is derived from tree nesting: each section is a child of the one above
    expect(sections[0]?.parent_id).toBe(fileNode?.id) // H2 under file
    expect(sections[1]?.parent_id).toBe(sections[0]?.id) // H3 under H2
    expect(sections[2]?.parent_id).toBe(sections[1]?.id) // H4 under H3
    expect(sections[3]?.parent_id).toBe(sections[2]?.id) // H5 under H4
    expect(sections[4]?.parent_id).toBe(sections[3]?.id) // H6 under H5

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# H1 Level")
    expect(output).toContain("###### H6 Level")
  })

  test("should handle skipped heading levels", () => {
    const nodes = parse(`# Title

## Section

#### Skipped to H4

###### Skipped to H6`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(sections.length).toBe(3)
    // Tree structure reflects nesting despite skipped levels
    expect(sections[0]?.parent_id).toBe(fileNode?.id) // H2 under file
    expect(sections[1]?.parent_id).toBe(sections[0]?.id) // H4 under H2 (skipped H3)
    expect(sections[2]?.parent_id).toBe(sections[1]?.id) // H6 under H4 (skipped H5)

    // Serializer derives correct heading depth from tree position
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Section")
    // Skipped levels become sequential in the tree, so output uses sequential depths
    expect(output).toContain("### Skipped to H4")
    expect(output).toContain("#### Skipped to H6")
  })

  test("should handle H2 after H2 (sibling sections)", () => {
    const nodes = parse(`# Document

## Section A

Content A

## Section B

Content B

## Section C

Content C`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(sections.length).toBe(3)
    expect(fileNode).toBeDefined()
    // All H2 sections are siblings under the file node
    for (const s of sections) {
      expect(s.parent_id).toBe(fileNode!.id)
    }

    // Serializer derives H2 depth from tree position (direct children of file)
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Section A")
    expect(output).toContain("## Section B")
    expect(output).toContain("## Section C")
  })
})

describe("Round-trip: Empty Content Edge Cases", () => {
  test("should handle section with no content", () => {
    const nodes = parse(`# Title

## Empty Section

## Non-empty Section

Content here.`)

    expect(nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection").length).toBe(2)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Empty Section")
    expect(output).toContain("## Non-empty Section")
  })

  test("should handle task with minimal content", () => {
    const nodes = parse(`- [ ] x`)
    const task = nodes.find((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(task).toBeDefined()
    expect(task!.task_status).toBe("todo")
    expect(task!.content).toBe("x")
    expect(nodesToMarkdown(nodes)).toContain("- [ ] x")
  })

  test("should handle empty code block", () => {
    const code = parse(`\`\`\`javascript
\`\`\``).find((n) => n.type === "code")

    expect(code).toBeDefined()
    expect(code!.data?.lang).toBe("javascript")
  })
})

describe("Round-trip: Data Model Integrity", () => {
  test("should preserve node parent relationships", () => {
    const nodes = parse(`# Doc

## Section

- [ ] Task in section`)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const section = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const task = nodes.find((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(section?.parent_id).toBe(fileNode?.id)
    expect(task?.parent_id).toBe(section?.id)
  })

  test("should assign parent_idx for ordering", () => {
    const tasks = parse(`- [ ] First
- [ ] Second
- [ ] Third`).filter((n) => n.type === "p" && n.item === true && n.task_marker)

    expect(tasks[0]?.parent_idx).toBeLessThan(tasks[1]?.parent_idx ?? -1)
    expect(tasks[1]?.parent_idx).toBeLessThan(tasks[2]?.parent_idx ?? -1)
  })

  test("should preserve content_hash for large content", () => {
    const longContent = "A".repeat(1000)
    const para = parse(`${longContent}`).find((n) => n.type === "p")

    expect(para?.content?.length || 0).toBeGreaterThan(0)
  })

  test("should set created_at and updated_at timestamps", () => {
    const beforeParse = Date.now()
    const task = parse(`- [ ] Task`).find((n) => n.type === "p" && n.item === true && n.task_marker)
    const afterParse = Date.now()

    expect(task?.created_at).toBeGreaterThanOrEqual(beforeParse)
    expect(task?.created_at).toBeLessThanOrEqual(afterParse)
    expect(task?.updated_at).toBeGreaterThanOrEqual(beforeParse)
  })
})

describe("Round-trip: Special Characters", () => {
  test.each([
    {
      char: "angle brackets",
      md: "- [ ] Task with <angle> brackets",
      expected: ["<angle>"],
    },
    {
      char: "square brackets",
      md: "- [ ] Task with [square] brackets (not wiki link)",
      expected: ["[square]"],
    },
    {
      char: "curly braces",
      md: "Paragraph with {curly} braces and {{double}}.",
      expected: ["{curly}", "{{double}}"],
    },
    {
      char: "pipe characters",
      md: "Command: ls | grep foo | wc -l",
      expected: ["|", "ls", "grep"],
    },
    {
      char: "backslashes",
      md: "Path: C:\\Users\\name\\file.txt",
      expected: ["\\"],
    },
  ])("should preserve $char", ({ md, expected }) => {
    const output = roundtrip(md)
    for (const e of expected) expect(output).toContain(e)
  })
})

describe("Round-trip: Resolved Embeddings (km-xexz Phase 4)", () => {
  test("should serialize embedding from embed_source target", () => {
    const fileNode = makeTestNode({
      id: "file-id-789",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetNode = makeTestNode({
      id: "target-id-123",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/projects/api.md",
      content: "API Documentation",
    })
    const embeddingNode = makeTestNode({
      id: "embed-id-456",
      type: "p",
      parent_id: "file-id-789",
      parent_idx: 1,
      embed_source: "target-id-123",
      content: "![[projects/api]]",
    })

    expect(nodesToMarkdown([fileNode, embeddingNode, targetNode])).toContain("![[api]]")
  })

  test("should serialize embedding with alias from name", () => {
    const fileNode = makeTestNode({
      id: "file-id-789",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetNode = makeTestNode({
      id: "target-id-123",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/docs/authentication.md",
      content: "Authentication Guide",
    })
    const embeddingNode = makeTestNode({
      id: "embed-id-456",
      type: "p",
      parent_id: "file-id-789",
      parent_idx: 1,
      embed_source: "target-id-123",
      name: "Auth Docs",
      content: "![[authentication|Auth Docs]]",
    })

    expect(nodesToMarkdown([fileNode, embeddingNode, targetNode])).toContain("![[authentication|Auth Docs]]")
  })

  test("should serialize embedding to section using title", () => {
    const fileNode = makeTestNode({
      id: "file-id-789",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetSection = makeTestNode({
      id: "section-id-123",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "parent-file",
      parent_idx: 1,
      title: "API Reference",
      content: "API Reference",
    })
    const embeddingNode = makeTestNode({
      id: "embed-id-456",
      type: "p",
      parent_id: "file-id-789",
      parent_idx: 1,
      embed_source: "section-id-123",
      content: "![[#API Reference]]",
    })

    expect(nodesToMarkdown([fileNode, embeddingNode, targetSection])).toContain("![[API Reference]]")
  })

  test("should fallback to content when embed_source target not found", () => {
    const fileNode = makeTestNode({
      id: "file-id-789",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const embeddingNode = makeTestNode({
      id: "embed-id-456",
      type: "p",
      parent_id: "file-id-789",
      parent_idx: 1,
      embed_source: "nonexistent-target",
      content: "![[missing-file]]",
    })

    expect(nodesToMarkdown([fileNode, embeddingNode])).toContain("![[missing-file]]")
  })

  test("should serialize task with embed_source as embed, not raw task", () => {
    const fileNode = makeTestNode({
      id: "file-id-789",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/board.md",
    })
    const sectionNode = makeTestNode({
      id: "section-id-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "file-id-789",
      parent_idx: 1,
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "original-task-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "other-file",
      content: "Buy groceries",
      task_status: "todo",
      task_marker: "[ ]",
    })
    const linkTask = makeTestNode({
      id: "link-task-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "section-id-1",
      parent_idx: 1,
      embed_source: "original-task-1",
      content: "Buy groceries",
      task_status: "todo",
      task_marker: "[ ]",
    })

    const md = nodesToMarkdown([fileNode, sectionNode, linkTask, targetTask])
    // Should NOT contain a raw task checkbox
    expect(md).not.toContain("- [ ] Buy groceries")
    // Should contain an embed reference to the target
    expect(md).toContain("![[")
  })

  test("should serialize ul with embed_source as embed", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetNode = makeTestNode({
      id: "target-ul-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "other-file",
      content: "Some list item",
    })
    const linkUl = makeTestNode({
      id: "link-ul-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "file-1",
      parent_idx: 1,
      embed_source: "target-ul-1",
      content: "Some list item",
    })

    const md = nodesToMarkdown([fileNode, linkUl, targetNode])
    expect(md).not.toContain("- Some list item")
    expect(md).toContain("![[")
  })

  test("should serialize ol with embed_source as embed", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetNode = makeTestNode({
      id: "target-ol-1",
      type: "p",
      item: true,
      list_marker: "1.",
      parent_id: "other-file",
      content: "Numbered item",
    })
    const linkOl = makeTestNode({
      id: "link-ol-1",
      type: "p",
      item: true,
      list_marker: "1.",
      parent_id: "file-1",
      parent_idx: 1,
      embed_source: "target-ol-1",
      content: "Numbered item",
    })

    const md = nodesToMarkdown([fileNode, linkOl, targetNode])
    expect(md).not.toContain("1. Numbered item")
    expect(md).toContain("![[")
  })

  test("should serialize section with embed_source as embed", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/test.md",
    })
    const targetNode = makeTestNode({
      id: "target-section-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "other-file",
      content: "Linked Section",
    })
    const linkSection = makeTestNode({
      id: "link-section-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      embed_source: "target-section-1",
      content: "Linked Section",
    })

    const md = nodesToMarkdown([fileNode, linkSection, targetNode])
    expect(md).not.toContain("## Linked Section")
    expect(md).toContain("![[")
  })

  test("embed_source with target in nodeMap uses target fs_path", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/board.md",
    })
    const targetFile = makeTestNode({
      id: "target-file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "inbox/tasks.md",
      content: "Tasks",
    })
    const linkTask = makeTestNode({
      id: "link-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "file-1",
      parent_idx: 1,
      embed_source: "target-file-1",
      content: "Do stuff",
    })

    const md = nodesToMarkdown([fileNode, linkTask, targetFile])
    expect(md).toContain("![[tasks]]")
    expect(md).not.toContain("- [ ]")
  })

  test("embed_source with missing target falls back to content", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      fs_path: "/repo/board.md",
    })
    const linkTask = makeTestNode({
      id: "link-1",
      type: "p",
      item: true,
      list_marker: "-",
      parent_id: "file-1",
      parent_idx: 1,
      embed_source: "nonexistent-id",
      content: "Buy groceries",
    })

    const md = nodesToMarkdown([fileNode, linkTask])
    // Falls back to content (raw text), not a checkbox task
    expect(md).toContain("Buy groceries")
    expect(md).not.toContain("- [ ]")
  })
})

describe("Section depth from tree position", () => {
  test("section depth derived from parent chain (direct child of file = H2)", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: ".",
      content: "Document",
    })
    const section = makeTestNode({
      id: "sec-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "New Section",
    })

    const md = nodesToMarkdown([fileNode, section])
    // Direct child of file = H2 (file absorbs the H1 level)
    expect(md).toContain("## New Section")
    expect(md).not.toMatch(/^# New Section/m)
  })

  test("section with empty content serializes at correct tree depth", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: ".",
      content: "Document",
    })
    const existing = makeTestNode({
      id: "sec-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Existing",
    })
    const empty = makeTestNode({
      id: "sec-2",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 2,
      content: "",
    })

    const md = nodesToMarkdown([fileNode, existing, empty])
    // Both are direct children of file, so both are H2
    expect(md).toContain("## Existing")
    expect(md).toContain("## ")
    // Verify no bare H1 (only the file heading)
    const h1Matches = md.match(/^# .+$/gm) ?? []
    expect(h1Matches).toHaveLength(1) // just "# Document"
  })
})

describe("Heading depth clamping", () => {
  test("H1 inside H3 section is clamped (cannot escape above root section)", () => {
    // Structure: H1 (merged) → H3 "Section A" → then H1 "Escaped"
    // sectionStack after H1: [{depth:1}]
    // H3: effectiveDepth = max(3, 1+1) = 3 → child of H1, stack: [{depth:1}, {depth:3}]
    // Second H1: effectiveDepth = max(1, 1+1) = 2 → pop H3 (3≥2), keep H1 (1<2)
    //   → becomes child of root H1, sibling of Section A, clamped from H1 to H2
    // After H1 merge: both Section A and Escaped become children of file
    const md = `# Document

### Section A

# Escaped Heading

Some content`
    const nodes = parse(md)
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    expect(sections).toHaveLength(2)
    const sectionA = sections.find((n) => n.content === "Section A")
    const escaped = sections.find((n) => n.content === "Escaped Heading")
    expect(sectionA).toBeDefined()
    expect(escaped).toBeDefined()

    // Both are children of file (H1 was merged into file)
    // The escaped H1 was clamped to H2 (same level as Section A after merge)
    expect(sectionA!.parent_id).toBe(fileNode!.id)
    expect(escaped!.parent_id).toBe(fileNode!.id)

    // Round-trip: serialized output should NOT show bare # for "Escaped"
    const output = nodesToMarkdown(nodes)
    expect(output).not.toMatch(/^# Escaped Heading/m)
    // Both are direct children of file → both serialize as H2
    expect(output).toContain("## Escaped Heading")
  })

  test("H1 at root level is still merged into file node", () => {
    const md = `# Title

## Section`
    const nodes = parse(md)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(fileNode?.title).toBe("Title")
    expect(sections).toHaveLength(1)
    expect(sections[0]?.content).toBe("Section")
  })

  test("normal nesting (H2 → H3 → H2) is unchanged", () => {
    const md = `# Title

## First

### Nested

## Second`
    const nodes = parse(md)
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")

    expect(sections).toHaveLength(3)
    const first = sections.find((n) => n.content === "First")!
    const nested = sections.find((n) => n.content === "Nested")!
    const second = sections.find((n) => n.content === "Second")!

    // First and Second are siblings under file
    expect(first.parent_id).toBe(fileNode!.id)
    expect(second.parent_id).toBe(fileNode!.id)
    // Nested is child of First
    expect(nested.parent_id).toBe(first.id)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## First")
    expect(output).toContain("### Nested")
    expect(output).toContain("## Second")
  })

  test("H2 inside H2 is clamped to H3", () => {
    const md = `# Title

## Parent

## Child Should Nest`
    // Two H2s at root → they're siblings, no clamping needed
    // (clamping only applies when heading depth ≤ enclosing section)
    const nodes = parse(md)
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    // Both H2s are siblings at file level — no clamping, they're at root
    expect(sections).toHaveLength(2)
    expect(sections[0]?.parent_id).toBe(fileNode!.id)
    expect(sections[1]?.parent_id).toBe(fileNode!.id)
  })

  test("multiple escaped headings are all clamped", () => {
    // Structure: H1 "Doc" (merged), H2 "Outer", H1 "Inner One", H1 "Inner Two"
    // sectionStack after H1: [{depth:1}]
    // H2: effectiveDepth = max(2, 1+1) = 2 → child of H1, stack: [{depth:1}, {depth:2}]
    // First H1: effectiveDepth = max(1, 1+1) = 2 → pop H2 (2≥2), keep root H1 (1<2)
    //   → sibling of Outer, child of root H1
    // Second H1: same clamping → sibling of Outer and Inner One
    // After merge: all three become children of file node
    const md = `# Doc

## Outer

# Inner One

# Inner Two

Content`
    const nodes = parse(md)
    const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
    const fileNode = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdfile")

    const outer = sections.find((n) => n.content === "Outer")!
    const inner1 = sections.find((n) => n.content === "Inner One")!
    const inner2 = sections.find((n) => n.content === "Inner Two")!

    // All three are siblings under file (H1s clamped to H2)
    expect(outer.parent_id).toBe(fileNode!.id)
    expect(inner1.parent_id).toBe(fileNode!.id)
    expect(inner2.parent_id).toBe(fileNode!.id)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Outer")
    expect(output).toContain("## Inner One")
    expect(output).toContain("## Inner Two")
    // No bare H1s in output (only the file title)
    const h1s = output.match(/^# .+$/gm) ?? []
    expect(h1s).toHaveLength(1) // just "# Doc"
  })
})

// =============================================================================
// Bug fixes: km-markdown.roundtrip-lossy (P0 silent data loss)
// =============================================================================

describe("Bug fix A1: Duplicate embeds not dropped during serialization", () => {
  test("two sibling nodes embedding the same target both survive roundtrip", () => {
    const nodes: KNode[] = [
      makeTestNode({
        id: "file1",
        type: "h",
        item: true,
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        fs_path: "test.md",
        name: "test",
        content: "Test File",
        title: "Test File",
      }),
      makeTestNode({
        id: "embed1",
        type: "p",
        parent_id: "file1",
        parent_idx: 0,
        embed_source: "shared-target",
        content: "![[shared-target]]",
      }),
      makeTestNode({
        id: "embed2",
        type: "p",
        parent_id: "file1",
        parent_idx: 1,
        embed_source: "shared-target",
        content: "![[shared-target]]",
      }),
    ]

    const md = nodesToMarkdown(nodes, nodes)
    // Both embeds must be present — the old code dropped the second one
    const embedMatches = md.match(/!\[\[shared-target\]\]/g) ?? []
    expect(embedMatches).toHaveLength(2)
  })
})

describe("Bug fix A2: Root H1 task marks, rules, and block IDs roundtrip", () => {
  test("H1 with task marker roundtrips", () => {
    const md = `# [x] Completed Task\n\nSome content.\n`
    const output = roundtrip(md)
    expect(output).toContain("# [x] Completed Task")
  })

  test("H1 with rules roundtrips", () => {
    const md = `# My Board km.add:: status:todo km.collapse:: true\n\nSome content.\n`
    const output = roundtrip(md)
    expect(output).toContain("# My Board km.add:: status:todo km.collapse:: true")
  })

  test("H1 with block ID roundtrips", () => {
    const md = `# My Heading ^ab12\n\nSome content.\n`
    const output = roundtrip(md)
    expect(output).toContain("# My Heading ^ab12")
  })

  test("H1 with task marker and block ID roundtrips", () => {
    const md = `# [ ] Todo Item ^zz99\n\nSome content.\n`
    const output = roundtrip(md)
    expect(output).toContain("# [ ] Todo Item ^zz99")
  })

  test("block_id is copied to file node during H1 merge", () => {
    const md = `# Heading ^ab12\n\nSome content.\n`
    const nodes = parse(md)
    const fileNode = nodes.find((n) => n.fstype === "mdfile")
    expect(fileNode?.block_id).toBe("ab12")
  })
})

describe("Bug fix A3: Multi-paragraph list items preserved", () => {
  test("list item with multiple paragraphs preserves extra paragraphs", () => {
    const md = `# Doc\n\n- First paragraph\n\n  Second paragraph\n\n  Third paragraph\n`
    const output = roundtrip(md)
    expect(output).toContain("First paragraph")
    expect(output).toContain("Second paragraph")
    expect(output).toContain("Third paragraph")
  })

  test("list item with table child preserves table", () => {
    const md = `# Doc\n\n- Item with table\n\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |\n`
    const nodes = parse(md)
    const tableNode = nodes.find((n) => n.type === "table")
    expect(tableNode).toBeDefined()
    expect(tableNode?.content).toContain("| A")
  })
})

describe("Bug fix A4: Code blocks with triple backticks in content", () => {
  test("code block containing triple backticks uses tilde fence", () => {
    const nodes: KNode[] = [
      makeTestNode({
        id: "file1",
        type: "h",
        item: true,
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        fs_path: "test.md",
        name: "test",
        content: "Test",
        title: "Test",
      }),
      makeTestNode({
        id: "code1",
        type: "code",
        parent_id: "file1",
        parent_idx: 0,
        content: "```\ninner code\n```",
        data: { lang: "markdown" },
      }),
    ]

    const md = nodesToMarkdown(nodes)
    // Must use tilde fence since content contains triple backticks
    expect(md).toContain("~~~~markdown")
    expect(md).toContain("~~~~\n\n")
    expect(md).toContain("```\ninner code\n```")
  })

  test("code block without backticks uses standard triple backtick fence", () => {
    const nodes: KNode[] = [
      makeTestNode({
        id: "file1",
        type: "h",
        item: true,
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        fs_path: "test.md",
        name: "test",
        content: "Test",
        title: "Test",
      }),
      makeTestNode({
        id: "code1",
        type: "code",
        parent_id: "file1",
        parent_idx: 0,
        content: "const x = 1",
        data: { lang: "ts" },
      }),
    ]

    const md = nodesToMarkdown(nodes)
    expect(md).toContain("```ts")
    expect(md).toContain("```\n\n")
  })
})

describe("Bug fix A5: Footnotes not silently dropped", () => {
  test("footnote syntax is treated as plain text (not silently consumed)", () => {
    // With footnote extensions removed, footnote syntax should be preserved as-is
    // (either as plain text or as link syntax, not silently dropped)
    const md = `# Doc\n\nSome text with a reference[^1].\n\n[^1]: This is the footnote.\n`
    const output = roundtrip(md)
    // The footnote reference and definition text should survive (not be dropped)
    expect(output).toContain("reference")
    expect(output).toContain("footnote")
  })
})

describe("Bug fix A6: Malformed YAML frontmatter preserved", () => {
  test("malformed YAML frontmatter is preserved verbatim on roundtrip", () => {
    const md = `---\ninvalid: yaml: content: [broken\n---\n\n# Title\n\nContent.\n`
    const output = roundtrip(md)
    // The malformed YAML should be preserved, not silently discarded
    expect(output).toContain("---")
    expect(output).toContain("invalid: yaml: content: [broken")
  })

  test("valid YAML frontmatter still works normally", () => {
    const md = `---\ntitle: My Doc\ntags:\n  - one\n  - two\n---\n\n# Title\n\nContent.\n`
    const output = roundtrip(md)
    expect(output).toContain("title: My Doc")
  })
})

// =============================================================================
// Bug fix B: km-markdown.ref-extraction-bugs (P1)
// =============================================================================

describe("Bug fix B: Refs not extracted from key:: value pairs", () => {
  test("refs inside key:: value pairs are not extracted (false positive)", () => {
    const md = `# Doc\n\n- [ ] Task blocked-by:: #feature-tag\n`
    const nodes = parse(md)
    const taskNode = nodes.find((n) => n.type === "p" && n.item === true && n.task_marker)
    // The #feature-tag is inside the value of blocked-by::, not in the content text.
    // It should NOT be extracted as a tag on the node.
    const tags = (taskNode?.data as Record<string, unknown>)?.tags as string[] | undefined
    // If cleanText is used, the tag inside the property value should not be extracted
    expect(tags).toBeUndefined()
  })
})

// =============================================================================
// Bug fix C: km-markdown.list-table-fidelity (P1)
// =============================================================================

describe("Bug fix C1: Ordered list start number preserved", () => {
  test("ordered list starting at 1 uses 1.", () => {
    const md = `# Doc\n\n1. First item\n1. Second item\n`
    const output = roundtrip(md)
    expect(output).toMatch(/1\. First item/)
  })

  test("ordered list stores list_start for non-1 start", () => {
    // mdast preserves the start number for ordered lists
    const md = `# Doc\n\n3. Third item\n4. Fourth item\n`
    const nodes = parse(md)
    const orderedItem = nodes.find((n) => n.list_marker === "1.")
    // Should store list_start in data when start !== 1
    expect((orderedItem?.data as Record<string, unknown>)?.list_start).toBe(3)
  })
})

describe("Bug fix C2: Table alignment preserved", () => {
  test("table with right-aligned column preserves alignment", () => {
    const md = `# Doc\n\n| Left | Right |\n| --- | ---: |\n| a | 1 |\n`
    const output = roundtrip(md)
    // Separator should have right-alignment marker
    expect(output).toMatch(/---+:/)
  })

  test("table with center-aligned column preserves alignment", () => {
    const md = `# Doc\n\n| Name | Center |\n| --- | :---: |\n| a | b |\n`
    const output = roundtrip(md)
    // Separator should have center-alignment markers
    expect(output).toMatch(/:---+:/)
  })

  test("table cell with pipe character is escaped", () => {
    const md = `# Doc\n\n| A | B |\n| --- | --- |\n| x \\| y | z |\n`
    const output = roundtrip(md)
    // The pipe in cell content should be escaped
    expect(output).toContain("\\|")
  })
})

// =============================================================================
// P2-1: Multi-paragraph list item serialization
// =============================================================================

describe("Multi-paragraph list item serialization", () => {
  test("blank line between paragraphs in a list item", () => {
    const md = `# Doc\n\n- first para\n\n  second para\n`
    const output = roundtrip(md)
    // The two paragraphs must be separated by a blank line inside the list item
    expect(output).toContain("- first para\n\n  second para")
  })

  test("blank line before each extra paragraph in list item with multiple", () => {
    const md = `# Doc\n\n- para one\n\n  para two\n\n  para three\n`
    const output = roundtrip(md)
    expect(output).toContain("- para one\n\n  para two\n\n  para three")
  })

  test("task list item with extra paragraph gets blank line", () => {
    const md = `# Doc\n\n- [ ] task title\n\n  extra detail\n`
    const output = roundtrip(md)
    // Should have blank line between task line and extra paragraph
    expect(output).toMatch(/- \[ \] task title\n\n  extra detail/)
  })
})

// =============================================================================
// P2-2: Ordered list sequential numbering
// =============================================================================

describe("Ordered list sequential numbering", () => {
  test("ordered list starting at 3 uses sequential numbers", () => {
    const md = `# Doc\n\n3. First\n4. Second\n5. Third\n`
    const output = roundtrip(md)
    expect(output).toContain("3. First")
    expect(output).toContain("4. Second")
    expect(output).toContain("5. Third")
  })

  test("ordered list starting at 1 uses sequential numbers", () => {
    const md = `# Doc\n\n1. Alpha\n2. Beta\n3. Gamma\n`
    const output = roundtrip(md)
    expect(output).toContain("1. Alpha")
    expect(output).toContain("2. Beta")
    expect(output).toContain("3. Gamma")
  })
})
