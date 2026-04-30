---
id: "@km/tree/ktree-path-method"
aliases:
  - km-tree.ktree-path-method
  - km-tree-ktree-path-method
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T10:13:00Z
type: feature
priority: P2
parent: "@km/tree"
---

# KTree.path(tree, id) — canonical path derivation in the KTree namespace @km/tree #task #P2

Add `KTree.path(tree: KTree, id: NodeId): string | null` next to `KTree.nodes()` and `KTree.ancestors()` in `packages/km-tree/src/`. Walks the parent chain from the node up to root, collects each ancestor's `name`, joins with `/`. Cache-free; no fs_path read.

## Why

Per `docs/principles.md` Discoverability Test:

> "If a developer types `X.` and doesn't see the operation they need, the namespace is incomplete."

`KTree.` should surface `.path()` alongside `.nodes()` / `.ancestors()`. Today the operation lives as `pathOf(node)` in `@km/core/src/path.ts` — but that's a derivation from the cached `fs_path` column, not a tree walk.

`KTree.path()` is the cache-free version: walks `(parent_id, name)` pairs, never consults `fs_path`. This:

1. Foreshadows `@km/storage/drop-fs-path-derive-from-name` — once that lands, `pathOf(node)` can delegate to `KTree.path()` and the `fs_path` column can be dropped.
2. Passes the autocomplete test — anyone exploring `KTree` finds the operation.
3. Matches the canonical model in `docs/design/model/storage.md:761-787` — path is composed from names by parent walk.

## Implementation sketch

```typescript
// packages/km-tree/src/path.ts (or wherever KTree namespace lives)
export function path(tree: KTree, id: NodeId): string | null {
  const node = tree.get(id)
  if (!node) return null
  if (!node.name) return null  // unanchored block / paragraph — no addressable path
  const segments: string[] = []
  let current: KNode | null = node
  while (current) {
    if (current.name) segments.unshift(current.name)
    current = current.parent_id ? tree.get(current.parent_id) : null
  }
  return segments.join("/")
}
```

Add to `KTree` namespace export. Bound the walk by depth (max 64) as a safety measure.

## Relationship to pathOf

- `pathOf(node)` — reads `node.fs_path`, strips `.md` and `./`. O(1). Requires fs_path is set (true for fs-materialized nodes).
- `KTree.path(tree, id)` — walks parent chain. O(depth). No fs_path needed. Works for any node in the tree.

For now they coexist. After `@km/storage/drop-fs-path-derive-from-name`, `pathOf` becomes a wrapper around `KTree.path` (or is deleted in favor of it).

## Acceptance

- `KTree.path(tree, beadId)` returns `"@km/beads/foo"` for a bead at that path.
- `KTree.path(tree, paragraphId)` returns null for a paragraph that has no name.
- `KTree.path(tree, repoRootId)` returns `""` or the root sigil (TBD during implementation).
- A test in `packages/km-tree/tests/` exercises the walk against a multi-level tree (≥3 depth).
- Discoverability: `KTree.` autocomplete includes `.path` next to `.nodes`, `.ancestors`.

## Dependencies / sequencing

- No hard dependency. Can land independently.
- Pairs with `@km/all/id-name-path-code-cleanup` — that bead's site migration may want to use `KTree.path()` rather than `pathOf()` in some places (when a tree handle is more available than a node).
- Foreshadows `@km/storage/drop-fs-path-derive-from-name` — that bead's migration is much smaller if `KTree.path()` is the canonical operation already.

## Origin

- /big session 2026-04-30 — arch agent's recommendation #2 (high confidence).
- See `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md` for the broader path/name/id discussion.
