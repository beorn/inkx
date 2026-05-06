---
mentions:
  - km
  - claude
id: "@km/tui/wide-terminal-tests"
aliases:
  - km-tui.wide-terminal-tests
  - km-tui-wide-terminal-tests
created_by: claude:65d845d9
created_at: 2026-03-13T06:46:22Z
closed_at: 2026-03-13T06:53:01Z
close_reason: "8 wide-terminal tests added to board-features.slow.spec.ts:
  layout, overflow indicators, navigation at 280 and 320 cols. All 50 tests
  pass."
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] Board acceptance tests at wide terminal sizes (280+ cols) @km/tui #task #P2 @claude:65d845d9

The HVL ceil bug only manifested at specific wider terminal widths. Board acceptance tests only ran at default 120x40, missing width-dependent layout bugs. Add termless integration tests at 280x60 and 320x80 to catch these. Real users zoom out in Ghostty (Cmd+-) which increases cols/rows.

