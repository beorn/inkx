---
mentions:
  - km
id: "@km/inbox/pdaby"
aliases:
  - km-pdaby
  - "@km/_orphan/pdaby"
created_by: claude:66437c43
created_at: 2026-03-02T17:06:01Z
closed_at: 2026-03-02T17:10:35Z
owner: bjorn@stabell.org
---

# [x] Detail pane: Enter during inline edit creates stray board sibling @km/_orphan #bug #P2

When editing a detail pane child (Enter/i), pressing Enter again (TEXT_CONFIRM) calls handleAddNodeAfter(ctx) which uses the board cursor context — creating a sibling of the board's cursor card, not the detail pane child. Fix: in detail pane context, Enter during inline edit just saves and exits.

