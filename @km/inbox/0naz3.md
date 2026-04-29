---
id: "@km/_orphan/0naz3"
aliases:
  - km-0naz3
created_by: claude:b92140a2
created_at: 2026-03-17T08:32:41Z
closed_at: 2026-03-17T15:04:29Z
close_reason: extractSlotTargets() requires entire content to be slot lines.
  Inline mentions ignored.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P0: Inline \![[./child]] mentions treated as structural slots @km/_orphan #bug #P0 @claude:b92140a2

extractAllSlotTargets() fallback regex matches \![[./child]] anywhere in node content, including prose like 'See \![[./alpha]] later'. This causes unexpected child reordering. Fix: only accept nodes whose content is exclusively slot references (no surrounding text).