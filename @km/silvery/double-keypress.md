---
mentions:
  - km
  - Bjørn
id: "@km/silvery/double-keypress"
aliases:
  - km-silvery.double-keypress
  - km-silvery-double-keypress
created_by: Bjørn Stabell
created_at: 2026-04-10T22:00:45Z
closed_at: 2026-04-10T22:10:24Z
close_reason: "Fixed: run.tsx useInput was missing release event filtering.
  Kitty keyboard protocol sends both press+release for each keypress; the
  simplified useInput in silvery/runtime passed both through to handlers,
  causing double-move. Added key.eventType===release filter (matching ag-react's
  full useInput). Test: key-release.test.tsx 'run.tsx useInput release
  filtering' — verifies press-only semantics."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Double keypress in examples — j moves 2 spaces instead of 1 @km/silvery #bug #P1 @Bjørn Stabell

