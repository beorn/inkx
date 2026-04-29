---
id: "@km/tui/escaped-checkboxes"
aliases:
  - km-tui.escaped-checkboxes
  - km-tui-escaped-checkboxes
created_by: claude:8f007ba9
created_at: 2026-02-19T18:53:59Z
closed_at: 2026-02-19T19:04:42Z
---

# [x] Import: escaped checkboxes render as literal text @km/tui #bug #P2 @claude:8f007ba9

282 occurrences of \[\] and \[x\] instead of - [ ]/- [x] across 11 old-format files. Affected files: family-sprint, sprint-2024, sprint-2023-q1, sprint-2023-q3, sprint-2023-q4, product-archive, pers-wellness, fam-apt-pa670-house, product-mgmt, biz-newco-ob-maybe, family-sprint-archive. These render as literal escaped bracket text instead of interactive checkboxes.