---
id: "@km/storage/phase-b-session-ops-decision"
aliases:
  - km-storage.phase-b-session-ops-decision
  - km-storage-phase-b-session-ops-decision
created_by: claude:8b5b9e1c
created_at: 2026-04-22T17:30:52Z
closed_at: 2026-04-22T17:30:54Z
close_reason: "Answered by phase-b-replay-contract-2026-04-22.md §10.1 DQ3 row +
  §11 OQ1: session_* ops stay in changes.jsonl tagged, skipped by replay. Reopen
  only if agent tooling needs a separate trace file."
---

# [x] Phase B: session_* ops disposition (audit DQ3/G13) @km/storage #task #P3

blocks:: [[@km/storage/pathway-db-crdt]]

Audit DQ3 / G13: session_started, session_message, session_tool_call, session_ended, and message ops exist in ChangeType but have no-op DB apply handlers. Phase B needs to decide: where do these live in the new oplog?

## Decision (per phase-b-replay-contract-2026-04-22.md §10.1 + §11 OQ1)

Phase B keeps session_* ops in changes.jsonl tagged with type: session_*, SKIPPED by replay (no DB effect). Alternative (parallel .km/session-trace.jsonl owned by agent tooling) remains available as a future refactor if agent-messaging team adopts it.

## Effort
Zero code now. Closed by decision already landed in the Phase B spec. Reopen only if agent tooling needs the split file.

## /complete
- Spec section answers the question
- No implementation required until replay tooling ships