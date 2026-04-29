---
id: "@km/inkx/runtime-context"
aliases:
  - km-inkx.runtime-context
  - km-inkx-runtime-context
created_by: claude:d1f60fb4
created_at: 2026-02-27T15:36:31Z
closed_at: 2026-02-27T19:16:37Z
owner: bjorn@stabell.org
assignee: claude:d1f60fb4
---

# [x] RuntimeContext: collapse Input/Stdin/Events contexts into unified runtime @km/inkx #feature #P1 @claude:d1f60fb4

Collapse EventsContext, InputContext, StdinContext into a single RuntimeContext. Phase 1: Add RuntimeContext + useRuntime() + strict useInput. Phase 2: Remove old contexts. Phase 3: Typed bidirectional bus for TEA.