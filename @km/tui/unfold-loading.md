---
id: "@km/tui/unfold-loading"
aliases:
  - km-tui.unfold-loading
  - km-tui-unfold-loading
created_by: claude:23485adf
created_at: 2026-02-23T17:14:16Z
closed_at: 2026-02-23T17:22:03Z
---

# [x] Unfold (L) shows loading indicators on current + all right columns @km/tui #bug #P1 @claude:23485adf

When pressing L to unfold a node, the column the card is in AND all columns to the right show loading indicators. Expected: only the affected card should show a loading indicator (if anything), then resolve and render.