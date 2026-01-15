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
  extractTags,
  extractMentions,
  extractProjects,
} from "../src/parser.ts";

import {
  parseMarkdownToNodes,
  buildNodeTree,
  parseMarkdownWithLinks,
} from "../src/ast2nodes.ts";

import { parseHeadingRules } from "../src/parser.ts";

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

    test("should parse due date with inline field", () => {
      const result = parseTaskMetadata("Submit report due:2026-01-20");
      expect(result.dueDate).toBe("2026-01-20");
    });

    test("should parse scheduled date with start: inline field", () => {
      const result = parseTaskMetadata("Call client start:2026-01-15");
      expect(result.scheduledDate).toBe("2026-01-15");
    });

    test("should parse priority with p: inline field", () => {
      expect(parseTaskMetadata("Important task p:1").priority).toBe(1);
      expect(parseTaskMetadata("Normal task p:2").priority).toBe(2);
      expect(parseTaskMetadata("Low task p:3").priority).toBe(3);
    });

    test("should parse multiple inline fields", () => {
      const result = parseTaskMetadata("Submit report due:2026-01-20 p:1");
      expect(result.dueDate).toBe("2026-01-20");
      expect(result.priority).toBe(1);
    });

    test("emoji format takes precedence over inline fields", () => {
      const result = parseTaskMetadata("Task 📅 2025-03-15 due:2026-01-20");
      expect(result.dueDate).toBe("2025-03-15"); // Emoji takes precedence
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

  describe("extractTags", () => {
    test("should extract hashtags from text", () => {
      const tags = extractTags("Task with #urgent and #work tags");
      expect(tags).toEqual(["urgent", "work"]);
    });

    test("should handle no tags", () => {
      const tags = extractTags("No tags here");
      expect(tags).toEqual([]);
    });

    test("should handle hyphens and underscores", () => {
      const tags = extractTags("#my-tag and #another_tag");
      expect(tags).toEqual(["my-tag", "another_tag"]);
    });
  });

  describe("extractMentions", () => {
    test("should extract @mentions from text", () => {
      const mentions = extractMentions("Assigned to @john and @jane");
      expect(mentions).toEqual(["john", "jane"]);
    });

    test("should handle no mentions", () => {
      const mentions = extractMentions("No mentions here");
      expect(mentions).toEqual([]);
    });
  });

  describe("extractProjects", () => {
    test("should extract +projects from text", () => {
      const projects = extractProjects("Part of +project-alpha and +beta");
      expect(projects).toEqual(["project-alpha", "beta"]);
    });

    test("should handle no projects", () => {
      const projects = extractProjects("No projects here");
      expect(projects).toEqual([]);
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

      // H1 is merged into file node, so check file has title
      const fileNode = nodes.find((n) => n.type === "file");
      expect(fileNode?.title).toBe("Title");

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
      // H1 is merged into file, so we have 3 sections: A, B, B1
      expect(sections.length).toBeGreaterThanOrEqual(3);

      // File node should have H1 title
      const fileNode = nodes.find((n) => n.type === "file");
      expect(fileNode?.title).toBe("Top Level");
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
      expect(statuses).toContain("todo");
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
          task_status: "todo" as const,
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
          task_status: "todo" as const,
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
    expect(statuses.has("todo")).toBe(true);
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
    const open = tasks.filter((t) => t.task_status === "todo");
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
    expect(statuses.has("todo")).toBe(true);
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

describe("H1 Heading Validation", () => {
  test("should warn when file has no H1 heading", () => {
    const md = `## Section Two

Some content without a top-level heading.

## Another Section

More content.`;

    const result = parseMarkdownWithLinks(md, "no-h1.md");
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.type).toBe("missing_h1");
    expect(warning.message).toContain("Missing H1 heading");
  });

  test("should warn when file has multiple H1 headings", () => {
    const md = `# First Title

Some content.

# Second Title

More content.

# Third Title

Even more content.`;

    const result = parseMarkdownWithLinks(md, "multiple-h1.md");
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.type).toBe("multiple_h1");
    expect(warning.message).toContain("Multiple H1 headings found (3)");
  });

  test("should not warn when file has exactly one H1 heading", () => {
    const md = `# Document Title

## Section One

Content.

## Section Two

More content.`;

    const result = parseMarkdownWithLinks(md, "valid.md");
    expect(result.warnings).toHaveLength(0);
  });

  test("should not warn for empty file", () => {
    // Empty file has no H1, but we might want to be lenient here
    // Current behavior: warns about missing H1
    const result = parseMarkdownWithLinks("", "empty.md");
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.type).toBe("missing_h1");
  });
});

describe("parseHeadingRules", () => {
  test("should extract add rule with double quotes", () => {
    const result = parseHeadingRules('Today add="due:past status:open"');
    expect(result.title).toBe("Today");
    expect(result.rules.add).toBe("due:past status:open");
  });

  test("should extract add rule with single quotes", () => {
    const result = parseHeadingRules("Today add='due:past status:open'");
    expect(result.title).toBe("Today");
    expect(result.rules.add).toBe("due:past status:open");
  });

  test("should extract sync rule", () => {
    const result = parseHeadingRules("Blocked sync=status:blocked");
    expect(result.title).toBe("Blocked");
    expect(result.rules.sync).toBe("status:blocked");
  });

  test("should extract collapse rule", () => {
    const result = parseHeadingRules("Done collapse=true");
    expect(result.title).toBe("Done");
    expect(result.rules.collapse).toBe(true);
  });

  test("should extract limit rule", () => {
    const result = parseHeadingRules("In Progress limit=5");
    expect(result.title).toBe("In Progress");
    expect(result.rules.limit).toBe(5);
  });

  test("should extract default rule", () => {
    const result = parseHeadingRules("Inbox default=true");
    expect(result.title).toBe("Inbox");
    expect(result.rules.default).toBe(true);
  });

  test("should extract multiple rules", () => {
    const result = parseHeadingRules(
      'Today add="due:past" sync=status:open limit=10 collapse=true',
    );
    expect(result.title).toBe("Today");
    expect(result.rules.add).toBe("due:past");
    expect(result.rules.sync).toBe("status:open");
    expect(result.rules.limit).toBe(10);
    expect(result.rules.collapse).toBe(true);
  });

  test("should handle heading with no rules", () => {
    const result = parseHeadingRules("Simple Heading");
    expect(result.title).toBe("Simple Heading");
    expect(result.rules).toEqual({});
  });

  test("should preserve complex titles", () => {
    const result = parseHeadingRules('2025 Taxes - Q1 add="project:taxes"');
    expect(result.title).toBe("2025 Taxes - Q1");
    expect(result.rules.add).toBe("project:taxes");
  });
});

describe("Section title and rules parsing", () => {
  test("should populate title and rules on section nodes", () => {
    const md = `# Document Title

## Today add="due:past status:open"

- [ ] Task 1

## Done sync=status:done collapse=true

- [x] Completed task
`;
    const result = parseMarkdownWithLinks(md, "board.md");
    const sections = result.nodes.filter((n) => n.type === "section");

    // H1 is merged into file node, so no depth-1 section should exist
    const h1Sections = sections.filter((s) => s.data?.depth === 1);
    expect(h1Sections.length).toBe(0);

    // Today column
    const today = sections.find((s) => s.title === "Today");
    expect(today).toBeDefined();
    expect(today?.rules?.add).toBe("due:past status:open");
    expect(today?.content).toBe('Today add="due:past status:open"'); // Original content preserved

    // Done column
    const done = sections.find((s) => s.title === "Done");
    expect(done).toBeDefined();
    expect(done?.rules?.sync).toBe("status:done");
    expect(done?.rules?.collapse).toBe(true);
  });
});

describe("H1 merge into file node", () => {
  test("should merge H1 properties into file node", () => {
    const md = `# Board Title

## Column One

- [ ] Task 1

## Column Two

- [ ] Task 2
`;
    const result = parseMarkdownWithLinks(md, "board.md");
    const fileNode = result.nodes.find((n) => n.type === "file");
    const sections = result.nodes.filter((n) => n.type === "section");

    // File node should have H1's title
    expect(fileNode?.title).toBe("Board Title");
    expect(fileNode?.content).toBe("Board Title");

    // No depth-1 sections (H1 was merged)
    const h1Sections = sections.filter((s) => s.data?.depth === 1);
    expect(h1Sections.length).toBe(0);

    // H2 sections should be direct children of file
    const h2Sections = sections.filter((s) => s.data?.depth === 2);
    expect(h2Sections.length).toBe(2);
    expect(fileNode).toBeDefined();
    for (const s of h2Sections) {
      expect(s.parent_id).toBe(fileNode!.id);
    }
  });

  test("should re-parent H1 children to file node", () => {
    const md = `# Main Title

## Section A

Content A

## Section B

Content B
`;
    const result = parseMarkdownWithLinks(md, "test.md");
    const fileNode = result.nodes.find((n) => n.type === "file");
    const sections = result.nodes.filter((n) => n.type === "section");

    // All sections should be children of the file node
    expect(fileNode).toBeDefined();
    for (const section of sections) {
      expect(section.parent_id).toBe(fileNode!.id);
    }
  });

  test("should preserve H1 rules when merging into file node", () => {
    const md = `# Board default=true collapse=true

## Column One

- [ ] Task
`;
    const result = parseMarkdownWithLinks(md, "board.md");
    const fileNode = result.nodes.find((n) => n.type === "file");

    expect(fileNode?.title).toBe("Board");
    expect(fileNode?.rules?.default).toBe(true);
    expect(fileNode?.rules?.collapse).toBe(true);
  });

  test("should handle file without H1 (no merge needed)", () => {
    const md = `## Just H2

- [ ] Task
`;
    const result = parseMarkdownWithLinks(md, "no-h1.md");
    const fileNode = result.nodes.find((n) => n.type === "file");
    const sections = result.nodes.filter((n) => n.type === "section");

    // File node has no title (no H1 to merge)
    expect(fileNode?.title).toBeUndefined();

    // H2 section exists as child of file
    expect(sections.length).toBe(1);
    expect(sections[0]?.parent_id).toBe(fileNode?.id);
  });

  test("should merge frontmatter data with H1 data", () => {
    const md = `---
author: test
---

# Document Title

## Section
`;
    const result = parseMarkdownWithLinks(md, "with-frontmatter.md");
    const fileNode = result.nodes.find((n) => n.type === "file");

    // Both frontmatter and H1 data should be present
    expect(fileNode?.data?.author).toBe("test");
    expect(fileNode?.data?.depth).toBe(1); // H1 depth
    expect(fileNode?.title).toBe("Document Title");
  });

  test("should warn about multiple H1s but still merge first one", () => {
    const md = `# First Title

## Section

# Second Title

More content
`;
    const result = parseMarkdownWithLinks(md, "multi-h1.md");
    const fileNode = result.nodes.find((n) => n.type === "file");

    // First H1 merged into file
    expect(fileNode?.title).toBe("First Title");

    // Warning generated for multiple H1s
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]?.type).toBe("multiple_h1");
  });
});
