---
id: "@km/inkx/findlinestart"
aliases:
  - km-inkx.findlinestart
  - km-inkx-findlinestart
created_at: 2026-02-05T12:50:45Z
closed_at: 2026-02-05T13:00:17Z
assignee: claude:b53ef7e4
---

# [x] fix(inkx): findLineStart mismaps bg segment offsets on wrapped lines @km/inkx #bug #P3 @claude:b53ef7e4

findLineStart fallback (ch === plainLine[0]) too greedy - can map to wrong offset on continuation lines with repeated content.