---
id: "@km/storage/events-table-replaces-jsonl"
aliases:
  - km-storage.events-table-replaces-jsonl
  - km-storage-events-table-replaces-jsonl
created_at: 2026-05-05T19:13:05.650Z
---

# [ ] Move changes.jsonl into a state.db events table — eliminate dual-store drift #refactor #P2

The recurring sync-perf bugs (SIGTRAP on 2.7 GB jsonl read, 52 s no-op syncs from cursor not advancing, mtime drift causing re-parse churn) all share a root cause: **state.db and changes.jsonl are two stores with no atomic-transaction story**. The byte-offset cursor that's supposed to keep them in sync drifts because two code paths (`loader.ts:discoverFromChanges` + `apps/km-cli/src/commands/sync.ts`) both read the journal but only one writes the cursor.

## What

Move events into a SQLite table inside `state.db`. Eliminate `changes.jsonl` entirely. SQLite WAL handles durability for both nodes and events in one transaction; they cannot drift by construction.

## Why (validated by /pro 2026-05-05, 4-leg dispatch, $2.01)

GPT-5.4 Pro, Kimi K2.6, Claude Opus 4.6, Gemini 3 Pro all converged: this is the right architecture for km. Strongest argument: in WAL mode SQLite **cannot** give atomic multi-file transactions. So as long as `changes.jsonl` and `state.db` are separate files, drift is structurally possible. One file = no drift = entire bug class deleted.

Other wins:
- Cold load: instant (open state.db) instead of replay 5.3M events.
- Audit query: `SELECT * FROM events WHERE ts > ?` indexed SQL, sub-10 ms.
- Backup: one file via `VACUUM INTO`.
- Compaction: `DELETE FROM events WHERE ts < ?` then `PRAGMA incremental_vacuum`.
- CRDT path: `SELECT * FROM events WHERE hlc > peer.last_seen` is the wire protocol — no extraction step.

## Sizing

- Today: 1.2 GB state.db + 2.7 GB changes.jsonl = **3.9 GB**.
- After (90-day retention, by-key compaction): **~1.4 GB** total.
- Floor with aggressive compaction + `node_created` forever: **~800 MB**.

## Schema (consensus from 4 LLM legs)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA auto_vacuum = INCREMENTAL;  -- MUST be set on fresh DB before tables
PRAGMA foreign_keys = ON;

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,    -- monotonic cursor (cheap int compare)
  id  TEXT UNIQUE NOT NULL,                 -- ULID for global identity
  hlc TEXT,                                 -- Hybrid Logical Clock for CRDT (NULL until adopted)
  ts  INTEGER NOT NULL,                     -- ms since epoch (retention + display)
  v   INTEGER NOT NULL DEFAULT 1,           -- payload schema version
  type    TEXT NOT NULL,                    -- node_created, node_updated, ...
  actor   TEXT NOT NULL,                    -- machine/user identity
  peer_id TEXT,                             -- originating peer when synced
  source  TEXT,                             -- fs-import, etc.
  target  TEXT,                             -- node_id, nullable
  data    TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE INDEX events_ts_idx     ON events(ts);
CREATE INDEX events_target_idx ON events(target, ts);
CREATE INDEX events_type_idx   ON events(type, ts);
CREATE INDEX events_cursor_idx ON events(hlc, seq);
```

## Failure modes flagged by /pro

1. **`cp state.db` is NOT safe in WAL mode** — copies a partial database. Use `VACUUM INTO` for backup. Update any backup tooling.
2. **`auto_vacuum = INCREMENTAL` must be set BEFORE any tables exist.** Current state.db can't be retrofitted without one offline `VACUUM` rewrite. Build new state.v2.db with the pragma, atomic-rename swap.
3. **`PRAGMA busy_timeout = 5000` on every connection.** km-cli, km-tui, silvercode all writing concurrently → without timeout, hit SQLITE_BUSY.
4. **Migration must be resumable**: batch 10K rows/txn, track offset in meta, don't delete jsonl until verified. WAL bloats if a single 5.3M-row tx is attempted.
5. **Tombstone retention vs CRDT**: don't compact events that haven't been synced to all known peers. Trivially satisfied today (zero peers).

## Retention policy default

Tiered (consensus):
- 0-30 days: keep all events.
- 30-90 days: keep latest per `(target, type)` only (by-key compaction).
- `node_created` events: forever (~5K total, ~1MB, enables "when did I first write this?").
- 90+ days for everything else: drop OR archive to monthly `state.snapshot.YYYY-MM.db` via `VACUUM INTO`.

Configurable via `kmConfig.events.retentionDays`.

## CRDT readiness

The schema is CRDT-ready: `hlc` column nullable today, populated when multi-device sync arrives. `peer_id` distinguishes own events from synced events. `actor` is mandatory for causal ordering.

When CRDT lands: evaluate `cr-sqlite` (vlcn.io) — SQLite extension that adds CRDT semantics to ordinary tables. Could obsolete the hand-rolled events-as-wire-protocol if adopted. The events table can coexist as audit log if not.

## Migration plan

1. Create `state.v2.db` with `auto_vacuum = INCREMENTAL` pragma and the events table.
2. Copy `nodes` / `links` / FTS schema; do an FS scan to repopulate.
3. Import last 90 days of `changes.jsonl` in 10K-row batches with progress checkpoint.
4. Validate row counts + spot-check by sampling days.
5. Atomic rename swap: `state.db` → `state.db.bak`; `state.v2.db` → `state.db`.
6. Run for 1 week. If green, archive `changes.jsonl` to `archive/changes.YYYY-MM-DD.jsonl.gz`, then remove.
7. Delete: `meta.last_event_offset`, `meta.last_snapshot_event`, `compactJournal`, `compactChanges`, `km doctor gc --truncate`, the change-compaction module, `apps/km-cli/src/commands/sync.ts`'s journal-tail-read code.

## Acceptance

- `events` table populated; `changes.jsonl` removed.
- All `applyChangeWithDb` calls write events row + nodes row in ONE transaction.
- Property test: rebuild via FS-scan vs rebuild via events-replay produces identical state.db.
- Backup is `VACUUM INTO`; documented.
- `km sync` no-op stays at ~1.2 s on the user's vault.
- Cold load (`km doctor rebuild`): <5 s on the user's vault.
- Steady-state state.db < 2 GB on the user's vault.

## Pairs with / supersedes

- **Supersedes** @km/storage/journal-compaction (ships `--truncate` as the lossy sledgehammer; with this, no compaction needed because no separate file).
- **Supersedes-in-spirit** @km/storage/dont-journal-rule-derived-events (already shipped narrow fix; events-table makes the broader concern moot).
- **Pairs with** @km/storage/incremental-rule-eval — orthogonal, both ship.
- **Foundation for** future @km/all/crdt-multi-device-sync.

## Effort

3-5 packages (km-storage, km-cli, km-fs-mount, km-infra/scripts, docs). 5-7 commits over a week. Most of the work is the property test + migration script, not the new code. Net negative LOC after deletion of journal plumbing.

## /pro evidence

Full transcript: `/var/folders/x6/0j792q0d0411wgsxyr1bqkp40000gn/T/llm-f9eb64dc-review-the-events-as-w50a.txt`. Cost: $2.01. Winner: GPT-5.4 Pro (19.7/20 from gpt-5-mini judge). All four legs converged.
