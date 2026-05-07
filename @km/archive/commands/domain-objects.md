---
mentions:
  - km
  - claude
id: "@km/commands/domain-objects"
aliases:
  - km-commands.domain-objects
  - km-commands-domain-objects
created_by: claude:ceb7c9cb
created_at: 2026-03-28T06:12:18Z
closed_at: 2026-03-28T07:32:51Z
close_reason: Superseded by km-core.slate-interfaces epic — broader scope with phased plan
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Domain objects & interface helpers — ergonomic typed APIs for tree operations @km/commands #feature #P2 @claude:ceb7c9cb

## Goal

Define first-class domain objects with typed interfaces and helpers that eliminate verbose boilerplate across km. The tree is the core data structure — operations on it should be concise, composable, and type-safe.

## Domain Objects

### 1. Position { parentId, childIdx } ✓

Helpers: positionOf, firstChild, lastChild, toSortOrder, nodeAt, isAtPosition, moveTo. Lives in position-resolver.ts.

### 2. repo.moveNode understands Position

Teach moveNode to interpret childIdx -1 as 'append at end', 0 as 'prepend before first'. No signature change — just smarter implementation. Eliminates the toSortOrder adapter for common cases.

### 3. NodeRef — typed node reference

Replace raw string IDs + null-check patterns with validated handles: NodeRef.of(repo, id), NodeRef.parent, NodeRef.children, NodeRef.position, NodeRef.moveTo(pos).

### 4. Selection — typed multi-selection

Replace ad-hoc getSelectedCards + batch loops with Selection.nodes(ctx), Selection.moveTo(pos), Selection.forEach(fn) with built-in undo batching.

### 5. TreeOps — composable tree mutations

Express indent/outdent/reorder as Position operations: TreeOps.indent = moveTo(lastChild(prevSibling)), TreeOps.outdent = moveTo(after(parent)).

## Where Things Live

| Object           | Package                        | Why                       |
| ---------------- | ------------------------------ | ------------------------- |
| Position helpers | @km/tui (position-resolver.ts) | Needs repo for resolution |
| repo.moveNode    | @km/storage                    | Storage layer             |
| NodeRef          | @km/storage or @km/tui         | Wraps repo access         |
| Selection        | @km/tui                        | Needs ActionCtx           |
| TreeOps          | @km/tree or @km/tui            | Pure tree mutations       |

## Connection to TEA

Domain objects become the vocabulary between command layer and operation layer. In TEA/era2b: moveTo() emits Operations through apply() choke point. NodeRef.moveTo() is sugar over the same. All serializable → replay, undo, sync.

