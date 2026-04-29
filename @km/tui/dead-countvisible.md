---
id: "@km/tui/dead-countvisible"
aliases:
  - km-tui.dead-countvisible
  - km-tui-dead-countvisible
created_by: Bjørn Stabell
created_at: 2026-04-02T22:07:19Z
closed_at: 2026-04-02T22:09:40Z
---

# [x] Remove likely-dead countVisibleDescendants @km/tui #task #P3 @Bjørn Stabell

countVisibleDescendants in board-app.ts:1125-1149 is called once (line 386-387) to populate ActionCtx but never read afterward. Likely dead code from pre-ViewTree era. Verify no consumers then remove.