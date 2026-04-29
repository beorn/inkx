---
id: "@km/inkx/remove-skipbgfill"
aliases:
  - km-inkx.remove-skipbgfill
  - km-inkx-remove-skipbgfill
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:48:04Z
closed_at: 2026-02-09T14:01:08Z
owner: bjorn@stabell.org
assignee: claude:dffe6eeb
---

# [x] content-phase: Consider removing skipBgFill micro-optimization @km/inkx #task #P1 @claude:dffe6eeb

skipBgFill skips background fill when parent already cleared the region. Adds a boolean condition for minimal gain. If performance permits (test suite guards against regression), simplifying to always fill would unify the code path. Deep research recommendation #4.