# Phase B Replay Contract (2026-04-22)

Status: spec. Design reference for the Phase B oplog implementation.

Bead: `km-storage.phase-b-replay-contract-spec` (P1).

Upstream:
- `hub/km/storage-architecture.md` §9 Phase B — pathway framing
- `hub/km/research/op-vocabulary-audit-2026-04-22.md` — op-surface audit that surfaced DQ1–DQ5

This doc answers DQ1–DQ5 so Phase B can be scheduled as a persist-and-replay implementation task rather than a design exercise. It is self-contained; cross-references exist for provenance, not for comprehension.

---

## 1. Scope

### 1.1 What Phase B is

Phase B persists km's existing `emitter.apply()` stream to an append-only, compactable, snapshot-ready **oplog**, and provides tooling to replay that log back into a fresh `state.db`. It is a shippable milestone between Phase A (FS-is-truth, today) and Phase C (DB-as-truth flip).

Concretely, Phase B delivers:

| Deliverable | What it does |
|---|---|
| Oplog on disk | Every content op in `state.db` has a durable, append-only journal entry |
| Compaction + snapshot | Oplog stays bounded; snapshot captures full state at a point |
| `km doctor replay-from-snapshot` | Rebuild `state.db` from (snapshot + ops since) |
| `km doctor verify-oplog-integrity` | Cross-check oplog against live `state.db` |
| Op-surface closure | Every DB-mutating path routes through `emitter.apply()` |

### 1.2 What Phase B is not

Phase B is not:

- **A flip of the truth contract.** FS remains authoritative for user content. `.md` files are still read/written as today. The oplog is a parallel record of *intent*, not a replacement for FS.
- **A cross-peer sync protocol.** Ops are local; exchanging ops between peers is a Phase C/D concern. Phase B is single-peer durability + recovery.
- **Fine-grained keystroke history.** km already collapses text edits to one `node_updated` per save boundary (TEXT_CONFIRM / TEXT_EXIT_EDIT / linebreak). The oplog inherits that granularity. See Phase A's TEA state machines for why.
- **A schema migration log.** Schema migrations (`migrateSchema`, `migrateData` in `db/schema.ts`) are pre-oplog operations. See §6.
- **A UI action log.** `BoardOp`, `NavOp`, `DialogOp`, `PaneOp`, `ViewOp`, `TextEditOp` never touch `emitter.apply()` and are explicitly excluded (see the audit §"UI/app ops").

### 1.3 Phase B ↔ Phase A relationship

Phase B's oplog is a superset of today's `changes.jsonl` file, with retention + replay contracts added (see §2 for the file layout decision). Today's journal already records every `Change` through `emitter.apply()`; Phase B fills the op-surface gaps (audit Gaps G1–G9) and adds structure on top.

Implementation-wise, Phase B is:

- **Op-surface closure** (2–3 person-weeks; audit Gaps G1–G9) — prerequisite work landing as its own beads
- **Oplog layout + compaction + snapshot format** (this spec) — 1–2 person-weeks
- **Replay tooling + verification** (this spec §8) — 1 person-week
- **Test + hardening** (property tests, recovery drills) — 1 person-week

Rough total: 5–7 person-weeks after Phase A lands. The audit + this spec are the design prerequisites; both now exist.

### 1.4 Phase B ↔ Phase C relationship

Phase B's oplog is also Phase C's mutation log. Once Phase C flips DB to truth, FS becomes a projection of the same ops, rather than a parallel truth co-written by `emitter.apply()` subscribers. **Phase B's design decisions must not rule out Phase C**, specifically:

- Ops carry enough information to regenerate FS content from DB (already true for `node_created` / `node_updated` / `node_moved`; `node_deleted` carries an `item` snapshot at op-emit time, see audit).
- Ops reference stable NodeIds only — no ephemeral in-memory handles.
- The oplog replay algorithm is idempotent against a snapshot.

Phase B does **not** need to solve the Phase C problems: conflict-resolution UX, FS projection strategy, DB-query-to-FS-patch mapping. Those are §9 out-of-scope.

---

## 2. Oplog vs changes.jsonl (DQ1)

### 2.1 Today's changes.jsonl

`changes.jsonl` lives at `<kmDir>/changes.jsonl`. It is append-only JSONL, one `Change` record per line:

```jsonc
{"id":"01HKXB2W...","ts":1713737200000,"type":"node_updated","actor":"user","target":"01...","data":{"title":"New title"}}
```

It is written by `emitter.commitInternal()` (`packages/km-storage/src/emitter.ts`) after every `apply()` or `commit()`, unless `skipPersist` is set. It carries all seven content op types (`node_*`, `task_*`) plus no-op-on-DB entries (`session_*`, `message`, `conflict_created`).

Today's `changes.jsonl` has three jobs mixed in one stream:

1. **Content op log** — the seven content ops that mutate `state.db`.
2. **Agent/session trace** — `session_*` and `message` entries, which never touch `state.db` and serve as a cross-session messaging log.
3. **FS-watch audit** — content ops with `actor: "fs-watch"`, representing external FS edits reconciled back into DB.

Today this works because nothing replays the file. Reads are diagnostic; the authoritative state is `state.db`. In Phase B the file becomes a real durability + replay substrate, which forces these three jobs to be distinguishable.

### 2.2 Phase B oplog: is it the same file?

**Decision: Phase B extends `changes.jsonl` in place rather than introducing a parallel log.** Specifically:

- The file at `<kmDir>/changes.jsonl` remains the write target for all `emitter.apply()` content ops.
- A new `<kmDir>/snapshots/` directory holds periodic full-state snapshots.
- A small `<kmDir>/oplog-meta.json` tracks the last-snapshot checkpoint, the current segment, and compaction state.
- The three embedded streams (content, agent, FS-watch) are distinguished by existing fields (`type`, `actor`), not by separate files.

**Rationale:**

- **One write path**: the emitter already writes `changes.jsonl` on every `apply()`. Keeping that single sink avoids a dual-write correctness risk (DB ahead of one log but not the other). The audit flagged G3's hand-rolled journalRename precisely because *a second write path* existed; adding a second file generally would re-introduce that class of bug.
- **One file to grep**: users who already look at `.km/changes.jsonl` continue to. Observability wins, consistent with "observability is first-class."
- **Migration is a no-op**: existing `changes.jsonl` becomes "pre-compaction oplog segment 0000." No format conversion; just new retention + snapshot semantics layered on top.
- **The alternative (parallel `.km/oplog/`)** is cleaner in isolation but buys nothing: we'd still need to grep both files for a full picture, still need to reason about ordering across them, and the pre-B file is already the canonical answer.

### 2.3 Retention + compaction policy

Today: append-forever. No compaction. A long-lived vault accumulates megabytes of ops per week of active use.

Phase B introduces segmented + compacted retention:

| Artifact | Location | Role | Retention |
|---|---|---|---|
| Active segment | `<kmDir>/changes.jsonl` | Current append target | Rotated on size/time/ops thresholds |
| Archived segments | `<kmDir>/oplog/changes-NNNN.jsonl` | Past ops since last snapshot | Kept until next compaction |
| Current snapshot | `<kmDir>/snapshots/snapshot-NNNN.jsonl` | Full state at checkpoint | One current + one prior retained (safe-rollback window, §7.5) |
| Meta file | `<kmDir>/oplog-meta.json` | Index: last snapshot id, current segment, ops-since-snapshot count | Single record, rewritten on each checkpoint |

**Rotation triggers** for the active segment (any of):

- Size ≥ 10 MB
- Age ≥ 7 days
- Ops count ≥ 10,000

**Compaction** runs after rotation if the oldest non-snapshot segment is older than the safe-rollback window (§7.5). Compaction produces a new snapshot (§2.4) from the current `state.db`, then deletes segments older than the prior snapshot.

All thresholds are configurable via `<kmDir>/config.toml`; defaults chosen to keep steady-state oplog + snapshot size ~50 MB for a 5k-file active vault.

### 2.4 Snapshot format

A snapshot is a full replay-ready representation of `state.db` at a point in time. Format: JSONL, one synthesized `node_created` change per row in `nodes`, plus one `meta_checkpoint` marker at the top:

```jsonc
// First line: checkpoint metadata
{"type":"snapshot_checkpoint","id":"01HKSNAP...","ts":1713737200000,"schema_version":5,"data_version":2,"last_change_id":"01HKXB2W...","node_count":5421}

// Subsequent lines: materialized node_created ops with origin: "snapshot"
{"id":"01HKXB2W-synth-01","ts":1713737200000,"type":"node_created","actor":"system","origin":"snapshot","target":"01...","data":{...full NodeCreatedData...}}
```

Snapshot properties:

- **Self-contained replay**: replaying a snapshot into an empty `state.db` produces the state the snapshot captured, modulo FTS + link-cache rebuild (§7.4).
- **Synthesized op IDs**: op ids in a snapshot are deterministic hashes of `(snapshot_id, node_id)` so re-taking a snapshot against the same DB state is idempotent.
- **`schema_version` + `data_version` gated**: a snapshot taken against schema v5 / data v2 is unreadable by schema v6 / data v3. Mismatches force a rebuild-from-FS (§6.3).
- **No derived state**: links, FTS, rules-materialized embed children are rebuilt after replay — snapshots are node rows only. Keeps snapshot size proportional to node count, not to index size.

---

## 3. Replay contract (DQ2)

### 3.1 Replay-against-snapshot, not replay-from-epoch

**Decision: Phase B oplog replay is defined as "snapshot + ops since snapshot," never "all ops from the beginning of time."** Replaying ops into an empty DB is not a supported operation.

Replay algorithm:

```
1. Load snapshot-N into fresh state.db (applying synthesized node_created ops)
2. Replay changes-NNNN.jsonl segments (N, N+1, …) in order
3. Apply the tail of the active changes.jsonl up to the desired replay point
4. Rebuild derived state (FTS, links, rules-materialized embeds) from node content
5. Fix-up fs_mtime / fs_ino for any rows whose FS counterpart has drifted
```

The replay point defaults to "current"; replay tooling allows a timestamp or change-id cutoff for point-in-time recovery.

### 3.2 Why node_deleted breaks replay-from-epoch

The audit flagged this as the killer objection to epoch-replay: `node_deleted` is implemented as a recursive-CTE subtree delete (`db/ops.ts:114`, via `applyNodeDeleted` in `db/changes.ts:209`). Replaying it against an empty DB is a no-op — there's nothing to delete.

This is not a bug. It's the right design for a content log: the op records *intent* ("delete this subtree"), and that intent evaluates against live state. But it means the log is not a self-contained history; it's a delta over the last known state.

Concretely, consider:

```
t0: node_created "A"
t1: node_created "B" (parent=A)
t2: node_deleted "A"   // deletes A and B via recursive CTE
t3: node_created "C"
```

Against an empty DB, replaying t0→t3 produces `{A, B, C}`, not `{C}`. The delete at t2 finds A (good) but deleting A's subtree produces a different outcome depending on whether the "B created at t1" actually materialized in the DB at the moment t2 was first applied (live) vs replayed (from empty with different ordering guarantees).

In practice ordering is preserved in a single-actor log, so the outcome matches — until any of the following enter the picture:

- Ops are reordered or replayed partially
- Rules-materialized embed children appeared between t1 and t2 (the rule engine creates them based on links; these are auto-generated and the `node_deleted` would have captured them in its subtree sweep)
- Schema-driven cascades change between the op's live-apply and its replay

The snapshot-first idiom sidesteps all of this.

### 3.3 The snapshot-first idiom

**Rule**: every replay starts from a snapshot. To replay from 30 days ago, ensure you kept a snapshot from 30 days ago or earlier. To replay from "the beginning," you must have a snapshot at "the beginning" (taken at first-boot, before any ops).

Consequences:

- **Snapshot on first boot**: `km init` / first `state.db` creation produces a `snapshot-0000` (the empty snapshot) so the oplog always has a basepoint. For existing vaults migrating into Phase B, the migration step produces `snapshot-0000` from the current `state.db`.
- **Snapshots are durable**: snapshots predate any ops they gate. Lose a snapshot and the ops after it are replayable only if a later snapshot exists.
- **Compaction must be snapshot-driven**: you cannot delete segment-N until you have snapshot-(N+1) or later.

### 3.4 Replay determinism invariants

For replay to produce the same `state.db` as live application, the following must hold:

| Invariant | How enforced |
|---|---|
| Ops are pure JSON, no live references | Audit §"Serializability audit" — confirmed for all content ops |
| `ts` comes from op, not Date.now() at replay | `applyChangeWithDb` reads `change.ts`, not fresh timestamp (audit §node_created, §node_updated) |
| ULIDs come from op, not re-minted | `change.id` is the authoritative id; replay never calls `ulid()` |
| Ordering matches emit order | Segments are append-only; replay follows file order |
| Snapshot captures all rows present at checkpoint | Snapshot producer iterates `SELECT * FROM nodes`; single DB read under BEGIN IMMEDIATE |
| Schema + data versions match | Replay aborts if `snapshot.schema_version != current` or `snapshot.data_version != current` |
| FS path + inode divergence does not break replay | `fs_path`, `fs_ino`, `fs_mtime`, `fs_content_hash` are journaled values; re-sync runs after replay to reconcile |
| FTS + link cache are rebuildable | Both are derived from node content (`db/links.ts`, FTS triggers); rebuild after replay |

Violations of any invariant are correctness bugs, not replay-contract gaps. The audit confirms none exist today for the seven content ops.

---

## 4. fs-watch ops in the oplog (DQ3)

### 4.1 Current split: all Changes go into one journal

`actor: "fs-watch"` Changes arrive from two sources today:

1. The file watcher seeing external edits (nvim, Obsidian, git pull) — routed through `watch/handlers/*.ts` → `emitNodeCreated` / `emitNodeUpdated` with `actor: "fs-watch"`.
2. The markdown pipeline ingesting a file during cold-start or lazy-expand — `markdown/pipeline.ts` uses the same helper functions with `actor: "fs-watch"`.

Both produce real `Change` records in `changes.jsonl` today. To prevent echo loops, `bulk-sync.ts:82–90`'s `wrapEmitterForReconcile` uses `emitter.commit()` (bypasses `onApply`) instead of `emitter.apply()`, so these changes write to DB + journal without re-projecting back to FS.

### 4.2 Phase B options: mixed, tagged, split

The audit surfaces three layouts:

| Option | Description | Trade-off |
|---|---|---|
| Mixed | All ops share one file; replay treats them identically | Simplest; but replay re-applies fs-watch ops that reflect FS state already |
| Tagged | One file, but ops carry `origin: "user" \| "fs-watch" \| "replay" \| "system"`; replay filters | Minimal schema change; clean separation at replay time |
| Split | User ops go in `oplog/`, fs-watch ops go in `fs-audit.jsonl`, replayed separately | Clean at rest; but two sinks means dual-write correctness risk (same failure mode G3 avoided) |

### 4.3 Replay semantics when FS state is also truth

In Phase A + B, FS is still truth. On replay:

- **User ops** need re-application — they represent intent not yet projected (or projected to FS and lost on disk restore).
- **fs-watch ops** are *observations* of FS state at some past time. Re-applying them produces a DB state that matches the FS as it was then, which is not necessarily what FS is now. After replay, the correct move is a fresh FS scan to catch up with current reality, not another re-application of stale fs-watch ops.

That argues for filtering fs-watch ops out of the replay stream, not for replaying them.

### 4.4 The pump-replay problem

If fs-watch ops were re-applied during replay, they'd produce DB mutations that `onApply` subscribers would then project back to FS — which is the echo loop `commit()` exists to prevent. During live apply, `commit()` bypasses `onApply`, so no echo. During replay, the replay tool must preserve that bypass or echoes return.

**Decision: Phase B tags every op with `origin`, and replay filters by origin:**

- `origin: "user"` — re-applied on replay
- `origin: "fs-watch"` — **skipped** on replay; a post-replay FS scan catches up DB to current FS reality
- `origin: "replay"` — a meta origin for ops emitted by the replay tool itself (currently unused but reserved)
- `origin: "system"` — synthetic ops (snapshots, `bootstrap_complete` markers); re-applied

**Rationale:**

- Tagging (option in §4.2) is cheaper than splitting files (no dual-write). The `origin` field already exists in `Change` (`emitter.ts` `EmitOptions.source: CommitSource`) — this decision standardizes it.
- Filtering on replay avoids the pump-replay problem without needing a separate file.
- A post-replay FS scan is required anyway (FS may have drifted while DB was down); piggy-backing fs-watch reconcile on that scan is free.
- Mixed (no filter) is incorrect — it re-applies stale FS observations and risks echo loops.
- Split has dual-write risk and no offsetting benefit.

**Audit closure requirement**: before Phase B ships, every `emitter.apply()` / `emitter.commit()` call site must pass an explicit `origin`. Default-to-`"user"` is **not** acceptable — an un-tagged op must be a loud typecheck error. Tracked under audit Gap G3's replacement bead (`km-storage.op-surface-rename-path`) since the journalRename bypass already needs origin stamping.

### 4.5 Reconcile-origin discoveries: journal them

Follow-up from the route-scanner bead (`km-storage.op-surface-route-scanner`, commit `c121aa8e0`): post-replay FS reconciliation discovers files on disk that the DB has never seen (externally added between sessions). Today these go through `emitter.commit({ skipPersist: true, source: "fs-import" })` — they hit the DB but not the journal.

**Decision: reconcile-origin `node_created` events ARE journaled, tagged `origin: "fs-reconcile"`.**

Rationale:

- The op-surface stream is more valuable than the disk-write savings. An oplog missing "when did this file first appear to km?" loses history that matters for debugging sync anomalies and replay diffs.
- Reconcile ops already flow through the emitter today — dropping `skipPersist` is a one-line change at the callsite, not a new machinery.
- On replay: `origin: "fs-reconcile"` is treated like `origin: "fs-watch"` — skipped, because the post-replay FS scan will re-observe the file and produce an equivalent op fresh. This avoids the pump-replay problem while preserving the audit trail when the system is running live.
- Retention: reconcile-origin ops are excellent compaction candidates. The "file was first discovered at T" fact doesn't need to survive past the next snapshot, since the snapshot captures post-reconcile state. Compaction policy (§7) folds them into the snapshot.

**Implementation trigger**: when the op-surface closure work (G1–G9) lands, flip `skipPersist: true` → `skipPersist: false` in `repo.ts` (scanner path) and `loader.ts` (initial replay keeps `skipPersist: true` — it IS the replay, re-journaling is circular). Add a fourth `origin` value (`"fs-reconcile"`) to the `CommitSource` union. Distinct from `"fs-watch"` so compaction can treat them differently if needed.

---

## 5. Task ops: alias vs fold (DQ4)

**Decision: Keep `task_claimed`, `task_released`, `task_completed` as tagged aliases in the oplog; apply them through the same `node_updated` code path at replay time.**

What this means:

- The seven content op types remain in `ChangeType`.
- `emitter.apply({type: "task_completed", ...})` continues to produce a Change with `type: "task_completed"` in `changes.jsonl`.
- `applyChangeWithDb`'s switch on `type` continues to route task ops through their dedicated handlers (`applyTaskCompleted` etc.) — which are already thin wrappers over UPDATE statements equivalent to `node_updated {item: {task: {status}}}`.
- Phase B does **not** fold these into `node_updated`.

**Rationale:**

- **Journal readability**: `grep task_completed changes.jsonl` tells a user exactly what happened. Folding into `node_updated` with `data.item.task.status` loses that affordance.
- **Zero implementation cost to keep**: task ops already work today; folding them would be a refactor touching emitter, DB handlers, test fixtures, and agent conventions for nonzero gain.
- **Zero replay cost**: task-op handlers are deterministic UPDATEs; they are already serializable and idempotent (audit §Summary).
- **Agent ergonomics**: agents (cloudi, pam, others) that emit task ops use the typed names as affordance. Renaming to `node_updated` loses the "this is a task state change" semantic at the boundary.

**What this doc does not decide**: whether a future Phase C might unify on `node_updated` with a richer data schema. That's orthogonal to Phase B — folding can happen later without breaking the oplog contract (old `task_*` ops remain replayable by keeping the handlers in place).

---

## 6. Migration-era boundary (DQ5)

### 6.1 Schema migrations are implicitly pre-oplog

`packages/km-storage/src/db/schema.ts` runs two kinds of migration at startup:

- **`migrateSchema`**: ALTER TABLE + CREATE INDEX + FTS rebuild. Runs when `meta.schema_version` is behind `SCHEMA_VERSION`. Mutates DB shape. Direct SQL; does not emit `Change` records.
- **`migrateData`**: full destructive rebuild when `meta.data_version` is behind `DATA_VERSION`. Drops all `nodes` rows, re-ingests from FS. Does not emit `Change` records.

Audit Gap G5 flagged these as direct `UPDATE`s that bypass the emitter. **This is correct behavior and is not a Phase B gap to fix.** Migrations are pre-op operations: they establish the schema the oplog targets.

### 6.2 The "oplog begins after schema is stable" contract

**Decision: Every oplog segment and snapshot is tagged with `schema_version` and `data_version`. Replay against a different version aborts with a clear error, and the user is directed to rebuild from FS.**

Specifically:

- `snapshot_checkpoint` record carries `schema_version` + `data_version`.
- Every segment's first record (or a segment-header meta entry) carries the same.
- The replay tool refuses to apply a segment/snapshot whose versions differ from the live DB. Error message: `"oplog targets schema=N data=M; current schema=N' data=M'. Rebuild from FS with: km doctor rebuild"`.

Consequences:

- A schema bump invalidates all existing oplog segments and snapshots for that vault. The next startup:
  1. Runs `migrateSchema` / `migrateData` as today.
  2. Archives `changes.jsonl` + `snapshots/` to `oplog-pre-v<N>/` (for debugging; auto-pruned after 30 days).
  3. Emits a fresh `snapshot-0000` from the post-migration state.
  4. Starts a new `changes.jsonl` segment.

- Post-migration, the oplog is clean and future-forward. No cross-version replay is attempted.

**Rationale:**

- A resumable cross-version oplog would require per-op schema versioning (every op knows which schema it was emitted under) + per-version apply code kept indefinitely. This is a tar pit — the kimmi-style complexity tax — for a feature (cross-version time-travel) no user has asked for.
- FS is still truth in Phase B. "Rebuild from FS" is always the honest fallback. Phase B's goal is durability + recovery, not archaeology.
- Archiving rather than deleting the old oplog preserves the debugging story: a user who hits a migration surprise can still `less` the old journal.

### 6.3 DATA_VERSION rebuilds and replay

A DATA_VERSION bump today triggers a full rebuild from `.md` files. In Phase B:

- The rebuild drops all nodes → re-ingests all files → produces a flurry of `node_created` ops with `actor: "fs-watch"` / `origin: "fs-watch"`.
- Under §4's replay-filter rule, those ops are skipped on replay — correctly, because any future replay would also be rebuilding from current FS anyway.
- The DATA_VERSION boundary produces a fresh `snapshot-0000` for the new data version (see §6.2). The rebuild's fs-watch ops fill the new journal; at next rotation trigger, compaction produces `snapshot-0001`.

So DATA_VERSION bumps are transparently handled by the same snapshot-first contract — no special case.

---

## 7. Compaction policy detail

### 7.1 Hard goals (minimum)

Phase B compaction **must**:

1. Keep total oplog + snapshot size bounded in steady state.
2. Preserve the replay contract (§3) at all times — no interval during which replay is impossible.
3. Never delete a segment without a prior snapshot covering it (§3.3).
4. Tolerate crash between any two filesystem operations (snapshot write, segment rename, meta-file update).

### 7.2 Soft goals (nice to have)

Phase B compaction **should**:

1. Preserve a safe-rollback window (§7.5) of recent ops for "oh no" undo at shell scale.
2. Keep user-visible file listings tidy (one active file, one snapshot dir).
3. Run in background / idle time, not on every op.
4. Be interruptible and resumable without corruption.

### 7.3 Compaction triggers

Compaction is evaluated when any of the rotation triggers (§2.3) fires:

| Trigger | Threshold (default) | Configurable? |
|---|---|---|
| Active segment size | 10 MB | `oplog.rotate_mb` |
| Active segment age | 7 days | `oplog.rotate_days` |
| Active segment op count | 10,000 | `oplog.rotate_ops` |
| Snapshot age | 30 days | `oplog.snapshot_max_days` |
| Archived segment count | 6 segments | `oplog.segment_max_count` |

The active segment rotates whenever any of the first three fires. A compaction + new snapshot runs whenever the last two indicate stale state (either snapshot is too old or too many segments have piled up).

### 7.4 Snapshot invariants

A snapshot must:

- Be produced under `BEGIN IMMEDIATE` transaction against `state.db` (atomic read).
- Carry `schema_version` + `data_version` (§6.2).
- Record the `last_change_id` of the change applied just before the snapshot — this is the join point for subsequent segment replay.
- Be fsync'd to disk before any segment it covers is deleted.
- Not include derived state (FTS, links, rules-materialized embeds — §2.4); these rebuild on replay from node content.

The snapshot write is the pivot of a two-phase compaction protocol (§7.5) so a crash leaves either the old state or the new state, never a half.

### 7.5 Safe-rollback window

Phase B keeps the last **N = 5,000 ops or 7 days, whichever is larger** of un-compacted ops available, on top of the most recent snapshot. This is the safe-rollback window.

Purpose:

- Manual "oh no" recovery: `km doctor replay-from-snapshot --at=<change-id>` can rewind to any point in the window.
- Cross-session semantic undo (Phase B's stated unlock) typically stays within hours, well inside the window.
- Debugging: a user reporting "my note disappeared" can scrub back through recent ops without waiting on a support round-trip.

The window determines how aggressively compaction can delete old segments. Compaction rule:

- Keep `snapshot-N` and `snapshot-(N-1)` (prior snapshot) always.
- Keep segments covering the safe-rollback window (ops newer than the prior snapshot's `last_change_id` minus N ops).
- Delete older segments only after fsync of the new snapshot.

Two-phase compaction:

```
1. Write snapshot-(N+1) to <kmDir>/snapshots/snapshot-NNNN.tmp
2. fsync the tmp file
3. Rename to snapshot-NNNN.jsonl (atomic)
4. Update oplog-meta.json: last_snapshot_id = snapshot-NNNN
5. fsync oplog-meta.json
6. Delete segments older than the new safe-rollback floor
```

A crash between steps 1–3 leaves no snapshot-(N+1); next boot sees the old meta and retries. A crash between steps 4–5 may leave the meta file stale, but the snapshot exists; a boot-time integrity check (§8.2) catches and re-fsyncs. A crash between steps 5–6 leaves extra segments around (harmless; next compaction cleans them up).

---

## 8. Replay tooling

### 8.1 `km doctor replay-from-snapshot`

```
km doctor replay-from-snapshot [--at=<change-id|timestamp>] [--into=<path>] [--dry-run]
```

Rebuilds `state.db` from the most recent usable snapshot + segments.

Flags:

- `--at` — replay point cutoff. Default: current (replay everything). Accepts a change ID or ISO timestamp.
- `--into` — output path (default: replace `state.db` in place, after backing up to `state.db.bak`).
- `--dry-run` — perform the replay into a temp DB, run integrity checks, report stats. Do not touch live `state.db`.

Algorithm:

1. Read `oplog-meta.json` to find the most recent snapshot ≤ `--at`.
2. Fresh-open `state.db.new`, apply schema migrations to current version.
3. Replay the snapshot (node_created ops with `origin: "snapshot"`).
4. Walk segments in order; apply ops where `origin ∈ {user, system}` and `ts ≤ --at`.
5. Rebuild derived state (FTS rebuild, link cache from node content, rules-materialized embeds).
6. Run a post-replay FS scan to reconcile against current FS state (emits fresh `origin: "fs-watch"` ops as it goes).
7. If `--dry-run`, report stats and discard; otherwise rename `state.db.new` → `state.db` (atomic).

Expected steady-state latency: 5–15 seconds for a 5k-file vault, dominated by the FS reconciliation pass. Pure-oplog replay is <1 second for typical op volumes.

### 8.2 `km doctor verify-oplog-integrity`

```
km doctor verify-oplog-integrity [--since=<change-id|timestamp>] [--full]
```

Cross-checks oplog + snapshots against live `state.db`.

Checks:

- Oplog JSONL is parseable (every line is a valid `Change`).
- Every op's `target` resolves to a current or historically-present NodeId.
- Snapshot `last_change_id` appears in the segment chain following it.
- `meta.last_event` in `state.db` matches or is a descendant of the tail segment's last op id.
- `schema_version` / `data_version` on snapshots match live values.
- `--full`: replay into a throwaway DB and compare row-by-row with live `state.db`. Reports any divergence.

Exit code: 0 if healthy, 1 if any check fails. CI / doctor harness can run `--full` nightly on CI fixtures to catch replay-determinism regressions.

### 8.3 Failure modes and reporting

| Failure | What it looks like | Recovery |
|---|---|---|
| Missing snapshot | No snapshot covers requested `--at` | `km doctor rebuild` from FS; start fresh oplog |
| Corrupt segment | JSONL parse error mid-file | Report line + offset; replay stops at that op; user can `--at` before it to get a partial replay |
| Schema version mismatch | Snapshot / segment targets a different schema | Abort; prompt user to `km doctor rebuild`; archive old oplog (§6.2) |
| FS-DB divergence after replay | Post-replay FS scan reports unexpected diffs | Normal — oplog replay produces a stale-but-valid DB; FS scan catches it up; no user action needed |
| Dual-write tear (DB ahead of journal) | `state.db.meta.last_event` is newer than the tail of `changes.jsonl` | Log warning; rely on next FS scan for reconciliation; file a bug |
| Snapshot + meta out of sync | `oplog-meta.json` references a snapshot file that doesn't exist | Rescan `snapshots/`, rebuild `oplog-meta.json` from filenames + first-line metadata |

All failures are logged and surfaced to the user (no silent corruption — see km's "no silent failures" rule).

---

## 9. Out of scope (explicit non-goals for Phase B)

Phase B does **not** solve any of the following. They are Phase C, D, or E concerns.

| Non-goal | Which phase owns it |
|---|---|
| Flipping DB to source-of-truth | Phase C |
| Cross-device / cross-peer op exchange | Phase D (via CRDT) or Phase C (via custom sync protocol, Tier 3) |
| Real-time collaboration | Phase D |
| Conflict-resolution UX when Obsidian and km disagree | Phase C |
| DB-query → FS-patch mapping (one block in two files, which owns the projection?) | Phase C |
| Cross-schema time-travel replay | Not planned (§6.2 rationale) |
| Keystroke-level undo | Not planned — edits collapse at save boundary by design (audit §"Text editing boundary") |
| Op-level permissions / access control | Phase E (sync platform) |
| Binary blob ops (images, PDFs, attachments) | Phase E |
| Multi-actor reconciliation (agents + user as distinct peers with per-peer vector clocks) | Phase D |
| Cross-vault oplog federation | Phase D+ |
| LLM-adjudicated replay decisions | Phase C speculative (§9 Deferred in storage-architecture.md) |

Phase B's contract with Phase C: ops are serializable, stable-NodeId-scoped, origin-tagged, replay-idempotent against a snapshot. Phase C inherits this and adds the projection + conflict model. If Phase B shipped with un-tagged ops or relied on ephemeral state, Phase C would be stuck; that's why origin-stamping (§4) and the closure audit are non-negotiable prerequisites.

---

## 10. Implementation sequence

### 10.1 Prerequisites (audit closures)

Before Phase B can start, these audit gaps close. Beads suggested in the audit §"Recommended follow-up beads":

| Audit gap | Bead | Priority | Reason Phase B can't start without it |
|---|---|---|---|
| G3 | `km-storage.op-surface-rename-path` | P0 | Crash-safety issue today; Phase B replay would diverge at every folder rename |
| G1 | `km-storage.op-surface-route-scanner` | P1 | Cold-start inserts must be either replayed or bootstrapped; without this, snapshot is incomplete |
| G4 / G7 / G9 | `km-storage.op-surface-embed-and-blockid` | P2 | Derived-state writes that replay must also produce; otherwise replayed DB differs from live |
| G2 | `km-storage.op-surface-deferred-emitter-required` | P2 | Deferred parse path must emit through emitter, else replay skips content |
| G10 | `km-storage.op-surface-memorystore-cleanup` | P3 | Dead code confirmation; low risk |
| DQ3 / G13 | `km-storage.phase-b-session-ops-decision` | P2 | Decision: session/message ops stay in `changes.jsonl` tagged with `type: session_*`; skipped by replay (no DB effect to replay). Memo-level, not a gap. |
| Type tightening | `km-storage.op-vocabulary-type-tighten` | P3 | Nice-to-have before Phase B; enforces the serializability soft violation (audit §Serializability audit item 1) |

Schema changes required for Phase B:

- Add `origin TEXT NOT NULL DEFAULT 'user'` to the `Change` shape (type + DB meta tracking) — already present on `EmitOptions`, just needs to be persisted + required.
- Add `<kmDir>/snapshots/` directory convention + `oplog-meta.json` format.

These are additive and ship with the closure beads.

### 10.2 Bead decomposition

Phase B work under `km-storage.pathway-db-crdt` → Phase B children:

```
km-storage.pathway-db-crdt.phase-b                             [P2 epic]
├── km-storage.phase-b-oplog-layout                            [P2] §2 — file layout, rotation, meta file
├── km-storage.phase-b-snapshot-format                         [P2] §2.4, §7.4 — snapshot file format + producer
├── km-storage.phase-b-compaction                              [P2] §7 — rotation, compaction, safe-rollback window
├── km-storage.phase-b-replay-tool                             [P2] §8.1 — km doctor replay-from-snapshot
├── km-storage.phase-b-integrity-tool                          [P2] §8.2 — km doctor verify-oplog-integrity
├── km-storage.phase-b-origin-tagging                          [P2] §4 — every emitter.apply site gets explicit origin
└── km-storage.phase-b-property-tests                          [P2] property tests for replay determinism
```

Each child is sized at 1–3 days. Phase B overall: ~2 weeks of focused work after closures.

### 10.3 Exit criteria

Phase B is done when:

- Every `emitter.apply()` call site stamps an explicit `origin`; unstamped is a typecheck error.
- `.km/changes.jsonl` rotates into `.km/oplog/changes-NNNN.jsonl` on size/time/ops thresholds.
- `.km/snapshots/snapshot-NNNN.jsonl` gets produced on compaction, covering the full current node state.
- `km doctor replay-from-snapshot` rebuilds a bit-identical `state.db` (modulo derived state) for a test vault of 5k files.
- `km doctor verify-oplog-integrity --full` passes on CI against vault fixtures.
- Property test suite covers: replay-then-live-apply convergence, compaction-then-replay round-trip, crash-during-compaction resilience, schema-mismatch abort, fs-watch-op replay skip.
- Two-phase compaction survives `kill -9` at every step in a chaos test.
- Oplog + snapshot disk footprint stays ≤ 50 MB for a 5k-file vault in steady state.

---

## 11. Open questions

Questions this doc does **not** answer. To be decided during implementation or deferred:

**OQ1 — Session ops as a sub-stream**: This doc assumes `session_*` and `message` ops stay in `changes.jsonl` with no DB effect and are skipped by replay (see §10.1 DQ3 row). An alternative is a parallel `<kmDir>/session-trace.jsonl` that the agent tooling owns independently. The call doesn't affect Phase B's replay contract; defer to whichever team (storage vs agents) owns the agent-messaging surface first.

**OQ2 — Snapshot compression**: JSONL snapshots at 5k nodes are ~5–15 MB uncompressed. `zstd -3` drops that to ~1 MB. Worth it? Depends on whether the decompression cost on replay (~100 ms for 5k files) is acceptable. Defer until empirical data says it matters.

**OQ3 — Op batching for bulk inserts**: The audit G1 closure will produce one `node_created` per row during `expandDirectory` and cold-start FS ingest. That's potentially thousands of ops in a single scan. Does the oplog layout need a "batch" affordance (one file line per batch with N embedded ops) to keep the file parseable? Or is the one-op-per-line shape fine even at volume? Suggest: start with one-op-per-line; revisit only if parse perf or file size becomes a problem.

**OQ4 — Segment-level checksums**: Should each segment carry a footer with a hash of its contents for corruption detection? Adds complexity (segment close becomes a rewrite). Alternative: rely on the `verify-oplog-integrity --full` replay-match check. Defer unless segment corruption becomes a reported issue.

**OQ5 — Cross-oplog compaction threshold tuning**: Defaults in §2.3 are guesses. Real usage data (op volume per active vault-week) will inform better defaults. Telemetry-free, so collection is opt-in via `km doctor stats`. Not blocking Phase B.

**OQ6 — Op-retention for audit/compliance**: Some use cases (team vaults, regulated environments) might want "keep all ops for 1 year" as a policy, overriding compaction. Not a Phase B requirement; a config hook (`oplog.retention_days`) would satisfy it cheaply when someone asks. Reopen when a user asks.

**OQ7 — Replay into a different vault**: Can Phase B's oplog replay *into a new DB for a new vault* (import-style)? Not a stated goal, but the machinery is close. Defer until Phase C, where cross-vault flows become a real concern.

**OQ8 — Tier 2 sync protocol layering**: §9 of storage-architecture.md lists Tier 2 as "op-log-based sync" — two peers exchange ops, not file diffs. Phase B is a single-peer oplog; Tier 2 is multi-peer. The question of how peers advertise + reconcile oplogs (vector clocks? per-peer origin tags? monotone log ids?) is Tier 2's problem, not Phase B's. Surface when Tier 2 actually scopes in.
