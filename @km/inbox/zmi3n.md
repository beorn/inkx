---
mentions:
  - km
id: "@km/inbox/zmi3n"
aliases:
  - km-zmi3n
  - "@km/_orphan/zmi3n"
created_by: claude:891e3ce1
created_at: 2026-02-27T16:44:13Z
closed_at: 2026-02-27T16:44:20Z
owner: bjorn@stabell.org
---

# [x] Unified RuntimeContext: collapse input contexts + bidirectional event bus @km/_orphan #feature #P2

Implemented all 3 phases of the RuntimeContext plan: Phase 1 (RuntimeContext + useRuntime + strict useInput), Phase 2 (remove EventsContext, InputContext, StdinContext, AppContext, useStdin), Phase 3 (typed bidirectional on/emit bus with BaseRuntimeEvents). TEA foundation complete.

