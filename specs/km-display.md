# Display Specification

Views, collapsing, and formatting for km output.

---

## Tree Representations

km uses three tree levels:

| Tree | Location | Purpose |
|------|----------|---------|
| **fs-tree** | Disk | Folders, files, markdown content. Source of truth. |
| **km-tree** | SQLite | Unified nodes. Queryable. |
| **display-tree** | Render-time | Collapsed, formatted for output. |

Collapsing happens only in display-tree — km-tree preserves actual structure.

---

## Views

| View | Command | Collapsing | Use |
|------|---------|------------|-----|
| List | `km list` / `km ls` | No | Flat node list |
| List | `km ls --context` | Yes (ancestors) | With ancestor paths |
| Tasks | `km tasks` | Yes (ancestors) | = `ls --type task --context` |
| Board | `km board` | Yes (children) | Kanban columns |
| Tree | `km tree` | No | Actual structure |
| Tree | `km tree --collapsed` | Yes | Compact view |

All views support `--id` to show node IDs (hidden by default).

---

## Collapsing

### The Problem

Users create matching folder/file/section structures:

```
Taxes/           # folder
  Taxes.md       # file
    # Taxes      # section
```

Three levels for one concept is redundant.

### The Solution

Consecutive nodes with the same normalized name collapse into one line:

```
Taxes / .md #    # shows all three types in suffix
```

### Name Normalization

| Original | Normalized |
|----------|------------|
| `Taxes/` | `taxes` |
| `Taxes.md` | `taxes` |
| `# Taxes` | `taxes` |
| `US-Financial-Setup` | `us financial setup` |

Rules: strip `#`, `.md`, replace `-_` with space, lowercase, trim.

### Collapsing Directions

| Direction | Used By | Algorithm |
|-----------|---------|-----------|
| **Bottom-up** | Task context | Walk ancestors, group matching names |
| **Top-down** | Board columns | Walk children, find first different name |

---

## Type Indicators

| Type | Indicator | Example |
|------|-----------|---------|
| folder | `/` | `Projects/` |
| file | `.md` | `README.md` |
| section | `#` | `# Overview` |
| task | `[ ]` `[x]` `[/]` | `[ ] Do thing` |

### Collapsed Suffix

| Collapsed | Suffix |
|-----------|--------|
| folder + file | `/ .md` |
| folder + file + section | `/ .md #` |
| file + section | `.md #` |

Suffix renders dim/gray.

---

## List with Context

`km ls --context` (or `km tasks` for tasks) shows ancestor paths:

```
$ km tasks
# equivalent to: km ls --type task --context

Taxes / .md #                           ← collapsed ancestors
  ## 2025
    [ ] File return                     due: Apr 15

US Financial Setup / .md                ← partial collapse
  # US Financial Setup (2025-26)        ← section name differs
    [ ] Open brokerage account
```

Uses `collapseAncestorsWithTypes(ancestors)`.

---

## Board View

```
$ km board

┌─ Inbox ──────────┐ ┌─ In Progress ────┐ ┌─ Done ───────────┐
│                  │ │                  │ │                  │
│ [ ] Review PR    │ │ [/] Write spec   │ │ [x] Design model │
│ [ ] Call dentist │ │                  │ │ [x] Setup repo   │
│                  │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

Column headers use `getCollapsedTypeSuffix(node)`.

---

## Tree View

```
$ km tree

projects/
  Taxes/
    Taxes.md
      # Taxes
        ## 2025
          [ ] File return
```

No collapsing — shows actual km-tree structure.

With `--collapsed`:
```
$ km tree --collapsed

projects/
  Taxes / .md #
    ## 2025
      [ ] File return
```

---

## Colors

| Element | Color |
|---------|-------|
| Type suffix | dim/gray |
| Task `[ ]` | default |
| Task `[x]` | green |
| Task `[/]` | yellow |
| Due (overdue) | red |
| Due (today) | yellow |
| Due (future) | dim |

---

## Display Functions

Located in `src/shared/tree.ts`:

```typescript
// Get display name (strips .md, # markers)
getNodeDisplayName(node: Node): string

// Normalize for comparison
normalizeName(name: string): string

// Type indicator: "/", ".md", "#", ""
getTypeIndicator(type: NodeType): string

// Top-down: get collapsed suffix for a node
getCollapsedTypeSuffix(node: Node): string

// Bottom-up: collapse ancestor path
collapseAncestorsWithTypes(ancestors: Node[]): CollapsedAncestor[]

interface CollapsedAncestor {
  node: Node;
  typeSuffix: string;
}
```

---

## Examples

### Full Collapse

```
km-tree:                      display-tree:
folder: "Taxes"               Taxes / .md #
  └─ file: "Taxes.md"           ## 2025
       └─ section: "# Taxes"      [ ] File returns
            └─ section: "## 2025"
                 └─ task: "File returns"
```

### Partial Collapse

```
km-tree:                              display-tree:
folder: "US Financial Setup"          US Financial Setup / .md
  └─ file: "US Financial Setup.md"      # US Financial Setup (2025-26)
       └─ section: "# US Financial         [ ] Open accounts
            Setup (2025-26)"
            └─ task: "Open accounts"
```

Section name differs (`(2025-26)`), so it's not collapsed.

### No Collapse

```
km-tree:                      display-tree:
folder: "Work"                Work/
  └─ file: "Personal.md"        Personal.md
       └─ section: "# Ideas"      # Ideas
```

All names differ — no collapsing.

---

## See Also

- [Store](km-store.md) — Where km-tree comes from
- [CLI](km-cli.md) — Command reference
- [Data Model](km-data-model.md) — Node schema
