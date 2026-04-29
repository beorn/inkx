---
id: "@km/tui/card-click-to-position"
aliases:
  - km-tui.card-click-to-position
  - km-tui-card-click-to-position
created_by: claude:4a5961be
created_at: 2026-03-16T19:24:02Z
closed_at: 2026-03-16T19:51:01Z
close_reason: "Phase 1: click-to-position for title editing. Added onMouseDown
  handler to TreeNode.tsx content Box (above the Text wrapper to avoid
  Box-inside-Text). Uses activeEditContextRef to access the current edit context
  and setCursorOffset. Test helper updated with clickTree() method for
  dispatching silvery tree-level mouse events. New test file:
  click-to-position.spec.ts with 4 tests covering click-at-position,
  click-at-start, click-past-end, and keyboard-after-click. Files: TreeNode.tsx
  (handler), board-test.ts (clickTree helper), click-to-position.spec.ts
  (tests)."
---

# [x] Click-to-position across card tree nodes (card-as-textarea) @km/tui #feature #P2 @claude:4a5961be

When a card is in edit mode, clicking anywhere in the card should position the cursor in the nearest text node, treating the entire card as one logical textarea — even though it's a tree of nodes with separate text regions.

**Challenge**: A card contains a tree of nodes (title, body lines, child nodes). Each may have its own TextInput/TextArea. The click needs to: (1) identify which text region was clicked, (2) position the cursor within that region, (3) if clicked between regions (e.g., on indent/bullet), snap to the nearest text boundary.

**Depends on**: @km/silvery/click-to-position (basic TextInput/TextArea click-to-position must work first).