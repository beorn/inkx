---
id: "@km/silvercode/session-store-trace"
aliases:
  - km-silvercode.session-store-trace
  - km-silvercode-session-store-trace
created_by: claude:2405c72e
created_at: 2026-04-28T19:50:10Z
---

# [ ] Status transition trace — silvercode:status logger + dev-mode invariant check @km/silvercode #task #P2

blocks:: [[@km/silvercode]]

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