---
id: "@km/inbox/y5atk"
aliases:
  - km-y5atk
  - "@km/_orphan/y5atk"
created_at: 2026-02-01T21:31:08Z
closed_at: 2026-02-04T11:23:58Z
---

# [x] inkx: Keyed children don't render content after reorder during horizontal scroll @km/_orphan #bug #P2

When keyed children are reordered (e.g., during horizontal scrolling with a sliding window), React correctly re-renders all components but inkx's terminal buffer output doesn't include the content for some children. The component IS rendered (React logs show all children), but the text doesn't appear in the terminal output. Workaround: include scroll offset in React key to force remount instead of reorder.