---
mentions:
  - km
id: "@km/silvercode/queue-stuck-thinking"
aliases:
  - km-silvercode.queue-stuck-thinking
  - km-silvercode-queue-stuck-thinking
created_by: claude:2405c72e
created_at: 2026-04-28T19:39:52Z
closed_at: 2026-04-28T21:42:27Z
close_reason: L1 fix shipped in 32d71e571 (gate status reducer arm on running
  state). L4 architectural reframe tracked separately in
  km-silvercode.queue-stuck-thinking-l4. The 'blocking'
  km-silvercode.session-store-trace is preventative observability for future
  regressions, not a prerequisite for closing this bug.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.queue-stuck-thinking
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:39:55Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvercode.queue-stuck-thinking
    depends_on_id: km-silvercode.session-store-trace
    type: blocks
    created_at: 2026-04-28T12:50:10Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: "@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/session-\
          store-trace"
---

# [x] Queue stuck — status flips back to 'thinking' minutes after turn-end, all sends queued @km/silvercode #bug #P0

blocks:: [[@km/silvercode]], [[@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/session-store-trace]]

Reproduced 2026-04-28: user's session shows 'silvercode:queue send s1 — queued (status=thinking len=51) +12m' AFTER the previous turn-end fired and tryFlush had drained.

Trace from /tmp/silvercode-55584.log:

- multiple turn-end events, each calling tryFlush — would have set status=idle (session-store.ts:601)
- 12 minutes of silence
- user sends new message → 'queued (status=thinking)'

Something flipped status back to 'thinking' without a user-message in between. The status='thinking' transition happens in three places (session-store.ts):

- line 380: turn-start where event.role === 'assistant' → 'thinking'
- line 556: tool-running → if next.status === 'tool-running' it falls back to 'thinking'
- line 620: case 'status' where event.status === 'requesting' → 'thinking'

Most likely: an ambient/wire-level 'status: requesting' event arrives unsolicited (line 620) and silently re-arms thinking even though no user-message kicked off a turn.

Fix proposals:

1. Don't accept status='requesting' → 'thinking' transition unless there's an active turnId (or unless the previous status was already in-turn).
2. Add a stale-turn timeout: if status has been non-idle for >120s and no new text-delta arrived, auto-recover to idle.
3. Surface a 'stuck' indicator + Esc hint when status has been non-idle for >30s with no recent stream activity.

User workaround: focus empty composer + press Esc → interruptActiveTurn synthesizes turn-end (controller.ts:1662) → status goes idle → queue flushes via the existing turn-end subscribe.

Acceptance:

- Repro: feed a sequence of (turn-start asst, text-delta, turn-end, [12 min later] status:requesting, send) → status stays idle, send goes through (not queued)
- Add diagnostic: silvercode:status logger that traces every status transition with the triggering event kind
- termless test that locks in the fix

blocks:: [[@km/silvercode]], [[@km/silvercode/session-store-trace]]

