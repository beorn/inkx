---
mentions:
  - km
id: "@km/storage/tree"
aliases:
  - "@km/tree"
  - km-tree
  - "@km/_orphan/tree"
created_by: claude:8b5b9e1c
created_at: 2026-04-22T06:04:47Z
owner: bjorn@stabell.org
---

# [ ] Tree layer (KNode outliner, refs, operations) @km/tree #epic #P3

**TRACKING EPIC for km tree layer** — permanent scope epic. See `/pm` skill and `bd list --parent km-tree` for current work.

`@km/tree` owns the KNode tree data model and operations (insert/move/delete), independent of storage. Peer of `@km/storage` — both depend on `@km/core`, neither on each other.

Current open work:

- @km/tree/outliner-reshape (P3) — reshape withOutliner to (state, op) → [state, effects]
- @km/tree/refs (P4) — auto-updating position handles (NodeRef, PointRef, RangeRef)

Tree-specific design docs live in docs/design/model/.

