---
id: "@km/tui/detail-pane-stuck"
aliases:
  - km-tui.detail-pane-stuck
  - km-tui-detail-pane-stuck
created_by: claude:8f007ba9
created_at: 2026-02-20T07:43:27Z
closed_at: 2026-02-20T08:10:43Z
owner: bjorn@stabell.org
---

# [x] Detail pane cannot be closed after opening on link node @km/tui #bug #P1

User reports: after opening detail pane for node 01KHW46QT8PX1493TGWKCME8P6 (a link type node under #w.md with content '\![[^1153560258018235]]'), the detail pane cannot be closed. Pressing backslash or Escape has no effect. May be related to link nodes with unresolved embed references — detail pane state might get stuck.