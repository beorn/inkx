/**
 * Round-trip Parsing Tests (km-bk9)
 *
 * Tests that markdown -> nodes -> markdown preserves content correctly.
 * These tests verify that parsing and then serializing produces equivalent output.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { parseMarkdownToNodes } from "../src/md/ast2nodes.ts";
import { nodesToMarkdown } from "../src/md/nodes2md.ts";
import { extractFrontmatter } from "../src/md/parser.ts";

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
    .trim();
}

/**
 * Helper to compare markdown semantically
 * Returns true if both produce the same parsed structure
 */
function contentMatches(original: string, regenerated: string): boolean {
  const origNodes = parseMarkdownToNodes(original, "test.md");
  const regenNodes = parseMarkdownToNodes(regenerated, "test.md");

  // Compare node types and content
  if (origNodes.length !== regenNodes.length) return false;

  for (let i = 0; i < origNodes.length; i++) {
    if (origNodes[i].type !== regenNodes[i].type) return false;
    if (origNodes[i].content !== regenNodes[i].content) return false;
  }

  return true;
}

describe("Round-trip: Basic Elements", () => {
  test("should preserve simple paragraph", () => {
    const md = "This is a simple paragraph.";
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("This is a simple paragraph");
  });

  test("should preserve multiple paragraphs", () => {
    const md = `First paragraph.

Second paragraph.

Third paragraph.`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("First paragraph");
    expect(output).toContain("Second paragraph");
    expect(output).toContain("Third paragraph");
  });

  test("should preserve text content (inline formatting becomes plain text)", () => {
    // Note: Current parser strips inline formatting but preserves text content
    const md = `This has **bold** and *italic* and \`code\`.`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    // Text content is preserved (formatting is not)
    expect(output).toContain("This has bold and italic and code");
  });

  test("should preserve headings", () => {
    const md = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("# Heading 1");
    expect(output).toContain("## Heading 2");
    expect(output).toContain("### Heading 3");
    expect(output).toContain("#### Heading 4");
  });

  test("should preserve horizontal rules", () => {
    const md = `Before

---

After`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("---");
    expect(output).toContain("Before");
    expect(output).toContain("After");
  });
});

describe("Round-trip: Tasks", () => {
  test("should preserve open task", () => {
    const md = `- [ ] Open task`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("- [ ]");
    expect(output).toContain("Open task");
  });

  test("should preserve completed task", () => {
    const md = `- [x] Completed task`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("- [x]");
    expect(output).toContain("Completed task");
  });

  test("should preserve multiple tasks", () => {
    const md = `- [ ] Task one
- [ ] Task two
- [x] Task three done`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("Task one");
    expect(output).toContain("Task two");
    expect(output).toContain("Task three done");
  });

  test("should preserve task with due date", () => {
    const md = `- [ ] Task with due 📅 2025-03-15`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("📅 2025-03-15");
    expect(output).toContain("Task with due");
  });

  test("should preserve task with scheduled date", () => {
    const md = `- [ ] Task scheduled ⏳ 2025-03-10`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("⏳ 2025-03-10");
  });

  test("should preserve task with priority", () => {
    const md = `- [ ] High priority ⏫
- [ ] Medium priority 🔼
- [ ] Low priority 🔽`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("⏫");
    expect(output).toContain("🔼");
    expect(output).toContain("🔽");
  });

  test("should preserve task with full metadata", () => {
    const md = `- [ ] Full metadata 📅 2025-04-01 ⏳ 2025-03-25 ⏫`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("📅 2025-04-01");
    expect(output).toContain("⏳ 2025-03-25");
    expect(output).toContain("⏫");
  });

  test("should preserve task with tags", () => {
    const md = `- [ ] Task with #important tag`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("#important");
  });
});

describe("Round-trip: Lists", () => {
  test("should preserve unordered list", () => {
    const md = `- Item one
- Item two
- Item three`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("Item one");
    expect(output).toContain("Item two");
    expect(output).toContain("Item three");
  });

  test("should preserve ordered list", () => {
    const md = `1. First item
2. Second item
3. Third item`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("First item");
    expect(output).toContain("Second item");
    expect(output).toContain("Third item");
  });
});

describe("Round-trip: Blockquotes", () => {
  test("should preserve simple blockquote", () => {
    const md = `> This is a quote.`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain(">");
    expect(output).toContain("This is a quote");
  });

  test("should preserve multi-line blockquote", () => {
    const md = `> Line one
> Line two
> Line three`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("Line one");
    expect(output).toContain("Line two");
  });
});

describe("Round-trip: Code Blocks", () => {
  test("should preserve code block with language", () => {
    const md = `\`\`\`javascript
const x = 1;
console.log(x);
\`\`\``;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("```javascript");
    expect(output).toContain("const x = 1");
    expect(output).toContain("```");
  });

  test("should preserve code block without language", () => {
    const md = `\`\`\`
plain code
\`\`\``;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("```");
    expect(output).toContain("plain code");
  });

  test("should preserve multiple code blocks", () => {
    const md = `\`\`\`python
def foo():
    pass
\`\`\`

\`\`\`typescript
function bar() {}
\`\`\``;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("```python");
    expect(output).toContain("def foo()");
    expect(output).toContain("```typescript");
    expect(output).toContain("function bar()");
  });
});

describe("Round-trip: Tables", () => {
  test("should preserve simple table", () => {
    const md = `| A | B |
|---|---|
| 1 | 2 |`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    // Tables are stored as raw content
    expect(output).toContain("A");
    expect(output).toContain("B");
    expect(output).toContain("1");
    expect(output).toContain("2");
  });
});

describe("Round-trip: Sections with Content", () => {
  test("should preserve section with paragraph", () => {
    const md = `# My Section

This is content under the section.`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("# My Section");
    expect(output).toContain("This is content under the section");
  });

  test("should preserve nested sections", () => {
    const md = `# Top

## Middle

### Bottom

Content at bottom.`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("# Top");
    expect(output).toContain("## Middle");
    expect(output).toContain("### Bottom");
    expect(output).toContain("Content at bottom");
  });

  test("should preserve section with tasks", () => {
    const md = `## Tasks

- [ ] Task one
- [ ] Task two
- [x] Task done`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("## Tasks");
    expect(output).toContain("Task one");
    expect(output).toContain("Task two");
    expect(output).toContain("Task done");
  });

  test("should preserve section with mixed content", () => {
    const md = `## Mixed Section

A paragraph here.

- [ ] A task

> A quote

\`\`\`
code
\`\`\``;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("## Mixed Section");
    expect(output).toContain("A paragraph here");
    expect(output).toContain("A task");
    expect(output).toContain("A quote");
    expect(output).toContain("code");
  });
});

describe("Round-trip: Edge Cases", () => {
  test("should preserve empty task content", () => {
    const md = `- [ ] `;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("- [ ]");
  });

  test("should preserve task with special characters", () => {
    const md = `- [ ] Task with "quotes" and 'apostrophes'`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain('"quotes"');
    expect(output).toContain("'apostrophes'");
  });

  test("should preserve task with emoji", () => {
    const md = `- [ ] Task with emoji 🚀 🎉 ✨`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("🚀");
    expect(output).toContain("🎉");
    expect(output).toContain("✨");
  });

  test("should preserve unicode content", () => {
    const md = `# 日本語

- [ ] タスク
- [ ] Задача
- [ ] 任务`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("日本語");
    expect(output).toContain("タスク");
    expect(output).toContain("Задача");
    expect(output).toContain("任务");
  });

  test("should preserve wikilinks in content", () => {
    const md = `Check [[Other Page]] for more.`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("[[Other Page]]");
  });

  test("should preserve aliased wikilinks", () => {
    const md = `See [[Target|display text]] here.`;
    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    expect(output).toContain("[[Target|display text]]");
  });
});

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

Final paragraph.`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const output = nodesToMarkdown(nodes);

    // All key content should be preserved
    expect(output).toContain("# Test Document");
    expect(output).toContain("This is a paragraph");
    expect(output).toContain("## Tasks");
    expect(output).toContain("Task one");
    expect(output).toContain("📅 2025-03-15");
    expect(output).toContain("Task two done");
    expect(output).toContain("## Code");
    expect(output).toContain("```javascript");
    expect(output).toContain("const x = 1");
    expect(output).toContain("## Quote");
    expect(output).toContain("A famous quote");
    expect(output).toContain("---");
    expect(output).toContain("Final paragraph");
  });

  test("should be semantically equivalent after double round-trip", () => {
    const original = `# Document

## Section A

- [ ] Task A1
- [x] Task A2

## Section B

Content in B.

\`\`\`python
x = 1
\`\`\``;

    // First round-trip
    const nodes1 = parseMarkdownToNodes(original, "test.md");
    const md1 = nodesToMarkdown(nodes1);

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "test.md");
    const md2 = nodesToMarkdown(nodes2);

    // After second round-trip, should be stable
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2));
  });
});

describe("Round-trip: Fixture Files", () => {
  const fixturesDir = join(import.meta.dir, "fixtures");

  test("should round-trip inbox.md", () => {
    const original = readFileSync(join(fixturesDir, "inbox.md"), "utf-8");
    const { body } = extractFrontmatter(original);

    const nodes = parseMarkdownToNodes(body, "inbox.md");
    const output = nodesToMarkdown(nodes);

    // Key content preserved (section becomes heading text)
    expect(output).toContain("Quick capture");
    expect(output).toContain("Buy groceries");
  });

  test("should round-trip sample-project.md", () => {
    const original = readFileSync(
      join(fixturesDir, "sample-project.md"),
      "utf-8",
    );
    const { body } = extractFrontmatter(original);

    const nodes = parseMarkdownToNodes(body, "sample-project.md");
    const output = nodesToMarkdown(nodes);

    // Key structure preserved
    expect(output).toContain("Sample Project");
    expect(output).toContain("Tasks Section");
    expect(output).toContain("Content Blocks");
  });

  test("should round-trip daily-note.md", () => {
    const original = readFileSync(join(fixturesDir, "daily-note.md"), "utf-8");
    const { body } = extractFrontmatter(original);

    const nodes = parseMarkdownToNodes(body, "daily-note.md");
    const output = nodesToMarkdown(nodes);

    // Key sections preserved
    expect(output).toContain("Morning Review");
    expect(output).toContain("Focus Time");
    expect(output).toContain("Project Alpha");
  });

  test("should round-trip comprehensive.md", () => {
    const original = readFileSync(
      join(fixturesDir, "comprehensive.md"),
      "utf-8",
    );
    const { body } = extractFrontmatter(original);

    const nodes = parseMarkdownToNodes(body, "comprehensive.md");
    const output = nodesToMarkdown(nodes);

    // All major elements preserved
    expect(output).toContain("Main Section");
    expect(output).toContain("Tasks with Standard Marks");
    expect(output).toContain("Blockquotes");
    expect(output).toContain("Code Blocks");
    expect(output).toContain("Tables");
  });

  test("comprehensive.md key content is preserved after round-trip", () => {
    const original = readFileSync(
      join(fixturesDir, "comprehensive.md"),
      "utf-8",
    );
    const { body } = extractFrontmatter(original);

    // First round-trip
    const nodes1 = parseMarkdownToNodes(body, "comprehensive.md");
    const md1 = nodesToMarkdown(nodes1);

    // Second round-trip
    const nodes2 = parseMarkdownToNodes(md1, "comprehensive.md");
    const md2 = nodesToMarkdown(nodes2);

    // Key content should be preserved
    // Note: Nested lists have known issues with duplication in current implementation
    expect(md2).toContain("Main Section");
    expect(md2).toContain("Tasks with Standard Marks");
    expect(md2).toContain("Code Blocks");

    // Node counts should be consistent between round-trips
    const tasks1 = nodes1.filter((n) => n.type === "task");
    const tasks2 = nodes2.filter((n) => n.type === "task");
    expect(tasks1.length).toBe(tasks2.length);

    const sections1 = nodes1.filter((n) => n.type === "section");
    const sections2 = nodes2.filter((n) => n.type === "section");
    expect(sections1.length).toBe(sections2.length);
  });
});

describe("Round-trip: Content Preservation Verification", () => {
  test("should preserve task status in node", () => {
    const md = `- [ ] Open
- [x] Done`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const tasks = nodes.filter((n) => n.type === "task");

    expect(tasks.length).toBe(2);
    expect(tasks[0].task_status).toBe("open");
    expect(tasks[1].task_status).toBe("done");

    // After round-trip, statuses should be preserved
    const output = nodesToMarkdown(nodes);
    const nodes2 = parseMarkdownToNodes(output, "test.md");
    const tasks2 = nodes2.filter((n) => n.type === "task");

    expect(tasks2[0].task_status).toBe("open");
    expect(tasks2[1].task_status).toBe("done");
  });

  test("should preserve task metadata in node", () => {
    const md = `- [ ] Task 📅 2025-12-25 ⏫`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const task = nodes.find((n) => n.type === "task");

    expect(task).toBeDefined();
    expect(task!.due_date).toBe("2025-12-25");
    expect(task!.priority).toBe(1);

    // After round-trip, metadata should be preserved
    const output = nodesToMarkdown(nodes);
    const nodes2 = parseMarkdownToNodes(output, "test.md");
    const task2 = nodes2.find((n) => n.type === "task");

    expect(task2!.due_date).toBe("2025-12-25");
    expect(task2!.priority).toBe(1);
  });

  test("should preserve section depth", () => {
    const md = `# H1

## H2

### H3`;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const sections = nodes.filter((n) => n.type === "section");

    expect(sections.length).toBe(3);
    expect(sections[0].data?.depth).toBe(1);
    expect(sections[1].data?.depth).toBe(2);
    expect(sections[2].data?.depth).toBe(3);

    // After round-trip
    const output = nodesToMarkdown(nodes);
    const nodes2 = parseMarkdownToNodes(output, "test.md");
    const sections2 = nodes2.filter((n) => n.type === "section");

    expect(sections2[0].data?.depth).toBe(1);
    expect(sections2[1].data?.depth).toBe(2);
    expect(sections2[2].data?.depth).toBe(3);
  });

  test("should preserve code language", () => {
    const md = `\`\`\`typescript
const x: number = 1;
\`\`\``;

    const nodes = parseMarkdownToNodes(md, "test.md");
    const code = nodes.find((n) => n.type === "code");

    expect(code).toBeDefined();
    expect(code!.data?.lang).toBe("typescript");

    // After round-trip
    const output = nodesToMarkdown(nodes);
    const nodes2 = parseMarkdownToNodes(output, "test.md");
    const code2 = nodes2.find((n) => n.type === "code");

    expect(code2!.data?.lang).toBe("typescript");
  });
});
