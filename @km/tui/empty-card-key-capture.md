---
id: "@km/tui/empty-card-key-capture"
aliases:
  - km-tui.empty-card-key-capture
  - km-tui-empty-card-key-capture
created_by: Bjørn Stabell
created_at: 2026-04-06T19:39:26Z
closed_at: 2026-04-06T20:08:27Z
close_reason: "Fixed: 45b6db03e — clear orphaned text selection in buildCommandContexts"
owner: bjorn@stabell.org
---

# [x] [bug] Empty card heading captures nav keys as text input — data corruption @km/tui #bug #P1

Pressing k/j/etc on a card with no children (like an empty section heading) enters edit mode and types the key into the heading text. Expected: navigate. Actual: data corruption.