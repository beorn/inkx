---
mentions:
  - km
  - Bjørn
id: "@km/tui/edit-save-broken"
aliases:
  - km-tui.edit-save-broken
  - km-tui-edit-save-broken
created_by: Bjørn Stabell
created_at: 2026-03-31T23:51:23Z
closed_at: 2026-04-01T03:33:54Z
close_reason: "extractProps() was copying data blob to new nodes. data.name from
  source overrode typed text display. Fix: added 'data' to SYSTEM_KEYS. Paste
  handler explicitly preserves data. 5 regression tests."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Enter during inline edit doesn't save text — nodes show (untitled section) @km/tui #bug #P0 @Bjørn Stabell

