---
id: "@km/tree/invariants"
aliases:
  - km-tree.invariants
  - km-tree-invariants
created_by: Bjørn Stabell
created_at: 2026-04-01T18:41:58Z
closed_at: 2026-04-01T19:51:23Z
close_reason: Implemented. withValidation (wraps mutations, calls validate,
  gated by KM_STRICT), withTreeValidation (block-has-children, orphan-node,
  invalid-sort-order), withBatch. 13 tests.
---

# [x] Tree invariant checker — validateNode / validateTree after mutations @km/tree #task #P2 @Bjørn Stabell

Slate-style post-mutation validation for the node tree. NOT normalization (don't silently fix) — check and throw/log violations.

Invariants to check:
1. Blocks (item: false) must not have children
2. parent_id must point to existing node (or '.' for root)
3. No circular parent references
4. parent_idx must be finite (not NaN/Infinity)
5. No duplicate parent_idx among siblings
6. Item-specific: task_marker implies task_status and vice versa
7. Item-specific: embed_source node must exist (or null)
8. Structural: column children must be items (not blocks at column level)

Run modes:
- After every tree mutation in dev/test (like KM_STRICT=1)
- On vault load (catch corrupted data)
- On demand via CLI (km doctor)

Location: packages/@km/tree/src/validate.ts
Inspired by: SlateJS normalizeNode, but check-only (no auto-fix).