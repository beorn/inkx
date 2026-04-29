---
id: "@km/silvery/selectlist-v2"
aliases:
  - km-silvery.selectlist-v2
  - km-silvery-selectlist-v2
created_by: Bjørn Stabell
created_at: 2026-04-02T21:59:36Z
closed_at: 2026-04-03T00:37:29Z
close_reason: Implemented. SelectList delegates to ListView nav. -23 lines net.
  Disabled-item skipping preserved via onCursor interception.
owner: bjorn@stabell.org
---

# [x] SelectList as ListView composition @km/silvery #task #P2

Rewrite SelectList as thin wrapper over ListView with nav + onChange shorthand. Gets cache/search for free.