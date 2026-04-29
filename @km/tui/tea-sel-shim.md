---
id: "@km/tui/tea-sel-shim"
aliases:
  - km-tui.tea-sel-shim
  - km-tui-tea-sel-shim
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.tea-sel-shim
    depends_on_id: km-tui.tea
    type: parent-child
    created_at: 2026-04-20T23:12:46Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] sel.* compat shim: incremental 226-call-site migration @km/tui #feature #P1

blocks:: [[@km/tui/tea]]

K2.6 critique: 226 sel.* call sites can't migrate atomically. Fix: keep sel.* as compat shim that delegates to withSelection plugin. New code uses plugin pattern; old code keeps working. Migrate sites incrementally across sessions. Delete shim only when grep shows 0 callers. Blocker-breaker for Phase 4 selection. Context: hub/silvery/tea-review-responses.md §7.