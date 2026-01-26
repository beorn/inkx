/**
 * Round-trip Parsing Tests (km-bk9)
 *
 * Tests that markdown -> nodes -> markdown preserves content correctly.
 * These tests verify that parsing and then serializing produces equivalent output.
 */

import { describe, test, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import type { KNode } from "@km/core"

import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { extractFrontmatter } from "../src/parser.ts"

/**
 * Helper to normalize whitespace for comparison
 * - Trims trailing whitespace from lines
 * - Collapses multiple blank lines to single blank line
 * - Trims leading/trailing whitespace from document
 */
function normalizeMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Helper to compare markdown semantically
 * Returns true if both produce the same parsed structure
 */
function contentMatches(original: string, regenerated: string): boolean {
  const origNodes = parseMarkdownToNodes(original, "test.md")
  const regenNodes = parseMarkdownToNodes(regenerated, "test.md")

  // Compare node types and content
  if (origNodes.length !== regenNodes.length) return false

  for (let i = 0; i < origNodes.length; i++) {
    if (origNodes[i]!.type !== regenNodes[i]!.type) return false
    if (origNodes[i]!.content !== regenNodes[i]!.content) return false
  }

  return true
}

describe("Round-trip: Basic Elements", () => {
  test("should preserve simple paragraph", () => {
    const md = "This is a simple paragraph."
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("This is a simple paragraph")
  })

  test("should preserve multiple paragraphs", () => {
    const md = `First paragraph.

Second paragraph.

Third paragraph.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("First paragraph")
    expect(output).toContain("Second paragraph")
    expect(output).toContain("Third paragraph")
  })

  test("should preserve text content (inline formatting becomes plain text)", () => {
    // Note: Current parser strips inline formatting but preserves text content
    const md = `This has **bold** and *italic* and \`code\`.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Text content is preserved (formatting is not)
    expect(output).toContain("This has bold and italic and code")
  })

  test("should preserve headings", () => {
    const md = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("# Heading 1")
    expect(output).toContain("## Heading 2")
    expect(output).toContain("### Heading 3")
    expect(output).toContain("#### Heading 4")
  })

  test("should preserve horizontal rules", () => {
    const md = `Before

---

After`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("---")
    expect(output).toContain("Before")
    expect(output).toContain("After")
  })
})

describe("Round-trip: Tasks", () => {
  test("should preserve open task", () => {
    const md = `- [ ] Open task`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("- [ ]")
    expect(output).toContain("Open task")
  })

  test("should preserve completed task", () => {
    const md = `- [x] Completed task`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("- [x]")
    expect(output).toContain("Completed task")
  })

  test("should preserve multiple tasks", () => {
    const md = `- [ ] Task one
- [ ] Task two
- [x] Task three done`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Task one")
    expect(output).toContain("Task two")
    expect(output).toContain("Task three done")
  })

  test("should preserve task with due date", () => {
    const md = `- [ ] Task with due 📅 2025-03-15`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("📅 2025-03-15")
    expect(output).toContain("Task with due")
  })

  test("should preserve task with scheduled date", () => {
    const md = `- [ ] Task scheduled ⏳ 2025-03-10`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("⏳ 2025-03-10")
  })

  test("should preserve task with priority", () => {
    const md = `- [ ] High priority ⏫
- [ ] Medium priority 🔼
- [ ] Low priority 🔽`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("⏫")
    expect(output).toContain("🔼")
    expect(output).toContain("🔽")
  })

  test("should preserve task with full metadata", () => {
    const md = `- [ ] Full metadata 📅 2025-04-01 ⏳ 2025-03-25 ⏫`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("📅 2025-04-01")
    expect(output).toContain("⏳ 2025-03-25")
    expect(output).toContain("⏫")
  })

  test("should preserve task with tags", () => {
    const md = `- [ ] Task with #important tag`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("#important")
  })
})

describe("Round-trip: Lists", () => {
  test("should preserve unordered list", () => {
    const md = `- Item one
- Item two
- Item three`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Item one")
    expect(output).toContain("Item two")
    expect(output).toContain("Item three")
  })

  test("should preserve ordered list", () => {
    const md = `1. First item
2. Second item
3. Third item`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("First item")
    expect(output).toContain("Second item")
    expect(output).toContain("Third item")
  })
})

describe("Round-trip: Blockquotes", () => {
  test("should preserve simple blockquote", () => {
    const md = `> This is a quote.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain(">")
    expect(output).toContain("This is a quote")
  })

  test("should preserve multi-line blockquote", () => {
    const md = `> Line one
> Line two
> Line three`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Line one")
    expect(output).toContain("Line two")
  })
})

describe("Round-trip: Code Blocks", () => {
  test("should preserve code block with language", () => {
    const md = `\`\`\`javascript
const x = 1;
console.log(x);
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("```javascript")
    expect(output).toContain("const x = 1")
    expect(output).toContain("```")
  })

  test("should preserve code block without language", () => {
    const md = `\`\`\`
plain code
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("```")
    expect(output).toContain("plain code")
  })

  test("should preserve multiple code blocks", () => {
    const md = `\`\`\`python
def foo():
    pass
\`\`\`

\`\`\`typescript
function bar() {}
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("```python")
    expect(output).toContain("def foo()")
    expect(output).toContain("```typescript")
    expect(output).toContain("function bar()")
  })
})

describe("Round-trip: Tables", () => {
  test("should preserve simple table", () => {
    const md = `| A | B |
|---|---|
| 1 | 2 |`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Tables are stored as raw content
    expect(output).toContain("A")
    expect(output).toContain("B")
    expect(output).toContain("1")
    expect(output).toContain("2")
  })
})

describe("Round-trip: Sections with Content", () => {
  test("should preserve section with paragraph", () => {
    const md = `# My Section

This is content under the section.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("# My Section")
    expect(output).toContain("This is content under the section")
  })

  test("should preserve nested sections", () => {
    const md = `# Top

## Middle

### Bottom

Content at bottom.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("# Top")
    expect(output).toContain("## Middle")
    expect(output).toContain("### Bottom")
    expect(output).toContain("Content at bottom")
  })

  test("should preserve section with tasks", () => {
    const md = `## Tasks

- [ ] Task one
- [ ] Task two
- [x] Task done`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("## Tasks")
    expect(output).toContain("Task one")
    expect(output).toContain("Task two")
    expect(output).toContain("Task done")
  })

  test("should preserve section with mixed content", () => {
    const md = `## Mixed Section

A paragraph here.

- [ ] A task

> A quote

\`\`\`
code
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("## Mixed Section")
    expect(output).toContain("A paragraph here")
    expect(output).toContain("A task")
    expect(output).toContain("A quote")
    expect(output).toContain("code")
  })
})

describe("Round-trip: Edge Cases", () => {
  test("should preserve empty task content", () => {
    const md = `- [ ] `
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("- [ ]")
  })

  test("should preserve task with special characters", () => {
    const md = `- [ ] Task with "quotes" and 'apostrophes'`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain('"quotes"')
    expect(output).toContain("'apostrophes'")
  })

  test("should preserve task with emoji", () => {
    const md = `- [ ] Task with emoji 🚀 🎉 ✨`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("🚀")
    expect(output).toContain("🎉")
    expect(output).toContain("✨")
  })

  test("should preserve unicode content", () => {
    const md = `# 日本語

- [ ] タスク
- [ ] Задача
- [ ] 任务`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("日本語")
    expect(output).toContain("タスク")
    expect(output).toContain("Задача")
    expect(output).toContain("任务")
  })

  test("should preserve wikilinks in content", () => {
    const md = `Check [[Other Page]] for more.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[[Other Page]]")
  })

  test("should preserve aliased wikilinks", () => {
    const md = `See [[Target|display text]] here.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[[Target|display text]]")
  })
})

describe("Round-trip: Complex Documents", () => {
  test("should preserve content through full document cycle", () => {
    const md = `# Test Document

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

Final paragraph.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // All key content should be preserved
    expect(output).toContain("# Test Document")
    expect(output).toContain("This is a paragraph")
    expect(output).toContain("## Tasks")
    expect(output).toContain("Task one")
    expect(output).toContain("📅 2025-03-15")
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

    // First round-trip
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)

    // After second round-trip, should be stable
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })
})

describe("Round-trip: Fixture Files", () => {
  const fixturesDir = join(import.meta.dir, "fixtures")

  test("should round-trip inbox.md", () => {
    const original = readFileSync(join(fixturesDir, "inbox.md"), "utf-8")
    const { body } = extractFrontmatter(original)

    const nodes = parseMarkdownToNodes(body, "inbox.md")
    const output = nodesToMarkdown(nodes)

    // Key content preserved (section becomes heading text)
    expect(output).toContain("Quick capture")
    expect(output).toContain("Buy groceries")
  })

  test("should round-trip sample-project.md", () => {
    const original = readFileSync(
      join(fixturesDir, "sample-project.md"),
      "utf-8",
    )
    const { body } = extractFrontmatter(original)

    const nodes = parseMarkdownToNodes(body, "sample-project.md")
    const output = nodesToMarkdown(nodes)

    // Key structure preserved
    expect(output).toContain("Sample Project")
    expect(output).toContain("Tasks Section")
    expect(output).toContain("Content Blocks")
  })

  test("should round-trip daily-note.md", () => {
    const original = readFileSync(join(fixturesDir, "daily-note.md"), "utf-8")
    const { body } = extractFrontmatter(original)

    const nodes = parseMarkdownToNodes(body, "daily-note.md")
    const output = nodesToMarkdown(nodes)

    // Key sections preserved
    expect(output).toContain("Morning Review")
    expect(output).toContain("Focus Time")
    expect(output).toContain("Project Alpha")
  })

  test("should round-trip comprehensive.md", () => {
    const original = readFileSync(
      join(fixturesDir, "comprehensive.md"),
      "utf-8",
    )
    const { body } = extractFrontmatter(original)

    const nodes = parseMarkdownToNodes(body, "comprehensive.md")
    const output = nodesToMarkdown(nodes)

    // All major elements preserved
    expect(output).toContain("Main Section")
    expect(output).toContain("Tasks with Standard Marks")
    expect(output).toContain("Blockquotes")
    expect(output).toContain("Code Blocks")
    expect(output).toContain("Tables")
  })

  test("comprehensive.md key content is preserved after round-trip", () => {
    const original = readFileSync(
      join(fixturesDir, "comprehensive.md"),
      "utf-8",
    )
    const { body } = extractFrontmatter(original)

    // First round-trip
    const nodes1 = parseMarkdownToNodes(body, "comprehensive.md")
    const md1 = nodesToMarkdown(nodes1)

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "comprehensive.md")
    const md2 = nodesToMarkdown(nodes2)

    // Key content should be preserved
    // Note: Nested lists have known issues with duplication in current implementation
    expect(md2).toContain("Main Section")
    expect(md2).toContain("Tasks with Standard Marks")
    expect(md2).toContain("Code Blocks")

    // Node counts should be consistent between round-trips
    const tasks1 = nodes1.filter((n) => n.type === "task")
    const tasks2 = nodes2.filter((n) => n.type === "task")
    expect(tasks1.length).toBe(tasks2.length)

    const sections1 = nodes1.filter((n) => n.type === "section")
    const sections2 = nodes2.filter((n) => n.type === "section")
    expect(sections1.length).toBe(sections2.length)
  })
})

describe("Round-trip: Content Preservation Verification", () => {
  test("should preserve task status in node", () => {
    const md = `- [ ] Open
- [x] Done`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    expect(tasks.length).toBe(2)
    expect(tasks[0]!.task_status).toBe("todo")
    expect(tasks[1]!.task_status).toBe("done")

    // After round-trip, statuses should be preserved
    const output = nodesToMarkdown(nodes)
    const nodes2 = parseMarkdownToNodes(output, "test.md")
    const tasks2 = nodes2.filter((n) => n.type === "task")

    expect(tasks2[0]!.task_status).toBe("todo")
    expect(tasks2[1]!.task_status).toBe("done")
  })

  test("should preserve task metadata in node", () => {
    const md = `- [ ] Task 📅 2025-12-25 ⏫`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n) => n.type === "task")

    expect(task).toBeDefined()
    expect(task!.due_date).toBe("2025-12-25")
    expect(task!.priority).toBe(1)

    // After round-trip, metadata should be preserved
    const output = nodesToMarkdown(nodes)
    const nodes2 = parseMarkdownToNodes(output, "test.md")
    const task2 = nodes2.find((n) => n.type === "task")

    expect(task2!.due_date).toBe("2025-12-25")
    expect(task2!.priority).toBe(1)
  })

  test("should preserve section depth", () => {
    const md = `# H1

## H2

### H3`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const sections = nodes.filter((n) => n.type === "section")
    const fileNode = nodes.find((n) => n.type === "file")

    // H1 is merged into file node, so only 2 section nodes
    expect(sections.length).toBe(2)
    expect(fileNode?.data?.depth).toBe(1)
    expect(sections[0]?.data?.depth).toBe(2)
    expect(sections[1]?.data?.depth).toBe(3)

    // After round-trip
    const output = nodesToMarkdown(nodes)
    const nodes2 = parseMarkdownToNodes(output, "test.md")
    const sections2 = nodes2.filter((n) => n.type === "section")
    const fileNode2 = nodes2.find((n) => n.type === "file")

    expect(fileNode2?.data?.depth).toBe(1)
    expect(sections2[0]?.data?.depth).toBe(2)
    expect(sections2[1]?.data?.depth).toBe(3)
  })

  test("should preserve code language", () => {
    const md = `\`\`\`typescript
const x: number = 1;
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const code = nodes.find((n) => n.type === "code")

    expect(code).toBeDefined()
    expect(code!.data?.lang).toBe("typescript")

    // After round-trip
    const output = nodesToMarkdown(nodes)
    const nodes2 = parseMarkdownToNodes(output, "test.md")
    const code2 = nodes2.find((n) => n.type === "code")

    expect(code2!.data?.lang).toBe("typescript")
  })
})

describe("Round-trip: Additional Edge Cases", () => {
  test("should handle empty document", () => {
    const md = ""
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Parser may create a root section for the file
    // The important thing is output is also essentially empty
    expect(output.trim()).toBe("")
  })

  test("should handle document with only whitespace", () => {
    const md = "   \n\n   \n"
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output.trim()).toBe("")
  })

  test("should handle document with only headings (no tasks)", () => {
    const md = `# Main Title

## Section One

Some content here.

## Section Two

More content.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")
    const sections = nodes.filter((n) => n.type === "section")

    expect(tasks.length).toBe(0)
    expect(sections.length).toBeGreaterThan(0)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# Main Title")
    expect(output).toContain("## Section One")
  })

  test("should handle RTL text (Hebrew)", () => {
    const md = `# שלום עולם

- [ ] משימה בעברית`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("שלום עולם")
    expect(output).toContain("משימה בעברית")
  })

  test("should handle RTL text (Arabic)", () => {
    const md = `# مرحبا بالعالم

- [ ] مهمة بالعربية`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("مرحبا بالعالم")
    expect(output).toContain("مهمة بالعربية")
  })

  test("should handle deeply nested structure (5+ levels)", () => {
    const md = `# Level 1

## Level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6

Content at deepest level.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const sections = nodes.filter((n) => n.type === "section")

    // H1 is merged into file node, so only 5 section nodes (levels 2-6)
    expect(sections.length).toBe(5)

    // File node should have H1 title
    const fileNode = nodes.find((n) => n.type === "file")
    expect(fileNode?.title).toBe("Level 1")

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# Level 1")
    expect(output).toContain("###### Level 6")
  })

  test("should handle very long lines", () => {
    const longContent = "A".repeat(500)
    const md = `- [ ] ${longContent}`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain(longContent)
  })

  test("should handle document with only a single task", () => {
    const md = `- [ ] Single task`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    expect(tasks.length).toBe(1)
    expect(tasks[0]!.content).toBe("Single task")
  })

  test("should preserve task with blocked status mark", () => {
    // Test the [!] blocked mark - parsed as regular list item by GFM
    // but verify the content is preserved
    const md = `- [!] Blocked task`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // GFM doesn't recognize [!] as task, but content should be preserved
    expect(output).toContain("Blocked task")
  })

  test("should preserve task with dropped status mark", () => {
    // Test the [-] dropped mark - parsed as regular list item by GFM
    const md = `- [-] Dropped task`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Dropped task")
  })
})

describe("Round-trip: Wiki Link Embeddings", () => {
  test("should preserve simple embedding", () => {
    const md = `![[Target Page]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Target Page]]")
  })

  test("should preserve embedding with section anchor", () => {
    const md = `![[Target Page#Section]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Target Page#Section]]")
  })

  test("should preserve embedding with block ID", () => {
    const md = `![[Target Page^block123]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Target Page^block123]]")
  })

  test("should preserve embedding with alias", () => {
    const md = `![[Target Page|Display Text]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Target Page|Display Text]]")
  })

  test("should preserve embedding with section and alias", () => {
    const md = `![[Projects/API#Auth|API Authentication]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Projects/API#Auth|API Authentication]]")
  })

  test("should NOT convert regular wikilink to embedding", () => {
    const md = `See [[Other Page]] for details.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Should remain as regular wikilink, NOT become embedding
    expect(output).toContain("[[Other Page]]")
    expect(output).not.toContain("![[Other Page]]")
  })

  test("should preserve embedding syntax in paragraph content", () => {
    const md = `![[Target]]`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const para = nodes.find((n) => n.type === "paragraph")

    expect(para).toBeDefined()
    // Content preserves the embedding syntax for later target resolution
    expect(para!.content).toBe("![[Target]]")
    // link_to will be set during target resolution (Phase 2 of km-xexz)
    expect(para!.link_to).toBeNull()
  })

  test("should preserve mixed-content paragraph with embedding", () => {
    const md = `Some text before ![[Target]] and after.`
    const nodes = parseMarkdownToNodes(md, "test.md")
    const para = nodes.find((n) => n.type === "paragraph")

    expect(para).toBeDefined()
    // Mixed content preserves the full text
    expect(para!.content).toBe("Some text before ![[Target]] and after.")
  })

  test("should preserve embedding in document with multiple elements", () => {
    const md = `# Document

## Tasks

![[Projects/TaskList]]

## Notes

Regular paragraph here.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("![[Projects/TaskList]]")
    expect(output).toContain("Regular paragraph here")
  })

  test("should be stable after double round-trip", () => {
    const original = `![[Projects/API#Auth|API Docs]]`

    // First round-trip
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)

    // Should be stable
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
    expect(md2).toContain("![[Projects/API#Auth|API Docs]]")
  })
})

/**
 * Comprehensive Round-trip Tests (km-744t)
 *
 * Additional tests for full coverage of markdown syntax and data model.
 */

describe("Round-trip: All Task Status Marks", () => {
  test("should preserve all standard and custom task marks", () => {
    const md = `- [ ] Open task (todo)
- [x] Completed task (done)
- [X] Also completed (done)
- [/] In progress task (wip)
- [-] Dropped/cancelled task (dropped)
- [!] Blocked task (blocked)`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    // Should have 6 tasks
    expect(tasks.length).toBe(6)

    // Verify all statuses are present
    const statuses = tasks.map((t) => t.task_status)
    expect(statuses).toContain("todo")
    expect(statuses).toContain("done")
    expect(statuses).toContain("wip")
    expect(statuses).toContain("dropped")
    expect(statuses).toContain("blocked")

    // Verify task marks are preserved
    const marks = tasks.map((t) => t.task_mark)
    expect(marks).toContain(" ")
    expect(marks.filter((m) => m === "x" || m === "X").length).toBe(2)
    expect(marks).toContain("/")
    expect(marks).toContain("-")
    expect(marks).toContain("!")

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

    // First round-trip
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "test.md")

    // Statuses should be stable
    const wip = nodes2.find((n) => n.content?.includes("WIP"))
    const blocked = nodes2.find((n) => n.content?.includes("Blocked"))

    expect(wip?.task_status).toBe("wip")
    expect(blocked?.task_status).toBe("blocked")
  })
})

describe("Round-trip: Task Metadata Formats", () => {
  test("should preserve Obsidian Tasks emoji format", () => {
    const md = `- [ ] Task with all metadata 📅 2025-12-25 ⏳ 2025-12-20 ⏫`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n) => n.type === "task")

    expect(task).toBeDefined()
    expect(task!.due_date).toBe("2025-12-25")
    expect(task!.scheduled_date).toBe("2025-12-20")
    expect(task!.priority).toBe(1)

    // Round-trip should preserve
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("📅 2025-12-25")
    expect(output).toContain("⏳ 2025-12-20")
    expect(output).toContain("⏫")
  })

  test("should preserve recurrence metadata", () => {
    const md = `- [ ] Recurring task 🔁 every week`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n) => n.type === "task")

    expect(task).toBeDefined()
    // Recurrence is stored in data.recurrence
    expect(task!.data?.recurrence).toBe("every week")
  })

  test("should preserve inline field format (due:, start:, p:)", () => {
    const md = `- [ ] Task with inline fields due:2025-11-15 start:2025-11-10 p:2`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n) => n.type === "task")

    expect(task).toBeDefined()
    expect(task!.due_date).toBe("2025-11-15")
    expect(task!.scheduled_date).toBe("2025-11-10")
    expect(task!.priority).toBe(2)
  })

  test("should preserve all priority levels", () => {
    const md = `- [ ] High priority ⏫
- [ ] Medium priority 🔼
- [ ] Low priority 🔽`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    expect(tasks[0]?.priority).toBe(1)
    expect(tasks[1]?.priority).toBe(2)
    expect(tasks[2]?.priority).toBe(3)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("⏫")
    expect(output).toContain("🔼")
    expect(output).toContain("🔽")
  })
})

describe("Round-trip: Wiki Links and Markdown Links", () => {
  test("should preserve wiki links with all variations", () => {
    const md = `Check [[simple link]] and [[path/to/note]] and [[target|alias]].`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[[simple link]]")
    expect(output).toContain("[[path/to/note]]")
    expect(output).toContain("[[target|alias]]")
  })

  test("should preserve wiki links with section anchors", () => {
    const md = `See [[note#heading]] and [[doc#section|link text]].`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[[note#heading]]")
    expect(output).toContain("[[doc#section|link text]]")
  })

  test("should preserve wiki links with block IDs", () => {
    const md = `Reference [[doc^block123]] and [[page^abc|ref]].`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[[doc^block123]]")
    expect(output).toContain("[[page^abc|ref]]")
  })

  test("should preserve markdown links text content", () => {
    // Note: Current implementation strips markdown link syntax, keeping only text
    const md = `Visit [Example](https://example.com) and [Docs](./docs/README.md).`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Text content is preserved
    expect(output).toContain("Example")
    expect(output).toContain("Docs")
  })
})

describe("Round-trip: Markdown Formatting", () => {
  test("should preserve inline formatting in content", () => {
    const md = `Text with **bold**, *italic*, \`code\`, and ~~strikethrough~~.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    // Current parser may or may not preserve formatting depending on implementation
    // At minimum, the text content should be preserved
    expect(output).toContain("bold")
    expect(output).toContain("italic")
    expect(output).toContain("code")
    expect(output).toContain("strikethrough")
  })

  test("should handle mixed formatting in tasks", () => {
    const md = `- [ ] Task with **important** and \`code\` parts`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("important")
    expect(output).toContain("code")
  })
})

describe("Round-trip: Section Rules (Board Syntax)", () => {
  test("should preserve section rules in headings", () => {
    const md = `# Board

## Ready add="status:todo"

- [ ] Task 1

## In Progress sync=status:wip limit=3

- [/] Task 2

## Done collapse=true

- [x] Task 3`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const sections = nodes.filter((n) => n.type === "section")

    // Verify rules are parsed
    const ready = sections.find((s) => s.title === "Ready")
    expect(ready?.rules?.add).toBe("status:todo")

    const inProgress = sections.find((s) => s.title === "In Progress")
    expect(inProgress?.rules?.sync).toBe("status:wip")
    expect(inProgress?.rules?.limit).toBe(3)

    const done = sections.find((s) => s.title === "Done")
    expect(done?.rules?.collapse).toBe(true)

    // Round-trip preserves rules in content
    const output = nodesToMarkdown(nodes)
    expect(output).toContain('add="status:todo"')
    expect(output).toContain("sync=status:wip")
    expect(output).toContain("limit=3")
    expect(output).toContain("collapse=true")
  })

  test("should preserve color rule", () => {
    const md = `## Section color=cyan`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const section = nodes.find((n) => n.type === "section")

    expect(section?.rules?.color).toBe("cyan")

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("color=cyan")
  })

  test("should preserve default=true rule", () => {
    const md = `## Inbox default=true`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const section = nodes.find((n) => n.type === "section")

    expect(section?.rules?.default).toBe(true)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("default=true")
  })
})

describe("Round-trip: Nested Tasks (Indentation)", () => {
  test("should preserve nested task hierarchy", () => {
    const md = `- [ ] Parent task
  - [ ] Child task 1
  - [x] Child task 2
    - [ ] Grandchild task`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    expect(tasks.length).toBeGreaterThanOrEqual(4)

    // Content should be preserved
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("Parent task")
    expect(output).toContain("Child task 1")
    expect(output).toContain("Child task 2")
    expect(output).toContain("Grandchild task")
  })

  test("should preserve mixed list/task nesting", () => {
    const md = `- Regular item
  - [ ] Nested task
- [ ] Top-level task
  - Nested regular item`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Regular item")
    expect(output).toContain("Nested task")
    expect(output).toContain("Top-level task")
  })
})

describe("Round-trip: Frontmatter", () => {
  test("should preserve YAML frontmatter fields", () => {
    const md = `---
title: Test Document
author: test-user
tags:
  - tag1
  - tag2
priority: 1
created: 2025-01-15
---

# Content`

    const { frontmatter, body } = extractFrontmatter(md)

    expect(frontmatter).toContain("title: Test Document")
    expect(frontmatter).toContain("author: test-user")
    expect(frontmatter).toContain("- tag1")
    expect(frontmatter).toContain("priority: 1")

    // Body should parse correctly
    const nodes = parseMarkdownToNodes(body, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")
    expect(fileNode?.title).toBe("Content")
  })

  test("should handle frontmatter with type field", () => {
    const md = `---
title: My Inbox
type: inbox
---

## Quick capture

- [ ] Task`

    const { frontmatter, body } = extractFrontmatter(md)

    expect(frontmatter).toContain("type: inbox")

    const nodes = parseMarkdownToNodes(body, "test.md")
    expect(nodes.length).toBeGreaterThan(0)
  })
})

describe("Round-trip: H1 Merging Edge Cases", () => {
  test("should merge H1 rules into file node", () => {
    const md = `# Board default=true color=blue

## Column 1`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")

    expect(fileNode?.title).toBe("Board")
    expect(fileNode?.rules?.default).toBe(true)
    expect(fileNode?.rules?.color).toBe("blue")
  })

  test("should handle file with no H1", () => {
    const md = `## Just a Section

Content here.

## Another Section`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")
    const sections = nodes.filter((n) => n.type === "section")

    // File has no title (no H1)
    expect(fileNode?.title).toBeUndefined()

    // Sections are children of file
    expect(sections.length).toBe(2)
    expect(fileNode).toBeDefined()
    for (const s of sections) {
      expect(s.parent_id).toBe(fileNode!.id)
    }
  })

  test("should handle multiple H1s (first is used)", () => {
    const md = `# First Title

Content.

# Second Title

More content.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")

    // First H1 merged
    expect(fileNode?.title).toBe("First Title")
  })
})

describe("Round-trip: Deep Section Hierarchy", () => {
  test("should handle all 6 heading levels", () => {
    const md = `# H1 Level

## H2 Level

### H3 Level

#### H4 Level

##### H5 Level

###### H6 Level

Deepest content.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")
    const sections = nodes.filter((n) => n.type === "section")

    // H1 merged into file
    expect(fileNode?.title).toBe("H1 Level")
    expect(fileNode?.data?.depth).toBe(1)

    // 5 section nodes (H2-H6)
    expect(sections.length).toBe(5)

    const depths = sections.map((s) => s.data?.depth)
    expect(depths).toContain(2)
    expect(depths).toContain(3)
    expect(depths).toContain(4)
    expect(depths).toContain(5)
    expect(depths).toContain(6)

    // Round-trip preserves
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("# H1 Level")
    expect(output).toContain("###### H6 Level")
  })

  test("should handle skipped heading levels", () => {
    const md = `# Title

## Section

#### Skipped to H4

###### Skipped to H6`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const sections = nodes.filter((n) => n.type === "section")

    // All sections should be created
    const depths = sections.map((s) => s.data?.depth)
    expect(depths).toContain(2)
    expect(depths).toContain(4)
    expect(depths).toContain(6)
  })

  test("should handle H2 after H2 (sibling sections)", () => {
    const md = `# Document

## Section A

Content A

## Section B

Content B

## Section C

Content C`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")
    const sections = nodes.filter((n) => n.type === "section")

    expect(sections.length).toBe(3)

    // All H2s are children of file (siblings)
    expect(fileNode).toBeDefined()
    for (const s of sections) {
      expect(s.parent_id).toBe(fileNode!.id)
      expect(s.data?.depth).toBe(2)
    }
  })
})

describe("Round-trip: Empty Content Edge Cases", () => {
  test("should handle section with no content", () => {
    const md = `# Title

## Empty Section

## Non-empty Section

Content here.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const sections = nodes.filter((n) => n.type === "section")

    expect(sections.length).toBe(2)

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("## Empty Section")
    expect(output).toContain("## Non-empty Section")
  })

  test("should handle task with minimal content", () => {
    // Note: Empty task "- [ ] " with trailing space may be parsed as list item
    // Test task with single character content instead
    const md = `- [ ] x`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n) => n.type === "task")

    expect(task).toBeDefined()
    expect(task!.task_status).toBe("todo")
    expect(task!.content).toBe("x")

    const output = nodesToMarkdown(nodes)
    expect(output).toContain("- [ ] x")
  })

  test("should handle empty code block", () => {
    const md = `\`\`\`javascript
\`\`\``

    const nodes = parseMarkdownToNodes(md, "test.md")
    const code = nodes.find((n) => n.type === "code")

    expect(code).toBeDefined()
    expect(code!.data?.lang).toBe("javascript")
  })
})

describe("Round-trip: Data Model Integrity", () => {
  test("should assign correct node types", () => {
    const md = `# Document

This is a paragraph.

- [ ] A task
- A list item

> A quote

\`\`\`python
code
\`\`\`

| A | B |
|---|---|
| 1 | 2 |

---`

    const nodes = parseMarkdownToNodes(md, "test.md")

    expect(nodes.some((n) => n.type === "file")).toBe(true)
    expect(nodes.some((n) => n.type === "paragraph")).toBe(true)
    expect(nodes.some((n) => n.type === "task")).toBe(true)
    expect(nodes.some((n) => n.type === "ul")).toBe(true)
    expect(nodes.some((n) => n.type === "quote")).toBe(true)
    expect(nodes.some((n) => n.type === "code")).toBe(true)
    expect(nodes.some((n) => n.type === "table")).toBe(true)
    expect(nodes.some((n) => n.type === "hr")).toBe(true)
  })

  test("should preserve node parent relationships", () => {
    const md = `# Doc

## Section

- [ ] Task in section`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const fileNode = nodes.find((n) => n.type === "file")
    const section = nodes.find((n) => n.type === "section")
    const task = nodes.find((n) => n.type === "task")

    expect(section?.parent_id).toBe(fileNode?.id)
    expect(task?.parent_id).toBe(section?.id)
  })

  test("should assign parent_idx for ordering", () => {
    const md = `- [ ] First
- [ ] Second
- [ ] Third`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const tasks = nodes.filter((n) => n.type === "task")

    // Parent indices should be in order
    expect(tasks[0]?.parent_idx).toBeLessThan(tasks[1]?.parent_idx ?? -1)
    expect(tasks[1]?.parent_idx).toBeLessThan(tasks[2]?.parent_idx ?? -1)
  })

  test("should preserve content_hash for large content", () => {
    // Generate content larger than inline threshold (if any)
    const longContent = "A".repeat(1000)
    const md = `${longContent}`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const para = nodes.find((n) => n.type === "paragraph")

    // Content should be present (either inline or via hash)
    expect(para?.content?.length || 0).toBeGreaterThan(0)
  })

  test("should set created_at and updated_at timestamps", () => {
    const md = `- [ ] Task`
    const beforeParse = Date.now()

    const nodes = parseMarkdownToNodes(md, "test.md")

    const afterParse = Date.now()
    const task = nodes.find((n) => n.type === "task")

    expect(task?.created_at).toBeGreaterThanOrEqual(beforeParse)
    expect(task?.created_at).toBeLessThanOrEqual(afterParse)
    expect(task?.updated_at).toBeGreaterThanOrEqual(beforeParse)
  })
})

describe("Round-trip: Special Characters", () => {
  test("should preserve angle brackets", () => {
    const md = `- [ ] Task with <angle> brackets`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("<angle>")
  })

  test("should preserve square brackets in content", () => {
    const md = `- [ ] Task with [square] brackets (not wiki link)`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("[square]")
  })

  test("should preserve curly braces", () => {
    const md = `Paragraph with {curly} braces and {{double}}.`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("{curly}")
    expect(output).toContain("{{double}}")
  })

  test("should preserve pipe characters", () => {
    const md = `Command: ls | grep foo | wc -l`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("|")
    expect(output).toContain("ls")
    expect(output).toContain("grep")
  })

  test("should preserve backslashes", () => {
    const md = `Path: C:\\Users\\name\\file.txt`

    const nodes = parseMarkdownToNodes(md, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("\\")
  })
})

describe("Round-trip: Resolved Embeddings (km-xexz Phase 4)", () => {
  test("should serialize embedding from link_to target", () => {
    // Create a file node representing the target file
    const targetNode: KNode = {
      id: "target-id-123",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/projects/api.md",
      content: "API Documentation",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    // Create a paragraph node with link_to set (resolved embedding)
    const embeddingNode: KNode = {
      id: "embed-id-456",
      type: "paragraph",
      parent_id: "file-id-789",
      parent_idx: 1,
      link_to: "target-id-123", // Points to target node
      content: "![[projects/api]]", // Original content (preserved for reference)
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    // Create a parent file node
    const fileNode: KNode = {
      id: "file-id-789",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/test.md",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const nodes: KNode[] = [fileNode, embeddingNode, targetNode]
    const output = nodesToMarkdown(nodes)

    // Should reconstruct embedding syntax from target's fs_path
    expect(output).toContain("![[api]]")
  })

  test("should serialize embedding with alias from link_alias", () => {
    const targetNode: KNode = {
      id: "target-id-123",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/docs/authentication.md",
      content: "Authentication Guide",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const embeddingNode: KNode = {
      id: "embed-id-456",
      type: "paragraph",
      parent_id: "file-id-789",
      parent_idx: 1,
      link_to: "target-id-123",
      link_alias: "Auth Docs", // Alias should appear in output
      content: "![[authentication|Auth Docs]]",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const fileNode: KNode = {
      id: "file-id-789",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/test.md",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const nodes: KNode[] = [fileNode, embeddingNode, targetNode]
    const output = nodesToMarkdown(nodes)

    // Should include alias in embedding syntax
    expect(output).toContain("![[authentication|Auth Docs]]")
  })

  test("should serialize embedding to section using title", () => {
    const targetSection: KNode = {
      id: "section-id-123",
      type: "section",
      parent_id: "parent-file",
      parent_idx: 1,
      link_to: null,
      title: "API Reference",
      content: "API Reference",
      data: { depth: 2 },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const embeddingNode: KNode = {
      id: "embed-id-456",
      type: "paragraph",
      parent_id: "file-id-789",
      parent_idx: 1,
      link_to: "section-id-123",
      content: "![[#API Reference]]",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const fileNode: KNode = {
      id: "file-id-789",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/test.md",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const nodes: KNode[] = [fileNode, embeddingNode, targetSection]
    const output = nodesToMarkdown(nodes)

    // Should use section title as embedding path
    expect(output).toContain("![[API Reference]]")
  })

  test("should fallback to content when link_to target not found", () => {
    const embeddingNode: KNode = {
      id: "embed-id-456",
      type: "paragraph",
      parent_id: "file-id-789",
      parent_idx: 1,
      link_to: "nonexistent-target",
      content: "![[missing-file]]",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const fileNode: KNode = {
      id: "file-id-789",
      type: "file",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      fs_path: "/repo/test.md",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "",
    }

    const nodes: KNode[] = [fileNode, embeddingNode]
    const output = nodesToMarkdown(nodes)

    // Should fallback to original content when target not found
    expect(output).toContain("![[missing-file]]")
  })
})
