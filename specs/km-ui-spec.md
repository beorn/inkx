# UI & Display Specification

This document defines the display layer, views, and visual presentation for km.

---

## Display Layer Overview

The display layer transforms **km-tree → display-tree** at render time. It is responsible for:

1. **Node collapsing** — Unifying adjacent nodes with matching names
2. **Type indicators** — Adding `/`, `.md`, `#` suffixes
3. **Formatting** — Colors, indentation, icons

**Key principle:** Collapsing is computed, not stored. Different views can collapse differently.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI / TUI Layer                          │
│  Commands: tasks, board, tree, show                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Display Layer                              │
│  src/shared/tree.ts                                             │
│  - Node collapsing (same-name folder/file/section → unified)    │
│  - Type suffixes (/ .md #)                                      │
│  - Formatting for output                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Store Layer                               │
│  km-tree (unified nodes in SQLite)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Views

km provides several views, each with different display behavior:

| View | Command | Collapsing | Primary Use |
|------|---------|------------|-------------|
| **Tasks** | `km tasks` | Yes (ancestors) | Task list with context paths |
| **Board** | `km board` | Yes (children) | Kanban columns |
| **Tree** | `km tree` | No (default) | Debug/explore actual structure |
| **Tree collapsed** | `km tree --collapsed` | Yes (children) | Compact tree view |
| **Show** | `km show <id>` | No | Single node detail |

### Tasks View

Lists tasks with their context (ancestor path).

```
$ km tasks

Taxes / .md #                           ← collapsed ancestors
  ## 2025
    [ ] File return                     due: Apr 15
    [ ] Pay estimated                   due: Apr 15

US Financial Setup / .md                ← partial collapse (section name differs)
  # US Financial Setup (2025-26)
    [ ] Open brokerage account
```

**Collapsing direction:** Bottom-up (from task to root)
**Function:** `collapseAncestorsWithTypes(ancestors)`

### Board View

Kanban-style columns showing tasks grouped by status or section.

```
$ km board

┌─ Inbox ──────────┐ ┌─ In Progress ────┐ ┌─ Done ───────────┐
│                  │ │                  │ │                  │
│ [ ] Review PR    │ │ [/] Write spec   │ │ [x] Design model │
│ [ ] Call dentist │ │                  │ │ [x] Setup repo   │
│                  │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Column headers** use collapsed names:
- `Taxes / .md #` if folder, file, and section all named "Taxes"

**Collapsing direction:** Top-down (from column root to first child with different name)
**Function:** `getCollapsedTypeSuffix(node)`

### Tree View

Shows the actual km-tree structure.

```
$ km tree

projects/
  Taxes/
    Taxes.md
      # Taxes
        ## 2025
          [ ] File return
```

**No collapsing by default** — useful for debugging and understanding actual structure.

With `--collapsed`:
```
$ km tree --collapsed

projects/
  Taxes / .md #
    ## 2025
      [ ] File return
```

---

## Node Collapsing

### The Problem

Users often create matching folder/file/section structures:

```
Taxes/           # folder named "Taxes"
  Taxes.md       # file named "Taxes"
    # Taxes      # section titled "Taxes"
```

Showing all three levels is redundant — they represent the same conceptual entity.

### Name Normalization

Names are normalized for comparison:

| Original | Normalized |
|----------|------------|
| `Taxes/` | `taxes` |
| `Taxes.md` | `taxes` |
| `# Taxes` | `taxes` |
| `2025_Taxes` | `2025 taxes` |
| `US-Financial-Setup` | `us financial setup` |

**Normalization rules** (in order):
1. Remove leading `#` characters and whitespace
2. Remove `.md` extension
3. Replace `_` and `-` with spaces
4. Remove special characters (keep alphanumeric and spaces)
5. Collapse multiple whitespace to single space
6. Trim
7. Lowercase

### Collapsing Algorithm

Consecutive nodes are collapsed when their **normalized names match**.

**Input** (ancestor path):
```
[folder: "Taxes", file: "Taxes.md", section: "# Taxes", section: "## 2025"]
```

**Output** (collapsed):
```
[
  { node: section "# Taxes", typeSuffix: "/ .md #" },  // 3 nodes unified
  { node: section "## 2025", typeSuffix: "" }          // different name, kept
]
```

### Collapsing Directions

| Direction | When Used | Algorithm |
|-----------|-----------|-----------|
| **Bottom-up** | Task context paths | Walk ancestors root→leaf, group consecutive matches |
| **Top-down** | Column headers | Walk children, find first with different name |

---

## Type Indicators

Visual markers for node types:

| Type | Indicator | Example Display |
|------|-----------|--------------------|
| folder | `/` | `Projects/` |
| file | `.md` | `README.md` |
| section | `#` | `# Overview` |
| task | `[ ]` / `[x]` / `[/]` | `[ ] Do thing` |
| others | (none) | — |

### Collapsed Type Suffix

When nodes are unified, their types combine into a suffix:

| Collapsed Nodes | Suffix | Display |
|-----------------|--------|---------|
| folder + file | `/ .md` | `Projects / .md` |
| folder + file + section | `/ .md #` | `Projects / .md #` |
| file + section | `.md #` | `README .md #` |

**Rendering:** Suffix is displayed dim/gray to distinguish from the name.

```typescript
// Example rendering
console.log(`${name} ${chalk.dim(typeSuffix)}`);
// Output: "Taxes / .md #" with "/ .md #" in gray
```

---

## Display Functions

Located in `src/shared/tree.ts`:

### Core Functions

```typescript
// Get display name for a node (strips .md, heading markers)
getNodeDisplayName(node: Node): string

// Normalize name for comparison
normalizeName(name: string): string

// Check if normalized names match
namesAreSimilar(a: string, b: string): boolean

// Get type indicator character
getTypeIndicator(type: NodeType): string  // "/", ".md", "#", ""
```

### Collapsing Functions

**Top-down: `getCollapsedTypeSuffix(node, getChildren)`**

Walk down from a node, finding children with matching names.

```typescript
getCollapsedTypeSuffix(taxesFolder, getChildren)
// → "/ .md #" if file and section also named "Taxes"
```

Used by: Board column headers, outline item titles

**Bottom-up: `collapseAncestorsWithTypes(ancestors)`**

Given an ancestor path (root → leaf), group consecutive matching names.

```typescript
interface CollapsedAncestor {
  node: Node;        // Representative (deepest in group)
  typeSuffix: string; // Combined indicators
}

collapseAncestorsWithTypes([folder, file, section, task])
// → [
//     { node: section, typeSuffix: "/ .md #" },
//     { node: task, typeSuffix: "" }
//   ]
```

Used by: Task context paths, breadcrumbs

---

## Examples

### Example 1: Full Collapse

All three levels share the same normalized name:

**km-tree:**
```
folder: "Taxes"
  └─ file: "Taxes.md"
       └─ section: "# Taxes"
            └─ section: "## 2025"
                 └─ task: "File returns"
```

**display-tree (tasks view):**
```
Taxes / .md #          ← folder + file + section collapsed
  ## 2025
    [ ] File returns
```

### Example 2: Partial Collapse

Folder and file match, but section differs:

**km-tree:**
```
folder: "US Financial Setup"
  └─ file: "US Financial Setup.md"
       └─ section: "# US Financial Setup (2025-26)"
            └─ task: "Open accounts"
```

**display-tree (tasks view):**
```
US Financial Setup / .md           ← folder + file collapsed
  # US Financial Setup (2025-26)   ← section kept (name differs)
    [ ] Open accounts
```

### Example 3: No Collapse

All names are different:

**km-tree:**
```
folder: "Work"
  └─ file: "Personal.md"
       └─ section: "# Ideas"
```

**display-tree (tasks view):**
```
Work/
  Personal.md
    # Ideas
```

---

## Color Scheme

| Element | Color | Notes |
|---------|-------|-------|
| Folder name | default | |
| File name | default | |
| Section heading | default | |
| Type suffix | dim/gray | `/ .md #` |
| Task checkbox open | default | `[ ]` |
| Task checkbox done | green | `[x]` |
| Task checkbox in-progress | yellow | `[/]` |
| Due date (overdue) | red | |
| Due date (today) | yellow | |
| Due date (future) | dim | |

---

## Implementation Location

```
src/
  shared/
    tree.ts              # Display layer functions
      - getNodeDisplayName()
      - normalizeName()
      - namesAreSimilar()
      - getTypeIndicator()
      - getCollapsedTypeSuffix()
      - collapseAncestorsWithTypes()
  cli/
    commands/
      tasks.ts           # Tasks view
      board.ts           # Board view
      tree.ts            # Tree view
```

---

## See Also

- [km-store-spec.md](km-store-spec.md) — Store architecture and modes
- [km-tree-spec.md](km-tree-spec.md) — Tree nomenclature (fs-tree, km-tree, display-tree)
- [km-node-spec.md](km-node-spec.md) — Node data model
- [km-cli-spec.md](km-cli-spec.md) — CLI commands
