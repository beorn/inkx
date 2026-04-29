---
id: "@km/tui/col-title-truncate"
aliases:
  - km-tui.col-title-truncate
  - km-tui-col-title-truncate
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:46:24Z
closed_at: 2026-02-14T22:16:08Z
owner: bjorn@stabell.org
---

# [x] Column title not truncated when wider than column width @km/tui #bug #P2

Column header title overflows column boundary when text is too long. Visible in screenshots: 'Landing the Plane (Session Completio§' — sigil character overlaps column edge. Need to truncate with ellipsis or clip to column width.