---
id: "@km/tui/enter-heading-insert"
aliases:
  - km-tui.enter-heading-insert
  - km-tui-enter-heading-insert
created_by: Bjørn Stabell
created_at: 2026-04-06T19:55:50Z
closed_at: 2026-04-06T20:08:27Z
close_reason: "Fixed: 8046918d8 — new enter_or_zoom command, headings zoom, leaves edit"
---

# [x] [bug] Enter on section heading triggers INSERT mode unexpectedly @km/tui #bug #P2

Repro: Navigate to a section heading card (e.g., Tasks), press Enter. Expected: drill into card or no-op. Actual: enters INSERT mode, changes card to sub-card view, checkbox indicators disappear.