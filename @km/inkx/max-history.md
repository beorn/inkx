---
id: "@km/inkx/max-history"
aliases:
  - km-inkx.max-history
  - km-inkx-max-history
created_by: claude:fa5431cd
created_at: 2026-03-03T09:56:55Z
closed_at: 2026-03-07T02:12:07Z
close_reason: "Grooming: already implemented — maxHistory prop in ScrollbackView.tsx"
owner: bjorn@stabell.org
assignee: claude:fa5431cd
---

# [x] ScrollbackView maxHistory: frozen→static promotion with visual separator @km/inkx #feature #P2 @claude:fa5431cd

Implement the maxHistory lifecycle in ScrollbackView. When cumulative frozen lines exceed maxHistory, oldest frozen items are promoted to 'static' (data dropped, terminal owns them, not re-renderable on resize). Add a visual separator line at the boundary between static and dynamic scrollback. Update the demo to showcase this with a low maxHistory threshold.