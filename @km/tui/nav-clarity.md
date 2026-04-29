---
id: "@km/tui/nav-clarity"
aliases:
  - km-tui.nav-clarity
  - km-tui-nav-clarity
created_by: Bjørn Stabell
created_at: 2026-04-02T22:25:58Z
closed_at: 2026-04-02T23:29:45Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Navigation clarity: unify reducers, consolidate DFS, migrate edit nav to ViewTree @km/tui #epic #P2 @Bjørn Stabell

Three-phase cleanup of navigation architecture to reach quality plateau. Phase 1: unify 3 reducers into applyListNav, consolidate 2 DFS walks into getVisibleDescendants, write navigation-architecture.md. Phase 2: move edit nav (findAdjacentEditNode) to ViewTree. Phase 3: unified navigate() entry point, honor foldDepths in buildViewTree.