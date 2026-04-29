---
tags:
  - task
  - P0
mentions:
  - km
id: "@km/silvercode/session-store-trace"
aliases:
  - km-silvercode.session-store-trace
  - km-silvercode-session-store-trace
created_by: claude:2405c72e
created_at: 2026-04-28T19:50:10Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.session-store-trace
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:50:10Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [ ] Status transition trace — silvercode:status logger + dev-mode invariant check @km/silvercode #task #P0 ^session-store-trace

blocks:: [[@km/silvercode]]
parent:: [[@km/silvercode/queue-stuck-thinking-l4]]

**Phase A of the L4 reframe** ([[@km/silvercode/queue-stuck-thinking-l4]]). Bumped P2 → P0 on 2026-04-28 after the 5th recurrence of queue-stuck-thinking in <2 weeks (synthetic-id wedge variant — Burnishing 61s+, MCP children sleeping, no debug log to inspect status). Without this logger, every recurrence is forensics from `ps aux` + `lsof`. Ship this BEFORE Phase B (Turn module) so we have evidence the new state machine actually holds.

Add observability so the next status-corruption regression is caught loudly, not 12 minutes later.

What:

- Wrap every status mutation in session-store.ts apply() with a single helper: setStatus(next, reason: string, eventKind: string)
- The helper emits a debug log line: createLogger('silvercode:status').debug('transition', {from, to, reason, eventKind, turnId})
- Dev-mode invariant check: if NEW status is 'thinking'|'tool-running'|'awaiting-permission' BUT no event with a turnId is in scope, throw in dev (process.env.NODE_ENV !== 'production'); log warn in prod
- Optional: maintain a ring-buffer of last 30 transitions on the session state, exposed via store.state.get().statusTrace for debugging (TUI dev overlay later)

Files: apps/silvercode/packages/agent-harness/src/session-store.ts (single helper + 6-7 callsites)

Acceptance:

- Every status change emits a silvercode:status debug log line with from/to/reason
- Dev-mode invariant violations throw with a stack
- termless test: feeding a stray 'requesting' status event with no active turnId in dev mode throws; in prod returns silently with warn
- bun fix clean, tsc not regressed

