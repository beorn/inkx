---
mentions:
  - km
  - claude
id: "@km/inkx/render-barrier"
aliases:
  - km-inkx.render-barrier
  - km-inkx-render-barrier
created_by: claude:9b6678d0
created_at: 2026-02-11T19:49:47Z
closed_at: 2026-02-11T22:59:24Z
owner: bjorn@stabell.org
assignee: claude:9b6678d0
---

# [x] Event loop render barriers for mode-changing events @km/inkx #feature #P3 @claude:9b6678d0

processEventBatch runs ALL handlers before render. This breaks editing operations where Enter creates a new InlineEditField but the next event needs its ref. Other TUI frameworks (Bubbletea, curses) render after every event. React has flushSync for this. Approach: let handlers return a 'needsRender' signal that causes processEventBatch to do a mid-batch doRender(). Only needed for mode-changing events (Enter/Escape in edit mode), not navigation (j/k). Batching still works for repeated idempotent keys. Deep research: /tmp/llm-9b6678d0-1770867812455-43qq.txt

