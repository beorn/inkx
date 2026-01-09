# Tree Nomenclature Specification

This document defines the three tree representations used in km.

---

## Overview

km works with three conceptual tree representations:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    fs-tree      │────►│    km-tree      │────►│  display-tree   │
│   (Filesystem)  │     │    (Parsed)     │     │  (Presentation) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
   folders, files        unified nodes          collapsed/formatted
   markdown content      in SQLite              for UI output
```

| Tree | Location | Persistence | Purpose |
|------|----------|-------------|---------|
| **fs-tree** | Disk | Yes (files) | Source of truth |
| **km-tree** | SQLite | Session or disk | Queryable structure |
| **display-tree** | Memory | No | Render-time presentation |

---

## fs-tree (Filesystem Source)

The raw filesystem structure plus markdown content. This is the **source of truth**.

```
projects/                    # folder
  Taxes/                     # folder
    Taxes.md                 # file
      # Taxes               # section (h1)
        ## 2025             # section (h2)
          - [ ] File return # task
          Some notes        # paragraph
```

**Components:**
- **Physical**: folders, files
- **Parsed**: sections, tasks, paragraphs, lists, code blocks, etc.

**Characteristics:**
- Exists on disk
- Markdown parsed into blocks
- In memory mode, this is also the write target (see [km-store-spec](km-store-spec.md))

---

## km-tree (Parsed/Unified)

The database representation where filesystem and markdown nodes share a single hierarchy.

```sql
nodes (id, type, parent_id, content, fs_path, md_line, data, ...)
```

```
folder: projects/
  └─ folder: Taxes/
       └─ file: Taxes.md
            └─ section: "Taxes" (depth: 1)
                 └─ section: "2025" (depth: 2)
                      ├─ task: "File return"
                      └─ paragraph: "Some notes"
```

**Characteristics:**
- Unified node model (everything is a node with `type`)
- Stored in SQLite (disk or `:memory:`)
- Queryable: `SELECT * FROM nodes WHERE type = 'task'`
- Contains location info for write-back: `fs_path`, `md_line`
- Same structure in both persisted and in-memory modes

**Node Types:**
- Structural: `folder`, `file`, `section`
- Content: `task`, `paragraph`, `quote`, `code`, `ul`, `ol`, `table`, `hr`, `html`
- Special: `board`, `agent`

---

## display-tree (Presentation)

The transformed tree for UI rendering. **Exists only at render time.**

```
projects/
  Taxes / .md #              ← collapsed: folder + file + section
    ## 2025
      [ ] File return
```

**Characteristics:**
- Computed from km-tree on demand
- Not persisted
- Collapsing applied based on view context
- Formatted with type suffixes, colors, indentation

For details on collapsing, views, and formatting, see [km-ui-spec](km-ui-spec.md).

---

## Why Three Trees?

### Separation of Concerns

| Tree | Concern |
|------|---------|
| fs-tree | Storage, portability, git compatibility |
| km-tree | Fast queries, relationships, unified model |
| display-tree | User experience, visual presentation |

### Data Flow

**Read path:**
```
fs-tree ──scan──► km-tree ──render──► display-tree
```

**Write path (memory mode):**
```
user action ──► update km-tree ──► write fs-tree
```

**Write path (persisted mode):**
```
user action ──► emit event ──► update km-tree
                    │
                    └──► events.jsonl
```

---

## Key Design Decisions

### Collapsing is Display-Only

Collapsing (folder/file/section unification) happens in the display layer, not stored in km-tree.

**Reasons:**
1. **Data integrity** — km-tree mirrors the actual structure
2. **Flexibility** — Different views can collapse differently
3. **Simplicity** — No sync issues between collapsed/uncollapsed state
4. **Debugging** — `km tree` shows actual structure

### Same km-tree in Both Modes

Whether running with `.km/` (persisted) or without (in-memory), the km-tree structure is identical. Only the ID format and persistence differ.

| Aspect | Persisted Mode | In-Memory Mode |
|--------|----------------|----------------|
| ID format | ULID | `path:line` |
| SQLite | `.km/state.db` | `:memory:` |
| Write-back | Via events | Direct to `.md` |

---

## See Also

- [km-ui-spec.md](km-ui-spec.md) — Display layer, views, collapsing
- [km-store-spec.md](km-store-spec.md) — Store architecture and modes
- [km-node-spec.md](km-node-spec.md) — Node data model
- [km-cli-spec.md](km-cli-spec.md) — CLI commands
