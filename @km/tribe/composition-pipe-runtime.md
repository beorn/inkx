---
mentions:
  - km
  - claude
id: "@km/tribe/composition-pipe-runtime"
aliases:
  - km-tribe.composition-pipe-runtime
  - km-tribe-composition-pipe-runtime
created_by: claude:87d20187
created_at: 2026-04-27T08:08:09Z
closed_at: 2026-04-27T09:16:40Z
started_at: 2026-04-27T08:26:22Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-tribe.composition-pipe-runtime
    depends_on_id: km-tribe.refactor
    type: parent-child
    created_at: 2026-04-27T01:08:28Z
    created_by: claude:87d20187
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe.refactor
---

# [x] Decompose tribe-daemon imperative runtime into withX factories @km/tribe #feature #P2 @claude:87d20187

blocks:: [[@km/tribe/refactor]]

Follow-on to @km/tribe/composition-pipe. The pipe foundation is in place; the remaining ~1500 LOC of imperative runtime in tribe-daemon.ts (client registry, chief derivation, broadcast scrubber + coalescer, JSON-RPC handler, socket server, hot-reload, idle-quit, signal handlers) still uses module-level let/const. Decompose into withX factories so the destructured locals (db, stmts, daemonCtx, loreHandlers) go away and the boot is end-to-end pipe(): withMCPServer, withSocketServer, withDispatcher, withSignals, withHotReload, withIdleQuit, withRuntime (run()). Acceptance: tribe-daemon.ts has zero module-level mutable state; await tribe.run() lives in withRuntime. Estimated 1-2 sessions, low risk.

