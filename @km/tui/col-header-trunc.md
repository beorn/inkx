---
id: "@km/tui/col-header-trunc"
aliases:
  - km-tui.col-header-trunc
  - km-tui-col-header-trunc
created_by: claude:fcaad2fa
created_at: 2026-02-18T16:01:00Z
closed_at: 2026-02-19T08:23:56Z
---

# [x] Column headers truncated: missing last character (SCHEDUL, PORTFOLI) @km/tui #bug #P2

Column headings are missing the last letter. Examples from Asana import: 'FAMILY SCHEDUL' (should be SCHEDULE), 'PORTFOLI' (should be PORTFOLIO). Likely off-by-one in width calculation for column header text truncation.