---
mentions:
  - km
id: "@km/silvery/static-component"
aliases:
  - km-silvery.static-component
  - km-silvery-static-component
created_by: claude:474834b0
created_at: 2026-03-10T05:32:43Z
closed_at: 2026-03-10T06:00:00Z
close_reason: Static now caches previously rendered items via useRef. Only new
  items invoke children callback. 3 tests.
owner: bjorn@stabell.org
---

# [x] Static component write-once semantics (output above, never re-rendered) @km/silvery #feature #P2

