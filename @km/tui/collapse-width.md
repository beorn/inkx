---
id: "@km/tui/collapse-width"
aliases:
  - km-tui.collapse-width
  - km-tui-collapse-width
created_by: claude:a5c7f7de
created_at: 2026-02-14T15:56:38Z
closed_at: 2026-02-14T23:05:46Z
---

# [x] Collapsed column too wide when selected — overlaps adjacent columns @km/tui #bug #P2 @claude:a5c7f7de

When a column is collapsed, it still renders at its full (uncollapsed) width. The background color and border show the full original width instead of shrinking to a narrow collapsed width. This was previously 'fixed' but the bug persists.

**Symptoms:**
- Collapsed column's selected bg/border extends to full uncollapsed width
- Visually takes the same space as before collapsing

**Expected:** Collapsed columns should shrink to a narrow width (e.g., 3 chars: 2 border + 1 content) with just a collapsed indicator.