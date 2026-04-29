---
id: "@km/_orphan/0hin"
aliases:
  - km-0hin
created_at: 2026-01-20T15:54:12Z
closed_at: 2026-01-20T15:54:40Z
---

# [x] ColumnsView bottom bar truncated - shows 'COLUMNS ...' instead of full indicator @km/_orphan #bug #P2

## Problem
In columns view, the bottom bar view indicator is truncated and just shows "COLUMNS ..." instead of the full view mode indicator.

## Reproduction
1. Open km TUI with a board that has columns view
2. Look at the bottom bar
3. The view indicator shows "COLUMNS ..." with truncation

## Expected
Nothing in the bottom border should be truncated - the full view mode should be visible.

## Related
This may be related to width calculation issues in the bottom bar.