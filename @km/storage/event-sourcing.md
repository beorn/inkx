---
mentions:
  - km
id: "@km/storage/event-sourcing"
aliases:
  - km-storage.event-sourcing
  - km-storage-event-sourcing
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:12Z
closed_at: 2026-04-02T22:20:55Z
close_reason: "Shipped: Emitter split into commit() + project(). commit() does
  DB+persist+broadcast (no FS). project() does FS only. emit() wraps both for
  backwards compat. Reconciliation uses commit() directly — structural echo
  prevention. origin field added to Event type. 7 tests. Commits 08c180ca,
  1a9f9d9d."
owner: bjorn@stabell.org
---

# [x] Decouple emitter into EventLog + StateDB + Projections @km/storage #task #P2

Decouple emitter into commit + projection (event-sourcing-lite).

PRO RECOMMENDATION:
Split emitter into two stages:

1. COMMIT: DB apply + durable event log + broadcast
2. PROJECT: async FS projector (subscribes to events, writes files)

TUI PATH:
  TUI action → command → commit to DB/event log → broadcast → mark dirty → FS projector writes → update sync_state.baseline_hash

EXTERNAL EDITOR PATH:
  watcher → observation (path, hash) → if hash == baseline: drop → else parse → commit with origin='fs' → update baseline_hash → DO NOT re-project to FS

WHY THIS BREAKS ECHO LOOPS:

- Watcher never directly causes filesystem writes
- Emitter never mixes commit + projection for all origins
- Projections are idempotent, safe to replay

REDUCES 5 SUPPRESSION LAYERS TO 2 PRIMITIVES:

1. Single per-path sync actor/queue
2. Persisted baseline hash/revision

PRO WARNING: 'Biggest hidden risk is emitter unification — if FS-originated reconciliation starts using the same emitter that also projects back to FS, you can reintroduce loops.'

ALSO ADD: origin: 'tui' | 'fs' | 'replay' on all events for typed loop prevention.

NOTE: events.jsonl should be best-effort debug/export. SQLite is the authority. Don't pretend events.jsonl is transactionally tied to DB.

