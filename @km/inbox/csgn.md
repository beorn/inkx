---
id: "@km/inbox/csgn"
aliases:
  - km-csgn
  - "@km/_orphan/csgn"
created_at: 2026-01-16T21:45:43Z
closed_at: 2026-01-16T22:03:31Z
---

# [x] Unify node types: single Node extended with children[] and UI state @km/_orphan #task #P3

## Background

Currently we have THREE node types:
- `DBNode` (@km/core) - flat storage record
- `TNode` (@km/tree) - recursive tree for navigation  
- `NodeViewModel` (@km/board) - rendering view model

This creates:
- Property duplication (same props copied between types)
- Naming inconsistencies (parentId vs parent_id)
- Conversion overhead (nodeToTNode, toNodeViewModel)
- Leaky abstractions (fsPath/mdLine on TNode)

## Proposed Solution

Single extensible Node type:

```typescript
// @km/core - base node (stored in SQLite)
interface Node {
  id: string;
  parentId: string | null;
  parentIdx: number;
  type: NodeType;

  // All data properties (storage, content, task, etc.)
  fsPath?: string;
  mdLine?: number;
  title?: string;
  taskStatus?: TaskStatus;
  // ... etc
}

// Tree extension - add recursive children
interface TreeNode extends Node {
  children: TreeNode[];  // Populated by buildTree()
  depth: number;         // Computed during build
}

// Board extension - add UI state
interface BoardNode extends TreeNode {
  isFolded: boolean;     // From foldedNodes Set
  isSelected: boolean;   // From selectedNodes Set
}
```

## Benefits
- One base type with all data properties
- Extension adds structure (children[]) not copies
- No property renaming between layers
- Clear what each layer adds
- Simpler mental model

## Analysis
See ~/.claude/plans/vivid-swimming-floyd.md for full property comparison and code analysis.

Key insight: Current `node.children` is used 80+ times for tree traversal/rendering. `getChildren(id)` is used 30+ times for storage queries. Both patterns are needed - the unified approach supports both.