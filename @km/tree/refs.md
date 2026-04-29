---
id: "@km/tree/refs"
aliases:
  - km-tree.refs
  - km-tree-refs
created_by: Bjørn Stabell
created_at: 2026-04-03T03:56:38Z
---

# [ ] Phase 5a: Refs — auto-updating position handles (NodeRef, PointRef, RangeRef) @km/tree #task #P4

blocks:: [[@km/tree]]

Open question: how far do refs generalize for km's ID-based model?

SlateJS needs PathRef because paths shift on every operation. km's IDs are stable.
The only position that shifts is text offset within a node (when text is inserted/removed before it).

Maybe: just auto-adjust selection offset after text operations. No generic Ref system needed.
Or: PointRef only (nodeId + offset), no NodeRef/RangeRef.

TBD — depends on Phase 4 (operation model) and real use cases. Don't over-design.