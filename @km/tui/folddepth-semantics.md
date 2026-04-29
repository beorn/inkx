---
id: "@km/tui/folddepth-semantics"
aliases:
  - km-tui.folddepth-semantics
  - km-tui-folddepth-semantics
created_by: Bjørn Stabell
created_at: 2026-04-02T22:07:16Z
closed_at: 2026-04-02T22:10:41Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Document foldDepth vs isCollapsedChild — two visibility systems that don't agree @km/tui #task #P2 @Bjørn Stabell

ViewTree uses isCollapsedChild() for structural exclusion at construction. Navigation uses foldDepths Map for depth-limited walks. ViewTree accepts foldDepths but never uses it. Need design doc clarifying when each applies. foldDepth is visual-only (rendering), isCollapsedChild is structural (tree pruning).