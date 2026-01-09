# Tree Display Specification

This document defines the tree nomenclature and the display layer transformation from km-tree to display-tree.

## Tree Nomenclature

km works with three conceptual tree representations:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    fs-tree      │────►│    km-tree      │────►│  display-tree   │
│   (Filesystem)  │     │    (Parsed)     │     │  (Presentation) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
   folders, files        unified nodes          collapsed/formatted
   markdown content      in SQLite              for UI output
```

### fs-tree (Filesystem Source)

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
- In memory mode, this is also the write target

### km-tree (Parsed/Unified)

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

### display-tree (Presentation)

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

---

## Display Layer

The display layer transforms km-tree → display-tree. Its responsibilities:

1. **Node collapsing** - Unify adjacent nodes with matching names
2. **Type indicators** - Add `/`, `.md`, `#` suffixes
3. **Formatting** - Colors, indentation, icons

### Why Collapsing is Display-Only

Collapsing is **not stored** in km-tree. Reasons:

1. **Data integrity** - km-tree mirrors the actual structure
2. **Flexibility** - Different views can collapse differently
3. **Simplicity** - No sync issues between collapsed/uncollapsed state
4. **Debugging** - `km tree --raw` shows actual structure

```typescript
// km-tree (stored) - actual structure preserved
nodes: [
  { id: "1", type: "folder", name: "Taxes" },
  { id: "2", type: "file", name: "Taxes.md", parent_id: "1" },
  { id: "3", type: "section", content: "# Taxes", parent_id: "2" },
]

// display-tree (computed) - collapsed for presentation
collapsed: [
  { node: section, typeSuffix: "/ .md #" }
]
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

Showing all three levels is redundant. They represent the same conceptual entity.

### The Solution: Name Normalization

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

### Collapsing per View

| View | Collapse? | Direction | Notes |
|------|-----------|-----------|-------|
| `km tasks` | Yes | Bottom-up (ancestors) | Show task context compactly |
| `km board` | Yes | Top-down (children) | Column headers concise |
| `km tree` | No | — | Show actual km-tree structure |
| `km tree --collapsed` | Yes | Top-down | Optional collapsed view |

---

## Type Indicators

Visual markers for node types:

| Type | Indicator | Example Display |
|------|-----------|-----------------|
| folder | `/` | `Projects/` |
| file | `.md` | `README.md` |
| section | `#` | `# Overview` |
| task | `[ ]` / `[x]` | `[ ] Do thing` |
| others | (none) | — |

### Collapsed Type Suffix

When nodes are unified, their types combine into a suffix:

| Collapsed Nodes | Suffix | Display |
|-----------------|--------|---------|
| folder + file | `/ .md` | `Projects / .md` |
| folder + file + section | `/ .md #` | `Projects / .md #` |
| file + section | `.md #` | `README .md #` |

Suffix is rendered dim/gray to distinguish from the name.

---

## Display Functions

### Core Functions

```typescript
// Get display name for a node
getNodeDisplayName(node: Node): string

// Normalize name for comparison
normalizeName(name: string): string

// Check if normalized names match
namesAreSimilar(a: string, b: string): boolean

// Get type indicator character
getTypeIndicator(type: NodeType): string  // "/", ".md", "#", ""
```

### Collapsing Functions

**Top-down: `getCollapsedTypeSuffix(node)`**

Walk down from a node, finding children with matching names.

```typescript
getCollapsedTypeSuffix(taxesFolder)
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

**display-tree:**
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

**display-tree:**
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

**display-tree:**
```
Work/
  Personal.md
    # Ideas
```

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
      - collapseRedundantAncestors()
```

All display transformations happen here, keeping km-tree (store layer) clean.

---

## See Also

- [km-store-spec.md](km-store-spec.md) - Store architecture and modes
- [km-node-spec.md](km-node-spec.md) - Node data model
- [km-cli-spec.md](km-cli-spec.md) - CLI commands
