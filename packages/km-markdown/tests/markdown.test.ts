/**
 * Markdown Parsing Tests
 *
 * Tests for parsing markdown to nodes and serializing nodes back to markdown.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

import {
  parseMarkdown,
  extractFrontmatter,
  parseWikiLinks,
  slugify,
  parseTaskMetadata,
} from "../src/parser.ts";

import { parseMarkdownToNodes, buildNodeTree } from "../src/ast2nodes.ts";

import { nodesToMarkdown } from "../src/nodes2md.ts";

describe("Markdown Parser", () => {
  describe("parseMarkdown", () => {
    test("should parse simple paragraph", () => {
      const ast = parseMarkdown("Hello world");
      expect(ast.type).toBe("root");
      expect(ast.children.length).toBeGreaterThan(0);
    });

    test("should parse headings", () => {
      const ast = parseMarkdown("# Heading 1\n## Heading 2\n### Heading 3");
      const headings = ast.children.filter((n: any) => n.type === "heading");
      expect(headings.length).toBe(3);
    });

    test("should parse task lists", () => {
      const md = `
- [ ] Open task
- [x] Completed task
- [-] Cancelled task
`;
      const ast = parseMarkdown(md);
      const list = ast.children.find((n: any) => n.type === "list");
      expect(list).toBeDefined();
      expect(list.children.length).toBe(3);
    });

    test("should parse code blocks", () => {
      const md = "```javascript\nconst x = 1;\n```";
      const ast = parseMarkdown(md);
      const code = ast.children.find((n: any) => n.type === "code");
      expect(code).toBeDefined();
      expect(code.lang).toBe("javascript");
    });

    test("should parse blockquotes", () => {
      const md = "> This is a quote\n> Second line";
      const ast = parseMarkdown(md);
      const quote = ast.children.find((n: any) => n.type === "blockquote");
      expect(quote).toBeDefined();
    });

    test("should parse tables", () => {
      const md = `
| A | B |
|---|---|
| 1 | 2 |
`;
      const ast = parseMarkdown(md);
      const table = ast.children.find((n: any) => n.type === "table");
      expect(table).toBeDefined();
    });

    test("should parse horizontal rules", () => {
      const md = "Before\n\n---\n\nAfter";
      const ast = parseMarkdown(md);
      const hr = ast.children.find((n: any) => n.type === "thematicBreak");
      expect(hr).toBeDefined();
    });
  });

  describe("extractFrontmatter", () => {
    test("should extract YAML frontmatter as raw string", () => {
      const md = `---
title: Test Document
tags: [a, b, c]
---

# Content`;

      const { frontmatter, body } = extractFrontmatter(md);
      expect(frontmatter).toContain("title: Test Document");
      expect(frontmatter).toContain("tags: [a, b, c]");
      expect(body.trim()).toBe("# Content");
    });

    test("should handle missing frontmatter", () => {
      const md = "# Just content\n\nNo frontmatter here.";
      const { frontmatter, body } = extractFrontmatter(md);
      expect(frontmatter).toBeNull();
      expect(body).toBe(md);
    });

    test("should handle empty frontmatter", () => {
      // The regex requires content between the --- delimiters
      // "---\n\n---\n" gives empty string, "---\n---\n" doesn't match
      const md = "---\n\n---\n# Content";
      const { frontmatter, body } = extractFrontmatter(md);
      expect(frontmatter).toBe("");
    });
  });

  describe("parseTaskMetadata", () => {
    test("should parse due date with emoji", () => {
      const result = parseTaskMetadata("Task with due 📅 2025-03-15");
      expect(result.dueDate).toBe("2025-03-15");
    });

    test("should parse scheduled date with emoji", () => {
      const result = parseTaskMetadata("Task scheduled ⏳ 2025-03-10");
      expect(result.scheduledDate).toBe("2025-03-10");
    });

    test("should parse priority with emoji", () => {
      expect(parseTaskMetadata("High priority ⏫").priority).toBe(1);
      expect(parseTaskMetadata("Medium priority 🔼").priority).toBe(2);
      expect(parseTaskMetadata("Low priority 🔽").priority).toBe(3);
    });
  });

  describe("parseWikiLinks", () => {
    test("should parse simple wikilinks", () => {
      const text = "Check out [[Other Page]] for more info.";
      const links = parseWikiLinks(text);
      expect(links.length).toBe(1);
      expect(links[0].target).toBe("Other Page");
      expect(links[0].alias).toBeUndefined();
    });

    test("should parse aliased wikilinks", () => {
      const text = "See [[Target Page|this link]] here.";
      const links = parseWikiLinks(text);
      expect(links.length).toBe(1);
      expect(links[0].target).toBe("Target Page");
      expect(links[0].alias).toBe("this link");
    });

    test("should parse multiple wikilinks", () => {
      const text = "Links to [[Page A]], [[Page B|B]], and [[Page C]].";
      const links = parseWikiLinks(text);
      expect(links.length).toBe(3);
    });

    test("should handle no wikilinks", () => {
      const text = "No links here, just plain text.";
      const links = parseWikiLinks(text);
      expect(links.length).toBe(0);
    });
  });

  describe("slugify", () => {
    test("should create URL-safe slugs", () => {
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("What's New?")).toBe("whats-new");
      expect(slugify("  Extra   Spaces  ")).toBe("extra-spaces");
    });

    test("should handle special characters", () => {
      expect(slugify("C++ Programming")).toBe("c-programming");
      expect(slugify("100% Complete")).toBe("100-complete");
    });

    test("should handle unicode by removing non-ASCII chars", () => {
      // Current implementation removes non-word chars including unicode
      expect(slugify("Über Cool")).toBe("ber-cool");
    });
  });
});

describe("AST to Nodes", () => {
  describe("parseMarkdownToNodes", () => {
    test("should convert simple markdown to nodes", () => {
      const md = `# Title

This is a paragraph.

- [ ] Task one
- [x] Task two
`;
      const nodes = parseMarkdownToNodes(md, "test-file.md");
      expect(nodes.length).toBeGreaterThan(0);

      // Should have section for heading
      const sections = nodes.filter((n) => n.type === "section");
      expect(sections.length).toBeGreaterThanOrEqual(1);

      // Should have tasks
      const tasks = nodes.filter((n) => n.type === "task");
      expect(tasks.length).toBe(2);
    });

    test("should extract task metadata with emoji format", () => {
      // Parser uses Obsidian Tasks emoji format: 📅 for due, ⏳ for scheduled, ⏫/🔼/🔽 for priority
      const md = `- [ ] Task with due 📅 2025-03-15 ⏫`;
      const nodes = parseMarkdownToNodes(md, "test.md");
      const task = nodes.find((n) => n.type === "task");

      expect(task).toBeDefined();
      expect(task!.due_date).toBe("2025-03-15");
      expect(task!.priority).toBe(1); // ⏫ = high priority = 1
    });

    test("should handle nested structure", () => {
      const md = `# Top Level

## Section A

Content A

## Section B

Content B

### Subsection B1

More content
`;
      const nodes = parseMarkdownToNodes(md, "nested.md");
      const sections = nodes.filter((n) => n.type === "section");
      expect(sections.length).toBeGreaterThanOrEqual(3);
    });

    test("should parse code blocks with language", () => {
      const md = "```typescript\nconst x: number = 1;\n```";
      const nodes = parseMarkdownToNodes(md, "code.md");
      const code = nodes.find((n) => n.type === "code");

      expect(code).toBeDefined();
      // Implementation stores language in data.lang, not data.language
      expect(code!.data.lang).toBe("typescript");
    });

    test("should parse standard task marks", () => {
      // Note: GFM only recognizes [ ] and [x]/[X] as tasks.
      // Custom marks like [/], [-], [?] are parsed as regular list items
      // because the mdast parser sets `checked` to undefined for those.
      const md = `
- [ ] Open task
- [x] Completed task
- [X] Also completed
`;
      const nodes = parseMarkdownToNodes(md, "tasks.md");
      const tasks = nodes.filter((n) => n.type === "task");

      expect(tasks.length).toBe(3);

      const statuses = tasks.map((t) => t.task_status);
      expect(statuses).toContain("open");
      expect(statuses).toContain("done");
    });

    test("should handle custom task marks when supported", () => {
      // Current implementation: custom marks [/], [-], [?] are NOT recognized
      // as tasks by the GFM parser. They become regular list items.
      // This test documents the current behavior.
      const md = `
- [/] In progress
- [-] Cancelled
- [?] Blocked
`;
      const nodes = parseMarkdownToNodes(md, "tasks.md");
      const tasks = nodes.filter((n) => n.type === "task");
      const listItems = nodes.filter((n) => n.type === "ul");

      // GFM doesn't recognize these as tasks
      expect(tasks.length).toBe(0);
      expect(listItems.length).toBe(3);
    });
  });

  describe("buildNodeTree", () => {
    test("should build hierarchical tree from flat nodes", () => {
      const md = `# Project

## Phase 1

- [ ] Task 1.1
- [ ] Task 1.2

## Phase 2

- [ ] Task 2.1
`;
      const flatNodes = parseMarkdownToNodes(md, "project.md");
      const tree = buildNodeTree(flatNodes);

      // buildNodeTree returns a Map<string, Node[]>
      expect(tree instanceof Map).toBe(true);
      expect(tree.size).toBeGreaterThan(0);
    });
  });
});

describe("Nodes to Markdown", () => {
  describe("nodesToMarkdown", () => {
    test("should serialize paragraph node", () => {
      const nodes = [
        {
          id: "1",
          type: "paragraph" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "Hello world!",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("Hello world!");
    });

    test("should serialize task node", () => {
      const nodes = [
        {
          id: "1",
          type: "task" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "Test task",
          task_status: "open" as const,
          task_mark: " " as const,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("- [ ]");
      expect(md).toContain("Test task");
    });

    test("should serialize completed task", () => {
      const nodes = [
        {
          id: "1",
          type: "task" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "Done task",
          task_status: "done" as const,
          task_mark: "x" as const,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("- [x]");
    });

    test("should serialize task with metadata using emoji format", () => {
      const nodes = [
        {
          id: "1",
          type: "task" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "Important task",
          task_status: "open" as const,
          task_mark: " " as const,
          due_date: "2025-03-15",
          priority: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      // Implementation uses Obsidian Tasks emoji format
      expect(md).toContain("📅 2025-03-15");
      expect(md).toContain("⏫"); // priority 1 = high
    });

    test("should serialize section node as heading", () => {
      const nodes = [
        {
          id: "1",
          type: "section" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "My Section",
          md_slug: "my-section",
          data: { depth: 2 },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("## My Section");
    });

    test("should serialize code block", () => {
      const nodes = [
        {
          id: "1",
          type: "code" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: 'console.log("hello");',
          data: { lang: "javascript" }, // Implementation uses 'lang', not 'language'
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("```javascript");
      expect(md).toContain('console.log("hello");');
      expect(md).toContain("```");
    });

    test("should serialize quote block", () => {
      const nodes = [
        {
          id: "1",
          type: "quote" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "Famous quote here",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("> Famous quote here");
    });

    test("should serialize horizontal rule", () => {
      const nodes = [
        {
          id: "1",
          type: "hr" as const,
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
      ];

      const md = nodesToMarkdown(nodes);
      expect(md).toContain("---");
    });
  });

  describe("Round-trip conversion", () => {
    test("should preserve content through parse-serialize cycle", () => {
      const originalMd = `# Test Document

This is a paragraph.

- [ ] Task one
- [x] Task two

## Code Example

\`\`\`javascript
const x = 1;
\`\`\`

> A blockquote
`;

      const nodes = parseMarkdownToNodes(originalMd, "test.md");
      const regeneratedMd = nodesToMarkdown(nodes);

      // Key content should be preserved
      expect(regeneratedMd).toContain("Test Document");
      expect(regeneratedMd).toContain("This is a paragraph");
      expect(regeneratedMd).toContain("Task one");
      expect(regeneratedMd).toContain("Task two");
      expect(regeneratedMd).toContain("const x = 1");
      expect(regeneratedMd).toContain("blockquote");
    });
  });
});

describe("Fixture Files", () => {
  const fixturesDir = join(import.meta.dir, "fixtures");

  test("should parse sample-project.md", () => {
    const content = readFileSync(
      join(fixturesDir, "sample-project.md"),
      "utf-8",
    );
    const nodes = parseMarkdownToNodes(content, "sample-project.md");

    // Should have multiple sections
    const sections = nodes.filter((n) => n.type === "section");
    expect(sections.length).toBeGreaterThan(3);

    // Should have multiple tasks (standard [ ] and [x] marks)
    const tasks = nodes.filter((n) => n.type === "task");
    expect(tasks.length).toBeGreaterThanOrEqual(8);

    // Should have open and done task statuses (GFM only supports these)
    const statuses = new Set(tasks.map((t) => t.task_status));
    expect(statuses.has("open")).toBe(true);
    expect(statuses.has("done")).toBe(true);

    // Should have code blocks
    const codeBlocks = nodes.filter((n) => n.type === "code");
    expect(codeBlocks.length).toBeGreaterThan(0);

    // Should have quotes
    const quotes = nodes.filter((n) => n.type === "quote");
    expect(quotes.length).toBeGreaterThan(0);

    // Should have tables
    const tables = nodes.filter((n) => n.type === "table");
    expect(tables.length).toBeGreaterThan(0);
  });

  test("should parse inbox.md with frontmatter", () => {
    const content = readFileSync(join(fixturesDir, "inbox.md"), "utf-8");
    const { frontmatter } = extractFrontmatter(content);

    // Frontmatter is raw YAML string, need to parse it
    expect(frontmatter).not.toBeNull();
    const parsed = parseYaml(frontmatter!) as Record<string, unknown>;
    expect(parsed.title).toBe("Inbox");
    expect(parsed.type).toBe("inbox");

    const nodes = parseMarkdownToNodes(content, "inbox.md");
    const tasks = nodes.filter((n) => n.type === "task");
    expect(tasks.length).toBe(5);
  });

  test("should parse daily-note.md with complex structure", () => {
    const content = readFileSync(join(fixturesDir, "daily-note.md"), "utf-8");
    const { frontmatter } = extractFrontmatter(content);

    // Frontmatter is raw YAML string, need to parse it
    expect(frontmatter).not.toBeNull();
    const parsed = parseYaml(frontmatter!) as Record<string, unknown>;
    expect(parsed.title).toBe("2025-01-08");
    expect(parsed.type).toBe("daily");
    expect(parsed.tags).toContain("journal");

    const nodes = parseMarkdownToNodes(content, "daily-note.md");

    // Should have nested sections
    const sections = nodes.filter((n) => n.type === "section");
    expect(sections.length).toBeGreaterThan(3);

    // Should have tasks (standard marks only: [ ] and [x])
    const tasks = nodes.filter((n) => n.type === "task");
    expect(tasks.length).toBeGreaterThanOrEqual(8);

    // Check for open and completed tasks
    const open = tasks.filter((t) => t.task_status === "open");
    const completed = tasks.filter((t) => t.task_status === "done");

    expect(open.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);

    // Should have code block
    const codeBlocks = nodes.filter((n) => n.type === "code");
    expect(codeBlocks.length).toBeGreaterThan(0);

    // Should have quote
    const quotes = nodes.filter((n) => n.type === "quote");
    expect(quotes.length).toBeGreaterThan(0);
  });

  test("should parse comprehensive.md with all content types", () => {
    const content = readFileSync(
      join(fixturesDir, "comprehensive.md"),
      "utf-8",
    );
    const { frontmatter, body } = extractFrontmatter(content);

    // Has frontmatter with multiple fields
    expect(frontmatter).not.toBeNull();
    const parsed = parseYaml(frontmatter!) as Record<string, unknown>;
    expect(parsed.title).toBe("Comprehensive Test Fixture");
    expect(parsed.type).toBe("fixture");

    const nodes = parseMarkdownToNodes(content, "comprehensive.md");

    // Task statuses (GFM only supports open and done)
    const tasks = nodes.filter((n) => n.type === "task");
    const statuses = new Set(tasks.map((t) => t.task_status));
    expect(statuses.has("open")).toBe(true);
    expect(statuses.has("done")).toBe(true);
    // Note: in_progress, cancelled, blocked require custom parser extensions

    // Code blocks with different languages
    const codeBlocks = nodes.filter((n) => n.type === "code");
    expect(codeBlocks.length).toBeGreaterThanOrEqual(3);
    const langs = codeBlocks.map((c) => c.data?.lang).filter(Boolean);
    expect(langs).toContain("javascript");
    expect(langs).toContain("python");

    // Tables, quotes, hr, sections all present
    expect(nodes.filter((n) => n.type === "table").length).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.type === "quote").length).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.type === "hr").length).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.type === "section").length).toBeGreaterThan(5);
  });
});
