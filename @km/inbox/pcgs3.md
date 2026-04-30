---
id: "@km/inbox/pcgs3"
aliases:
  - km-pcgs3
  - "@km/_orphan/pcgs3"
created_by: claude:66437c43
created_at: 2026-03-02T07:55:26Z
closed_at: 2026-03-02T18:05:22Z
owner: bjorn@stabell.org
assignee: claude:66437c43
---

# [x] Detail pane as board pane with 'detail' view mode @km/_orphan #feature #P0 @claude:66437c43

Unify detail pane into BoardPaneState with viewMode: 'detail' and parentPaneId. Removes separate DetailPaneState type, gives detail pane standard board navigation for free (block nav, first/last, etc).