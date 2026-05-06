---
mentions:
  - km
  - claude
id: "@km/tui/slate-edit"
aliases:
  - km-tui.slate-edit
  - km-tui-slate-edit
created_at: 2026-02-06T10:32:12Z
closed_at: 2026-02-11T17:10:17Z
assignee: claude:9b6678d0
---

# [x] Per-item Slate editor: rich text + split/merge + undo/redo @km/tui #feature #P3 @claude:9b6678d0

## Per-Item Slate Editor for km

Use `slate` core (not slate-react) as an **item-level** editing engine. Each card being edited gets a Slate editor instance — km keeps full control of tree structure and storage.

### Architecture

```
km tree (SQLite)                    Slate (per-item editor)
┌─────────────────┐                ┌──────────────────────┐
│ KNode {         │  ──hydrate──>  │ editor.children = [  │
│   content: md   │                │   { type: "paragraph",│
│   data: {...}   │                │     children: [Text] }│
│ }               │  <──serialize─ │ ]                     │
└─────────────────┘                └──────────────────────┘
```

**Slate owns**: content within one item (markdown inline formatting, paragraph split/merge, cursor/selection, undo/redo via slate-history)
**km owns**: tree between items (parent_id, parent_idx, move/reparent, indent/outdent)

### Why Slate Core

- **Path/Node interfaces**: tree addressing system
- **Transforms (apply())**: battle-tested split/merge/move with metadata+children handling
- **slate-history**: undo/redo per edit session for free
- **Normalization**: schema enforcement
- No DOM dependency in core `slate` package — runs in Node/Bun

### Enter Rules

| Cursor               | Item State              | Action                                               | Type           |
| -------------------- | ----------------------- | ---------------------------------------------------- | -------------- |
| Title, start         | any                     | Insert empty sibling before                          | Tree op        |
| Title, middle        | title-only, no children | Split item into two siblings                         | Tree op        |
| Title, middle        | has body/children       | Split: before stays, after+body+children→new sibling | Tree op        |
| Title, end           | title-only, no children | New empty sibling after                              | Tree op        |
| Title, end           | has body                | Cursor moves into body                               | Cursor move    |
| Title, end           | children, no body       | New empty first-child                                | Tree op        |
| Body, start/mid      | —                       | Split paragraph                                      | Slate internal |
| Body, end (not last) | —                       | New paragraph after                                  | Slate internal |
| Body, last, end      | any                     | New body paragraph                                   | Slate internal |

### Backspace Rules (at position 0)

| Cursor           | Context                    | Action                          | Type           |
| ---------------- | -------------------------- | ------------------------------- | -------------- |
| Title            | empty, has prev            | Delete, cursor to prev          | Tree op        |
| Title            | empty, no prev, has parent | Delete, cursor to parent        | Tree op        |
| Title            | content, prev childless    | Merge prev content into this    | Tree op        |
| Title            | content, prev has children | Move this as last child of prev | Tree op        |
| Title            | no prev, has parent        | Outdent: sibling of parent      | Tree op        |
| Body, first para | —                          | Merge into title                | Slate internal |
| Body, non-first  | —                          | Merge with prev para            | Slate internal |

### Hydration Layer

`markdown string ↔ Slate Element[]` using km's existing @km/markdown parser. On edit start: parse node content → Slate children. On save: serialize Slate children → markdown string → updateNode.

### Reference

See Decker (~/Code/DZ/decker/) withOutline.ts for Enter/Backspace patterns. km adapts these for per-item scope instead of whole-tree.

