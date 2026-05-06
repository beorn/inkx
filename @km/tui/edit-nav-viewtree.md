---
mentions:
  - km
  - Bjørn
id: "@km/tui/edit-nav-viewtree"
aliases:
  - km-tui.edit-nav-viewtree
  - km-tui-edit-nav-viewtree
created_by: Bjørn Stabell
created_at: 2026-04-02T22:26:23Z
closed_at: 2026-04-02T22:41:00Z
close_reason: Migrated findAdjacentEditNode and findDeepestLast from
  repo-walking to ViewTree. All edit nav uses viewIndex as single source of
  truth. All 90 inline-edit + 1531 km-tui tests pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Move edit navigation (findAdjacentEditNode) to ViewTree @km/tui #task #P2 @Bjørn Stabell

findAdjacentEditNode walks repo with extractBody().items, ignoring visibility model. Should use ViewTree adjacency like all other nav. Also removes findDeepestLast (use TreeWalk.nodes reverse). ~2 hours.

