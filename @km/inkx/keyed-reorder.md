---
mentions:
  - km
  - claude
id: "@km/inkx/keyed-reorder"
aliases:
  - km-inkx.keyed-reorder
  - km-inkx-keyed-reorder
created_at: 2026-02-04T11:23:58Z
closed_at: 2026-02-04T12:48:23Z
assignee: claude:27f1a547
---

# [x] inkx: Keyed children don't render content after reorder during horizontal scroll @km/inkx #bug #P2 @claude:27f1a547

When keyed children are reordered (e.g., during horizontal scrolling with a sliding window), React correctly re-renders all components but inkx's terminal buffer output doesn't include the content for some children. The component IS rendered (React logs show all children), but the text doesn't appear in the terminal output. Workaround: include scroll offset in React key to force remount instead of reorder.

