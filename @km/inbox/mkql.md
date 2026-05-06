---
mentions:
  - km
id: "@km/inbox/mkql"
aliases:
  - km-mkql
  - "@km/_orphan/mkql"
created_at: 2026-01-16T22:03:24Z
closed_at: 2026-01-16T22:22:57Z
---

# [x] Analyze: Unify node types (DBNode/TNode/NodeViewModel) into single extensible model @km/_orphan #task #P4

## Unified Node Model Analysis

## Executive Summary

After deep analysis, I recommend a **single Node type** with:

1. Standardized camelCase naming
2. `children[]` populated lazily when needed for tree display
3. UI state (folded/selected) kept in separate structures, not on nodes
4. Several fields moved to `data` bucket or removed entirely

---

## Current State: 3 Node Types

| Type          | Package   | Fields    | Purpose         |
| ------------- | --------- | --------- | --------------- |
| DBNode        | @km/core  | 27 fields | SQLite storage  |
| TNode         | @km/tree  | 19 fields | Tree navigation |
| NodeViewModel | @km/board | 13 fields | Rendering       |

**Problem:** Each transition copies/renames properties:

- `id` → `nodeId` → `id` (back again\!)
- `parent_id` → `parentId` → (removed)
- `task_status` → `taskStatus` → `taskStatus`
- etc.

---

## Field-by-Field Audit

### ESSENTIAL (keep on Node)

| Field         | Type         | Notes                    |
| ------------- | ------------ | ------------------------ |
| id            | string       | ULID primary key         |
| type          | NodeType     | Essential for behavior   |
| parentId      | string\|null | Tree structure           |
| parentIdx     | number       | Ordering                 |
| name          | string?      | Stable identifier (slug) |
| title         | string?      | Display text             |
| content       | string?      | Body text                |
| taskStatus    | TaskStatus?  | Workflow state           |
| priority      | number?      | Display + query          |
| dueDate       | string?      | Display + query          |
| scheduledDate | string?      | Display + query          |
| createdAt     | number       | Sorting                  |
| updatedAt     | number       | Sync                     |

### SPARSE (only some node types - keep but optional)

| Field  | When Used       | Notes               |
| ------ | --------------- | ------------------- |
| fsPath | folder/file     | Filesystem location |
| mdLine | sections/blocks | Editor integration  |

### COMPUTED (remove from type, compute on demand)

| Field        | Computation                 | Notes               |
| ------------ | --------------------------- | ------------------- |
| isTask       | taskStatus \!== undefined   | 1 line              |
| childCount   | getChildren(id).length      | Or track in storage |
| color        | rules?.color                | Derived from rules  |
| icon         | Currently always undefined! | Remove              |
| hasBacklinks | getBacklinks(id).length > 0 | Query               |
| refsCount    | getOutgoingLinks(id).length | Query               |

### MOVE TO `data` BUCKET

| Field           | Reason                           |
| --------------- | -------------------------------- |
| symlinkTo       | Rare, special feature            |
| taskMark        | Only for serialization           |
| assignedTo      | Rarely used                      |
| recurrence      | Rare                             |
| recurPrev       | Rare                             |
| sourceEmbedding | Rare, transclusion only          |
| rules           | Already parsed, could lazy-parse |

### INTERNAL (storage only, not on Node interface)

| Field       | Reason                     |
| ----------- | -------------------------- |
| fsIno       | Only for rename detection  |
| mdPos       | Only for file sync         |
| mdSlug      | DEPRECATED                 |
| contentHash | Only for large content CAS |
| version     | Only for sync              |

---

## Proposed Architecture

### Single Node Type

```typescript
// @km/core - THE node type
interface Node {
  // Identity
  id: string;
  type: NodeType;
  name?: string;
  title?: string;

  // Structure  
  parentId: string | null;
  parentIdx: number;

  // Content
  content?: string;

  // Task (optional)
  taskStatus?: TaskStatus;
  priority?: number;
  dueDate?: string;
  scheduledDate?: string;

  // File location (sparse)
  fsPath?: string;
  mdLine?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;

  // Extension bucket
  data: Record<string, unknown>;
}
```

### Tree Extension (only when needed)

```typescript
// Only add children when building tree for display
interface TreeNode extends Node {
  children: TreeNode[];
  depth: number;  // Or pass as parameter
}

function buildTree(rootId: string | null, depth = 0): TreeNode[] {
  return getChildren(rootId).map(node => ({
    ...node,  // Spread base node - no copying\!
    children: buildTree(node.id, depth + 1),
    depth,
  }));
}
```

### UI State (separate structures)

```typescript
// NOT on nodes - kept in BoardState
interface BoardState {
  foldedNodes: Set<string>;    // Already exists\!
  selectedNodes: Set<string>;  // Already exists\!
  collapsedNodes: Set<string>; // Already exists\!
}

// Check fold state when rendering
const isFolded = boardState.foldedNodes.has(node.id);
```

---

## Migration Path

### Phase 1: Naming Standardization

1. Change DBNode to use camelCase in TypeScript interface
2. Keep snake_case in SQLite (map during read/write)
3. Remove TNode and NodeViewModel types
4. Use single `Node` type everywhere

### Phase 2: Remove Computed Fields

1. Remove `isTask` - use `node.taskStatus \!== undefined`
2. Remove `icon` - always undefined
3. Remove `color` - use `node.data.rules?.color`
4. Remove `childCount` - query when needed

### Phase 3: Consolidate Sparse Fields

1. Move rare fields to `data` bucket
2. Add typed accessors: `getRecurrence(node)`, etc.

---

## Key Questions Resolved

**Q: Do we need children[] on nodes?**
A: Yes, for recursive rendering. But only populated when building tree for display, not stored.

**Q: Do we need depth on nodes?**
A: Maybe not - could pass as parameter during render. But keeping it is harmless.

**Q: Should isFolded/isSelected be on nodes?**
A: NO. Already managed via Sets in BoardState. NodeViewModel adding isFolded is redundant.

**Q: Can we query SQLite on every render?**
A: For children, probably not (too slow). Keep the tree-building step. For metadata like backlinks, yes - query on demand.

---

## Benefits

1. **One type to understand** - Node is Node everywhere
2. **No property copying** - spread operator, not 20-line mapping
3. **Clear separation** - data on Node, UI state in BoardState
4. **Smaller surface area** - fewer fields, simpler code
5. **TypeScript happy** - no more `nodeId` vs `id` confusion

## Risks

1. **Large refactor** - touches many files
2. **Snake_case in SQLite** - need mapping layer (but already have it)
3. **Performance** - need to verify tree building isn't a bottleneck

---

## Recommended Next Steps

1. **@km/_orphan/1yut** - Remove fsPath/mdLine from TNode (small cleanup)
2. Create new bead for naming standardization (camelCase)
3. Create new bead to remove computed fields
4. Create new bead to unify types (the big one)

