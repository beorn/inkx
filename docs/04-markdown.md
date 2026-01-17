# Markdown

Parsing markdown files into km nodes.

---

## Overview

km parses markdown files into an AST, then converts AST nodes into km nodes. This enables:

- Full-text search across content
- Task extraction from any markdown file
- Section-level linking and references
- Bidirectional sync (nodes ↔ markdown)

---

## Markdown AST

Based on [mdast](https://github.com/syntax-tree/mdast) with extensions.

### Block Nodes

````typescript
type BlockNode =
  | Heading // # ## ### etc
  | Paragraph // Plain text block
  | Blockquote // > quoted text
  | Code // ```code``` or indented
  | List // ul, ol, or task list
  | ListItem // - item, 1. item, - [ ] task
  | Table // | col | col |
  | ThematicBreak // ---
  | Html; // Raw HTML block

interface Heading {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: PhrasingContent[];
}

interface List {
  type: "list";
  ordered: boolean;
  start?: number; // For ordered lists
  spread: boolean; // Loose vs tight
  children: ListItem[];
}

interface ListItem {
  type: "listItem";
  checked?: boolean | null; // null = not a task, true/false = task
  spread: boolean;
  children: BlockContent[];
}
````

### Phrasing (Inline) Nodes

```typescript
type PhrasingContent =
  | Text // Plain text
  | Emphasis // *italic*
  | Strong // **bold**
  | Delete // ~~strikethrough~~
  | InlineCode // `code`
  | Link // [text](url)
  | Image // ![alt](url)
  | LinkReference // [text][ref]
  | FootnoteReference
  | Html // Inline HTML
  | Break; // Hard line break
```

### Extensions

```typescript
// Wikilinks (Obsidian)
interface WikiLink {
  type: "wikiLink";
  value: string; // [[Page Name]]
  alias?: string; // [[Page Name|display text]]
}

// Task extensions
interface TaskItem extends ListItem {
  checked: boolean;
  taskMark: " " | "x" | "X" | "/" | "-" | "!";
  // Extended marks:
  // ' ' = todo
  // 'x'/'X' = done
  // '/' = wip (work in progress)
  // '!' = blocked
  // '-' = dropped
}

// Frontmatter
interface Yaml {
  type: "yaml";
  value: string; // Raw YAML content
}

// Tags
interface Tag {
  type: "tag";
  value: string; // #tag-name
}
```

---

## AST to Nodes

### Conversion Rules

| AST Type      | km Node Type   | Notes                           |
| ------------- | -------------- | ------------------------------- |
| root          | file           | Top-level document              |
| heading       | section        | Creates hierarchy by depth      |
| paragraph     | paragraph      | Content block                   |
| blockquote    | quote          | Nested content                  |
| code          | code           | With language metadata          |
| list          | (container)    | Children become list_item nodes |
| listItem      | ul / ol / task | Based on list type and checked  |
| thematicBreak | hr             | Separator                       |
| table         | table          | With row/cell children          |
| html          | html           | Preserved raw                   |

### Section Hierarchy

Headings create implicit sections. Content between headings belongs to the preceding heading.

```markdown
# Title → section (depth 1)

Intro paragraph. → paragraph (child of Title section)

## Section A → section (depth 2, child of Title)

Content A. → paragraph (child of Section A)

## Section B → section (depth 2, sibling of Section A)

Content B. → paragraph (child of Section B)
```

---

## Nodes to Markdown

### Serialization Rules

````typescript
function serializeNode(node: Node): string {
  switch (node.type) {
    case "section":
      const prefix = "#".repeat(node.data.depth || 1);
      return `${prefix} ${node.content}\n\n`;
    case "paragraph":
      return node.content + "\n\n";
    case "quote":
      return (
        node.content
          .split("\n")
          .map((l) => "> " + l)
          .join("\n") + "\n\n"
      );
    case "code":
      return "```" + (node.data.lang || "") + "\n" + node.content + "\n```\n\n";
    case "ul":
      return "- " + node.content + "\n";
    case "ol":
      return "1. " + node.content + "\n";
    case "task":
      return `- [${node.task_mark || " "}] ${node.content}\n`;
    case "hr":
      return "---\n\n";
    default:
      return node.content + "\n";
  }
}
````

---

## Task Parsing

### Standard Tasks

```markdown
- [ ] Open task
- [x] Completed task
```

### Extended Task Marks

```markdown
- [/] In progress
- [-] Cancelled
- [!] Blocked
```

### Task Metadata (Obsidian Tasks compatible)

```markdown
- [ ] Task with due date 📅 2024-01-15
- [ ] Task with scheduled date ⏳ 2024-01-10
- [ ] Task with priority ⏫
- [ ] Task with recurrence 🔁 every week
```

Parsed into node data:

```typescript
{
  type: 'task',
  content: 'Task with due date',
  task_status: 'todo',
  due_date: '2024-01-15',
  data: {
    emoji_markers: ['📅 2024-01-15']
  }
}
```

---

## Wikilinks

### Parsing

```markdown
[[Page Name]]
[[Page Name|Display Text]]
[[Page Name#Section]]
[[Page Name#^block-id]]
```

```typescript
interface WikiLink {
  target: string; // "Page Name"
  section?: string; // "Section"
  blockId?: string; // "block-id"
  alias?: string; // "Display Text"
}
```

### Resolution

```typescript
function resolveWikiLink(link: WikiLink, currentFile: Node): Node | null {
  // 1. Exact path match
  let target = findNodeByPath(link.target);

  // 2. Filename match (Obsidian-style)
  if (!target) {
    target = findNodeByFilename(link.target);
  }

  // 3. With section/block
  if (target && link.section) {
    target = findChildBySlug(target, link.section);
  }

  return target;
}
```

---

## Frontmatter

YAML frontmatter maps to node.data:

```markdown
---
id: 01H5X...
tags: [project, active]
due: 2024-01-15
priority: 1
---
```

```typescript
node.data = {
  id: "01H5X...",
  tags: ["project", "active"],
  due: "2024-01-15",
  priority: 1,
};
```

### Reserved Fields

| Field    | Maps To          |
| -------- | ---------------- |
| id       | node.id          |
| type     | node.type        |
| status   | node.task_status |
| due      | node.due_date    |
| priority | node.priority    |
| assigned | node.assigned_to |
| tags     | node.data.tags   |

---

## Position Tracking

Nodes track their source position for:

- Incremental updates (change only affected nodes)
- Jump-to-source in editor
- Merge conflict resolution

```typescript
interface Position {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

// Stored in node
md_pos: number; // start.offset (byte position)
md_end: number; // end.offset
```

---

## Parser Implementation

Use [unified](https://unifiedjs.com/) ecosystem:

```typescript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkWikiLink from "remark-wiki-link";

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm) // Tables, strikethrough, task lists
  .use(remarkWikiLink);

function parseMarkdown(content: string): Root {
  return parser.parse(content);
}
```

---

## References

- [mdast](https://github.com/syntax-tree/mdast) — Markdown AST spec
- [unified](https://unifiedjs.com/) — Text processing ecosystem
- [remark](https://remark.js.org/) — Markdown processor
- [Obsidian](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax) — Markdown extensions

---

## See Also

- [03-storage.md](03-storage.md) — Node storage, sync
- [05-query.md](05-query.md) — Query language
