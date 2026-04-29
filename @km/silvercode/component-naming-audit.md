---
id: "@km/silvercode/component-naming-audit"
aliases:
  - km-silvercode.component-naming-audit
  - km-silvercode-component-naming-audit
created_by: claude:2405c72e
created_at: 2026-04-26T04:54:57Z
closed_at: 2026-04-26T06:38:18Z
close_reason: "Shipped: 45826e3b6 (DetectionText→LinkifiedText) +
  HistoryView→HistoryDialog + 9aadf4feb. 14 import callsites updated. Sub-dir
  grouping deferred to a separate bead with worktree isolation. Session:
  km-session.0425-evening"
started_at: 2026-04-26T05:19:50Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.component-naming-audit
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T21:55:08Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] silvercode component naming + ergonomics audit @km/silvercode #task #P3 @claude:2405c72e

blocks:: [[@km/silvercode]]

Rename DetectionText→LinkifiedText, HistoryView→HistoryDialog. Optional sub-dir grouping: blocks/, dialogs/, panes/, text/. Sed-rename + import sweep + 1-page architecture doc. Parent: @km/silvercode.