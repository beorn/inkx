---
id: "@km/tui/unified-navigate"
aliases:
  - km-tui.unified-navigate
  - km-tui-unified-navigate
created_by: Bjørn Stabell
created_at: 2026-04-02T22:26:25Z
closed_at: 2026-04-02T22:41:43Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Unified navigate(ctx) entry point replacing handleCursorMove switch @km/tui #task #P3 @Bjørn Stabell

Future: single navigate(direction, state, viewTree) function that routes to the right algorithm based on cursor classification. Eliminates the direction-switch in handleCursorMove. ~1 day. Depends on Phase 1+2.