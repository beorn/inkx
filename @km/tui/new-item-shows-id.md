---
id: "@km/tui/new-item-shows-id"
aliases:
  - km-tui.new-item-shows-id
  - km-tui-new-item-shows-id
created_by: Bjørn Stabell
created_at: 2026-04-06T19:39:27Z
closed_at: 2026-04-06T20:08:27Z
close_reason: "Fixed: e4fcaf793 — getNodeDisplayName uses != null instead of truthiness"
---

# [x] [bug] New empty item displays internal node ID (XWJE24KP) to user @km/tui #bug #P2

After creating a new item (Enter at end of line in edit mode) and pressing Escape, the new item shows its internal ID like (XWJE24KP) instead of being blank.