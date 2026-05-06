---
mentions:
  - km
id: "@km/silvery/edit-cursor-collapse"
aliases:
  - km-silvery.edit-cursor-collapse
  - km-silvery-edit-cursor-collapse
created_by: claude:c9beade3
created_at: 2026-03-13T07:13:18Z
closed_at: 2026-03-13T07:24:58Z
close_reason: "Fixed: moveCursor collapses selection to edge on arrow keys
  (standard editor behavior). Tests in edit-context.test.ts."
owner: bjorn@stabell.org
---

# [x] moveCursor arrow with selection doesn't collapse correctly @km/silvery #bug #P1

Arrow left/right with active selection should collapse to start/end edge respectively. Currently always decrements/increments selectionStart, ignoring selectionEnd. GPT 5.4 review finding.

