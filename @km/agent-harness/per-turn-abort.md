---
id: "@km/agent-harness/per-turn-abort"
aliases:
  - km-agent-harness.per-turn-abort
  - km-agent-harness-per-turn-abort
created_by: claude:2405c72e
created_at: 2026-04-25T06:20:50Z
owner: bjorn@stabell.org
---

# [ ] agent-harness: per-turn abort / interrupt API @km/agent-harness #feature #P2

AgentSession lacks per-turn cancellation. Today only `close()` exists (kills the whole subprocess). Silvercode's Ctrl-B background flow needs a way to cancel a SPECIFIC backgrounded turn without killing the rest of the session.

## What to build

- Add `AgentSession.interrupt(turnId?: TurnId): void` (or `abort()`) that writes `{type:"interrupt"}` (already in AgentInput) to the subprocess stdin.
- Optionally accept a turnId so the harness can match the interrupt to a specific in-flight turn.
- Wire equivalents in spawnSdk and spawnCodex.

## Why

Silvercode (apps/silvercode/src/controller.ts: `cancelBackgroundTask`) currently flips task status to "cancelled" + suppresses the eventual turn-end message, but the underlying subprocess turn keeps running because there is no per-turn abort. See BACKGROUND_MESSAGE_PREFIX path in controller.ts.

## Tracking

Surfaced by @km/silvercode/ctrl-b-background.