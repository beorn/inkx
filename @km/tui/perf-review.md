---
mentions:
  - km
  - claude
id: "@km/tui/perf-review"
aliases:
  - km-tui.perf-review
  - km-tui-perf-review
created_by: claude:23485adf
created_at: 2026-02-23T17:10:23Z
closed_at: 2026-02-24T07:40:18Z
owner: bjorn@stabell.org
assignee: claude:23485adf
---

# [x] Performance review: board open and zoom-in latency @km/tui #task #P1 @claude:23485adf

Profile and fix board opening and zoom-in latency. Prior analysis showed ~1.9s React reconciliation + 292ms inkx pipeline on initial mount. User reports it's still not fast enough.

