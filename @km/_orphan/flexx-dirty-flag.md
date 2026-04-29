---
id: "@km/_orphan/flexx-dirty-flag"
aliases:
  - km-flexx-dirty-flag
created_at: 2026-01-31T08:28:01Z
closed_at: 2026-01-31T09:01:21Z
---

# [x] Implement dirty-flag incremental layout @km/_orphan #task #P2 @claude:b8b4780b

# Dirty-flag Incremental Layout

**Goal:** Skip unchanged subtrees during layout recalculation.

## Problem

Every layout pass recalculates the entire tree, even when only one node changed.

## Solution

Mark nodes dirty on style/content change, propagate up tree, skip clean subtrees:

```typescript
class Node {
  private _isDirty = true;

  markDirty() {
    if (this._isDirty) return;
    this._isDirty = true;
    this._parent?.markDirty();
  }

  calculateLayout() {
    if (!this._isDirty) return; // Skip clean subtrees
    // ... layout logic
    this._isDirty = false;
  }
}
```

## Effort

Medium effort, very high impact for TUI use case (frequent small updates).

## Files

- src/node.ts / node-zero.ts
- src/layout.ts / layout-zero.ts