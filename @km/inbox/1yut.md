---
mentions:
  - km
id: "@km/inbox/1yut"
aliases:
  - km-1yut
  - "@km/_orphan/1yut"
created_at: 2026-01-16T22:03:23Z
closed_at: 2026-01-16T22:22:57Z
---

# [x] Remove storage properties (fsPath, mdLine) from TNode @km/_orphan #task #P3

## Background

TNode (tree layer) currently contains storage-level properties:

- `fsPath?: string` - filesystem path
- `mdLine?: number` - line number in markdown file

These are storage concerns that should only exist on DBNode.

## Analysis

Both usages in @km/_orphan/opentui/App.tsx already have fallback logic that queries storage (`getAncestors()`). The TNode properties are just a premature optimization.

## Implementation

1. Remove from TNode type (packages/@km/tree/src/types.ts):
- Delete `fsPath?: string`
- Delete `mdLine?: number`
5. Update nodeToTNode() in apps to stop copying these properties
6. Simplify @km/_orphan/opentui/App.tsx to always use storage query path

## Files

- packages/@km/tree/src/types.ts
- apps/@km/_orphan/cli/src/tui2/tui2.tsx
- apps/@km/tui/packages/@km/_orphan/opentui/src/App.tsx

