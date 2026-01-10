# Markdown Specification

Parsing markdown files into km nodes.

---

## Overview

Kimmi parses markdown files into an AST, then converts AST nodes into Kimmi nodes. This enables:

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

interface Link {
  type: "link";
  url: string;
  title?: string;
  children: PhrasingContent[];
}
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
  taskMark: " " | "x" | "X" | "/" | "-" | "1" | "2" | "?";
  // Extended marks:
  // ' ' = open
  // 'x'/'X' = done
  // '/' = in progress
  // '-' = cancelled
  // '1' = priority 1
  // '2' = priority 2
  // '?' = question/blocked
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

| AST Type      | Kimmi Node Type | Notes                           |
| ------------- | --------------- | ------------------------------- |
| root          | file            | Top-level document              |
| heading       | section         | Creates hierarchy by depth      |
| paragraph     | paragraph       | Content block                   |
| blockquote    | quote           | Nested content                  |
| code          | code            | With language metadata          |
| list          | (container)     | Children become list_item nodes |
| listItem      | ul / ol / task  | Based on list type and checked  |
| thematicBreak | hr              | Separator                       |
| table         | table           | With row/cell children          |
| html          | html            | Preserved raw                   |

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

### Conversion Algorithm

```typescript
function astToNodes(ast: Root, fileNode: Node): Node[] {
  const nodes: Node[] = [];
  const sectionStack: { depth: number; node: Node }[] = [];

  let currentParent = fileNode;
  let sortOrder = 0;

  for (const child of ast.children) {
    if (child.type === "yaml") {
      // Merge frontmatter into file node
      fileNode.data = { ...fileNode.data, ...parseYaml(child.value) };
      continue;
    }

    if (child.type === "heading") {
      // Pop stack until we find a shallower heading
      while (
        sectionStack.length > 0 &&
        sectionStack.at(-1)!.depth >= child.depth
      ) {
        sectionStack.pop();
      }

      const sectionNode: Node = {
        id: generateId(),
        type: "section",
        parent_id: sectionStack.at(-1)?.node.id ?? fileNode.id,
        parent_idx: sortOrder++,
        md_pos: child.position?.start.offset,
        md_slug: slugify(toString(child)),
        content: toString(child),
        data: { depth: child.depth },
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      nodes.push(sectionNode);
      sectionStack.push({ depth: child.depth, node: sectionNode });
      currentParent = sectionNode;
      continue;
    }

    // Other block nodes
    const blockNode = convertBlock(child, currentParent, sortOrder++);
    nodes.push(blockNode);

    // Recurse into list items
    if (child.type === "list") {
      for (const item of child.children) {
        const itemNode = convertListItem(item, blockNode, child.ordered);
        nodes.push(itemNode);
      }
    }
  }

  return nodes;
}

function convertListItem(item: ListItem, parent: Node, ordered: boolean): Node {
  const isTask = item.checked !== null && item.checked !== undefined;

  return {
    id: generateId(),
    type: isTask ? "task" : ordered ? "ol" : "ul",
    parent_id: parent.id,
    parent_idx: 0,
    md_pos: item.position?.start.offset,
    content: toString(item),
    task_status: isTask ? (item.checked ? "done" : "open") : undefined,
    task_mark: getTaskMark(item),
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function getTaskMark(item: ListItem): string | undefined {
  // Extract mark from source: - [x] or - [ ] or - [/]
  const match =
    item.position &&
    sourceText.slice(item.position.start.offset).match(/\[([ xX\/\-12?])\]/);
  return match?.[1];
}
```

---

## Nodes to Markdown

### Serialization Rules

````typescript
function nodesToMarkdown(nodes: Node[]): string {
  const root = buildTree(nodes);
  return serializeNode(root, 0);
}

function serializeNode(node: Node, indent: number): string {
  switch (node.type) {
    case "file":
      return serializeFile(node);
    case "section":
      return serializeSection(node);
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

function serializeSection(node: Node): string {
  const prefix = "#".repeat(node.data.depth || 1);
  let md = `${prefix} ${node.content}\n\n`;

  for (const child of node.children) {
    md += serializeNode(child, 0);
  }

  return md;
}

function serializeFile(node: Node): string {
  let md = "";

  // Frontmatter
  if (Object.keys(node.data).length > 0) {
    md += "---\n";
    md += yaml.stringify(node.data);
    md += "---\n\n";
  }

  for (const child of node.children) {
    md += serializeNode(child, 0);
  }

  return md;
}
````

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

### Incremental Parsing

When file changes:

1. Detect changed byte range
2. Find affected nodes by `md_pos`
3. Re-parse only affected section
4. Update positions for subsequent nodes

```typescript
function incrementalUpdate(
  file: string,
  oldContent: string,
  newContent: string,
  nodes: Node[],
): NodeUpdate[] {
  const diff = computeDiff(oldContent, newContent);

  // Find first affected node
  const affectedStart = nodes.findIndex(
    (n) => n.md_pos !== undefined && n.md_pos >= diff.start,
  );

  // Find section boundary to re-parse
  const sectionStart = findSectionBoundary(nodes, affectedStart);
  const sectionEnd = findNextSectionBoundary(nodes, affectedStart);

  // Re-parse section
  const sectionContent = newContent.slice(
    nodes[sectionStart].md_pos,
    nodes[sectionEnd]?.md_pos,
  );

  const newNodes = parseSection(sectionContent, nodes[sectionStart].parent_id);

  // Compute delta for positions after change
  const delta = newContent.length - oldContent.length;

  // Update subsequent node positions
  const updates: NodeUpdate[] = [];
  for (let i = sectionEnd; i < nodes.length; i++) {
    if (nodes[i].md_pos !== undefined) {
      updates.push({
        id: nodes[i].id,
        md_pos: nodes[i].md_pos + delta,
      });
    }
  }

  return updates;
}
```

---

## Task Parsing

### Standard Tasks

```markdown
- [ ] Open task
- [x] Completed task
- [x] Also completed
```

### Extended Task Marks

```markdown
- [/] In progress
- [-] Cancelled
- [?] Blocked/question
- [1] Priority 1 (urgent)
- [2] Priority 2 (high)
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
  task_status: 'open',
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
