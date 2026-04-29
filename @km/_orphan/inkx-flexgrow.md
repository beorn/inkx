---
id: "@km/_orphan/inkx-flexgrow"
aliases:
  - km-inkx-flexgrow
created_at: 2026-02-02T14:32:45Z
closed_at: 2026-02-02T15:17:05Z
assignee: claude:227cdc41
---

# [x] inkx: flexGrow siblings don't measure intrinsic width correctly @km/_orphan #bug #P2 @claude:227cdc41

When using flexGrow={1} (fill) + flexGrow={0} (intrinsic) sibling layout with dynamic content that changes after initial render, inkx/flexx doesn't properly recalculate the layout. The flexGrow={0} child's intrinsic width is cached from the initial render and not updated when content changes.

Example: Status bar with left (fill) + right (fixed content)
- Initial render with "CARDS VIEW" (10 chars): works correctly
- After content changes to "COLUMNS VIEW" (12 chars): layout uses stale width
- Result: right side starts at same position, causing truncation

Root cause investigation:
1. flexx's markDirty() propagates up the tree and clears measure caches
2. inkx's commitTextUpdate() correctly marks ancestors dirty
3. BUT: when layout is recalculated, something caches the old child size

The issue is specific to TRANSITIONS - initial renders work correctly. Likely a stale cache somewhere in the inkx→flexx integration.

Workaround: Calculate width manually with displayWidth() and set explicit widths on both Boxes.

Test: apps/@km/tui/tests/bottom-bar-view.test.ts (press v to switch view)
Debug: apps/@km/tui/tests/bottom-bar-debug.test.ts (shows x position stays at 62 after transition)