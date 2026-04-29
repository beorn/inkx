---
id: "@km/silvery/console-v2"
aliases:
  - km-silvery.console-v2
  - km-silvery-console-v2
created_by: Bjørn Stabell
created_at: 2026-04-02T21:59:37Z
closed_at: 2026-04-03T01:08:54Z
close_reason: Implemented. Console delegates to ListView, gains cache+search. Commit 7158542.
---

# [x] Console as ListView composition @km/silvery #task #P2

Rewrite Console as ListView + cache:true + followOutput. Auto-caches completed entries. Gets search for free.