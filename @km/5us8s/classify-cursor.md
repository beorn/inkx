---
id: "@km/5us8s/classify-cursor"
aliases:
  - km-5us8s.classify-cursor
  - km-5us8s-classify-cursor
created_by: claude:66437c43
created_at: 2026-03-02T23:10:58Z
closed_at: 2026-03-02T23:11:05Z
owner: bjorn@stabell.org
assignee: claude:66437c43
---

# [x] Add classifyCursor to ViewNavigation interface @km/5us8s #task #P2 @claude:66437c43

Move cursor classification from inline isDetail hack in SELECT fast path to view-owned classifyCursor method on ViewNavigation. Cards view delegates to deriveCursorAncestors, detail view returns flat card classification. Export getViewNavigation() lookup for use outside board-app.ts.