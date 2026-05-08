---
aliases:
  - km-silvercode.agent-host-l5.03-thread-session-persistence-and-replay
  - km-silvercode-agent-host-l5-03-thread-session-persistence-and-replay
created_at: 2026-05-08T06:22:24.228Z
---

# [/] Thread/session persistence and replay #feature #P0

Split durable Thread from provider Session binding. Persist raw protocol ledgers and local runtime ledgers, support resume/load/reconnect, binding history, replay, idempotency, and crash recovery.

## Ownership

This phase owns durable identity and replay data:

- `ThreadId` is the user-facing workstream identity.
- `SessionBindingId` records provider-specific session/process/server attachment history.
- Raw provider traffic and normalized runtime ledgers are append-only and replayable.
- Replay must be idempotent and preserve event ordering, ids, and binding provenance.

Traffic log UI belongs to phase 09; this phase supplies the durable ledger it replays.

## Complete Criteria

- Resume/load/reconnect tests prove no duplicate turns, messages, tool calls, plans, or jobs after attach.
- Ledger replay tests rebuild equivalent runtime state and ChatTree projection from persisted records.
- The persistence model records every provider binding switch in a Thread without pretending sessions and threads are 1:1.
