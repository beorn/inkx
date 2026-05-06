---
mentions:
  - km
id: "@km/inbox/anu3"
aliases:
  - km-anu3
  - "@km/_orphan/anu3"
created_at: 2026-01-17T22:36:26Z
closed_at: 2026-01-17T22:46:31Z
---

# [x] Audit: Ensure codebase follows unified node architecture @km/_orphan #task #P3

## Summary

Verify and fix any code that deviates from the unified node architecture (KNode/TNode).

## Background

The node architecture was unified in @km/node epic:

- **KNode** - Flat SQLite record with `parent_id`, `link_to`
- **TNode** - KNode extended with `children[]`, `depth`, `childCount`, `isTask`

## Audit Status (2026-01-17)

### ✅ Architecture is Sound

The core architecture is correct. Main findings:

1. **Node types correct** - KNode/TNode used consistently
2. **DBNode removed** - Migration complete
3. **NodeViewModel removed** - UI state in BoardState Sets

### ⏳ Pending Renames (tracked in @km/_orphan/xexz)

- `symlink_to` → `link_to` (clearer naming)
- Remove `source_embedding` (not needed)
- Add `link_alias` for display text

### 📋 Minor Issues

**Multiple tree builders:**

- `apps/km-cli/src/commands/sh.ts` → `kNodeToTNode()`
- `apps/km-tui/packages/km-ink/src/state.ts` → uses KNode + getChildren

Consider consolidating tree building to @km/tree package.

## Related Issues

- @km/_orphan/xexz: Wiki link embeddings (includes symlink→link rename)

## Recommendation

**Close this bead** - Architecture is sound. Rename work tracked in @km/_orphan/xexz.

