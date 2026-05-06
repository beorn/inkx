---
mentions:
  - km
id: "@km/all/reactive-tree-library"
aliases:
  - km-all.reactive-tree-library
  - km-all-reactive-tree-library
created_by: Bjørn Stabell
created_at: 2026-04-18T19:01:48Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.reactive-tree-library
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-18T12:01:48Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Extract reactive-graph as vendor/reactive-tree — infrastructure library @km/all #feature #P2

blocks:: [[@km/all]]

Reframing (from /big 2026-04-18): @km/tui's reactive-graph is really a materialized-view engine over a tree. Every km perf crisis has been 'O(N) walk → maintained index' (name-index, countDescendantsAtDepth, sparse ancestor index). Extract as a standalone infrastructure library.

