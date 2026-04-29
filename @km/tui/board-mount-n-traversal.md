---
id: "@km/tui/board-mount-n-traversal"
aliases:
  - km-tui.board-mount-n-traversal
  - km-tui-board-mount-n-traversal
created_by: Bjørn Stabell
created_at: 2026-04-18T18:12:11Z
closed_at: 2026-04-18T18:58:16Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.board-mount-n-traversal
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T11:12:11Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.board-mount-n-traversal
    depends_on_id: km-tui.reactive-desc-walk-inversion
    type: supersedes
    created_at: 2026-04-18T11:58:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Optimize board for big repos — full-vault walks on mount @km/tui #bug #P1 @Bjørn Stabell

blocks:: [[@km/tui]], [[@km/tui/reactive-desc-walk-inversion]]

On a 549K-node vault, board mount triggers ~500K unique getChildren calls (2M+ cache accesses in 20s). Each keypress re-walks at 2s/key. Likely cause: countHiddenDescendants or unbounded preloadSubtree traversing the full tree per column. Need lazy/memoized counting and bounded preload.