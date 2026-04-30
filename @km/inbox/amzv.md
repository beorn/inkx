---
id: "@km/inbox/amzv"
aliases:
  - km-amzv
  - "@km/_orphan/amzv"
created_at: 2026-01-19T15:26:39Z
closed_at: 2026-01-20T00:48:25Z
---

# [x] Eliminate dual-state in TUIContext (state + boardState) @km/_orphan #task #P1

**Problem:** TUIContext contains both:
- `state: BoardState` (legacy column-based)
- `boardState: TreeBoardState` (new tree-based)

This is technical debt. The comment says 'for backward compatibility' but this encourages indefinite stasis.

**Fix:** Complete migration to tree-based state. Remove legacy `state` field and update all consumers to use `boardState` + `layout`.

**Blocked by:** Audit of all TUIContext consumers to identify remaining legacy state usage.