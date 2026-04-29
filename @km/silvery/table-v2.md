---
id: "@km/silvery/table-v2"
aliases:
  - km-silvery.table-v2
  - km-silvery-table-v2
created_by: Bjørn Stabell
created_at: 2026-04-02T21:59:38Z
closed_at: 2026-04-03T01:17:57Z
close_reason: Implemented. Table delegates to ListView with flexbox cell layout.
  12 tests pass. Commit 5ddbe68.
owner: bjorn@stabell.org
---

# [x] Table as ListView composition @km/silvery #task #P2

Rewrite Table as ListView + column headers + cell renderItem. Gets cache/nav/search for free. Column sorting via nav.