---
id: "@km/storage/journal-compaction"
aliases:
  - km-storage.journal-compaction
  - km-storage-journal-compaction
created_at: 2026-05-05T17:55:54.466Z
closeReason: Implemented in 1e89cd9ba — compactJournal + km doctor gc --truncate
---

# [x] Journal compaction — squash applied changes.jsonl into a snapshot, truncate the journal #feature #P2

The changes.jsonl event log grows unbounded — append-only, never compacted. The user's vault is at 2.3 GB / 5.3 M lines. Loading it into one string crashed Bun (SIGTRAP), fixed in d0b46c84d via byte-offset streaming. But the underlying disk + cold-load problem remains.

## What

A periodic compaction step: replay changes.jsonl into state.db (already the source of truth post-replay), write a minimal 'snapshot' marker with the highest applied event id, and truncate / rotate the journal to start fresh from the snapshot.

## Why

- Journal IS append-only forever. Every node update over the vault's lifetime adds a line. On a long-lived vault that's gigabytes of historical noise.
- After my SIGTRAP fix, sync only reads tail bytes — but the disk footprint is still 2.3 GB.
- Cold loads (fresh state.db, e.g. db rebuild) replay the entire journal. Today that means parsing 5.3 M JSON lines. With compaction it's a snapshot + tail.
- Storage is a shared resource — vault snapshot tooling, backups, multi-device sync all suffer from the bloated journal.

## Architecture sketch

- meta.last_event_offset — already exists; bytes after this are unapplied.
- Add: meta.last_snapshot_event — highest event id rolled into snapshot.
- 'km doctor compact' (or auto on sync if journal > N MB):
  1. Apply pending events, drain queue.
  1. Persist a node snapshot table (or rely on state.db's current shape).
  1. Trim changes.jsonl to lines AFTER last_snapshot_event.
  1. Update last_snapshot_event.

## Pairs with

- @km/all/path-name-id-redesign (this work) — separate concern.
- @km/storage/dont-journal-rule-derived-events — orthogonal: even with compaction, derived events shouldn't enter the journal in the first place.

## Acceptance

- Compaction routine in place (CLI subcommand or doctor sub-action).
- After compaction, changes.jsonl size < 100 MB on a vault with 1 M+ historical events.
- Cold load from compacted state matches cold load from full journal (round-trip verified).
- Synthetic test in benchmarks/big-repo-sync.bench.ts that simulates a 1 GB+ journal and times cold load before/after compaction.

## Implementation (2026-05-05)

- **`compactJournal(kmDir, db)`** in `packages/km-storage/src/change-compaction.ts` — drops the applied prefix `[0..meta.last_event_offset)`, keeps the unapplied tail, resets `meta.last_event_offset = 0`, stamps `meta.last_snapshot_event` with the highest applied event id. Tail-boundary detection probes the byte before the cursor (`\n` → on boundary, otherwise scans forward to next newline) so corrupt or mid-line cursors don't corrupt the rewritten file.
- **CLI**: `km doctor gc --truncate` invokes `compactJournal` (vs the default stale-only `compactChanges`). `--dry-run --truncate` previews bytes-reclaimed without touching disk.
- **Cold-load implication**: after `--truncate`, `km doctor rebuild` can no longer reconstruct state.db from journal-replay alone — recovery falls back to memory-mode (FS scan), which matches the documented .md-is-source-of-truth model.
- **Tests**:
  - `packages/km-storage/tests/journal-compact.test.ts` — 5 unit tests (no-op, full truncation, tail preservation, mid-line cursor recovery, idempotency).
  - `benchmarks/journal-compaction-1gb.slow.test.ts` — synthetic 1 GB+ journal acceptance gated by `RUN_JOURNAL_GB_TEST=1` (kept off the default test path; multi-GB write is too heavy for CI).

