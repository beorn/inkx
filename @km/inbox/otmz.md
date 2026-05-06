---
mentions:
  - km
id: "@km/inbox/otmz"
aliases:
  - km-otmz
  - "@km/_orphan/otmz"
created_at: 2026-01-23T11:28:53Z
closed_at: 2026-01-23T15:42:40Z
---

# [x] Show non-column content (paragraphs, code, quotes) as board info column @km/_orphan #feature #P3

## Summary

Currently, non-column types (paragraph, code, quote) are filtered out from the board view. 
This bead explores both how to display this content AND the underlying data model for nodes.

---

## Part 1: Node Data Model Exploration

### Current Model: Flat Children

```
file.md (type: file)
├── paragraph (type: paragraph, content: "Description")
├── code (type: code, content: "example")
├── section (type: section, title: "Column 1")
│   └── task (type: task)
└── section (type: section, title: "Column 2")
```

- All content types are siblings
- Type field distinguishes purpose
- Display logic filters by type

### Alternative A: Content vs Structure Split

Separate "content" nodes from "structure" nodes in the type system:

```typescript
type StructureNode = "folder" | "file" | "section" | "board";
type ContentNode = "paragraph" | "code" | "quote" | "task" | "table";

interface Node {
  type: StructureNode | ContentNode;
  isContent: boolean;  // derived from type
}
```

- Explicit categorization
- Filter by `isContent` rather than hardcoded type lists
- Type system enforces the distinction

### Alternative B: Body Container Node

Add explicit "body" container for content:

```
file.md (type: file)
├── body (type: body)  ← new node type
│   ├── paragraph
│   └── code
├── section: "Column 1"
└── section: "Column 2"
```

- Parser creates body node for leading content
- Clear tree structure
- Body is navigable/selectable as a unit
- Requires parser change

### Alternative C: Slots/Regions Model

Nodes have named slots for different content types:

```typescript
interface Node {
  id: string;
  type: NodeType;
  slots: {
    body?: string[];      // IDs of body content
    children?: string[];  // IDs of structural children
    metadata?: string[];  // IDs of frontmatter/config
  };
}
```

- Explicit organization without changing tree structure
- Flexible for future needs (metadata, attachments)
- More complex queries

### Alternative D: Semantic Parent Reference

Content nodes reference their "semantic parent" differently:

```typescript
interface Node {
  parent_id: string;        // structural parent
  belongs_to?: string;      // semantic container (e.g., "body of X")
  position: "body" | "children" | "metadata";
}
```

- Preserves flat storage
- Allows queries like "get body of X"
- Backwards compatible

---

## Part 2: Display Options

### Option A: Info Panel (non-column)

- Show as a panel/header above the columns
- Read-only, always visible
- Like a "board description"

### Option B: Special First Column

- Show as leftmost column with different styling
- Could be collapsible
- Treated like a column but read-only

### Option C: Expandable Header

- Collapsed by default, click to expand
- Shows in the board header area
- Minimal visual footprint

### Option D: Detail Pane Content

- Show body when board itself is "selected" (cursor at board level)
- Integrates with existing detail pane
- No extra UI chrome

---

## Questions to Resolve

1. **Should body be a first-class concept in storage or computed at display?**
2. **Do we want to navigate INTO body content, or just view it?**
3. **Should body content be editable from board view?**
4. **How does this affect other views (tree, list, search)?**

---

## Use Case

```markdown
# Issues

All issues tracked with the @issue tag.

## Open
- [ ] Bug 1

## Closed  
- [x] Fixed bug
```

Where does "All issues tracked..." belong in the model?

## Related

- @km/_orphan/1tho: Fixed bug where paragraphs appeared as columns
- Current fix: filters them out (loses information)

