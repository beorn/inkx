---
mentions:
  - km
  - claude
id: "@km/inbox/lumiv"
aliases:
  - km-lumiv
  - "@km/_orphan/lumiv"
created_by: claude:ceb7c9cb
created_at: 2026-03-24T20:05:56Z
closed_at: 2026-03-24T20:13:31Z
close_reason: "Implemented: per-node hovered Reactive<boolean> in
  ReactiveNodeStore with 80ms debounce. Only 2 cards re-render per hover. Commit
  5b7230c4."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] feat: centralized hoveredNodeId with debounce @km/_orphan #feature #P2 @claude:ceb7c9cb

Replace per-card useState hover with a single store-level hoveredNodeId reactive signal. Debounced (~50-100ms) so rapid mouse movement doesn't trigger render cascades. All hover effects (card border, link underline, Cmd+hover armed state) subscribe to this one signal. Only 2 cards re-render per hover change (old card clears, new card highlights).

