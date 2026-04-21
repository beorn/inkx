# Source-of-Truth Contract — RFC

**Status**: Decision recorded 2026-04-21. Scope: km's authoritative store across the filesystem, SQLite cache, and `changes.jsonl` journal.

**Decision**: **Family A — Markdown files are authoritative for all user content. SQLite, `changes.jsonl`, and every in-memory store are derived and rebuildable from `.md`.** Subsystems that cannot reasonably be encoded in markdown (selection, fold, nav history, session state, operational undo stack) are explicitly scoped as *session-local derivations* with a bounded loss budget. The `changes.jsonl` journal keeps its current role as a recovery + replication audit log layered **under** Family A — it is derived from user actions, not the canonical state, and never supersedes markdown during conflict resolution.

Tagline: "If you can't read it with `cat`, km doesn't claim it."

---

## 1. Problem statement

For any piece of content in km, which store is authoritative? Two design spaces hinge on the answer:

1. **Scale architecture (`km-storage.scale-architecture`)** — lazy hydration, materialized views, index rebuilds, backup/restore, corruption recovery. Each family has a different "rebuild budget" and a different contract for what "incomplete DB" means.
2. **CRDT direction** — CRDTs merge canonical state. Under Family A they'd live at the markdown-serialization boundary (hard: lossy); under Family B they'd live in the op log (natural); under Family C they'd live in the native document (very natural). Picking the family commits km to a specific CRDT layer.

Downstream this answer bounds: event-sourcing viability, external-edit reconciliation semantics, crash recovery, export/backup story, and the Obsidian interop contract.

### The three families

| Family | Canonical state | Markdown role | Log role |
|---|---|---|---|
| **A** | `.md` files | Truth | Audit trail (optional) |
| **B** | `.md` files + op log (co-canonical; .md is the human-readable encoding, log is the structured backbone) | Truth for text content | Truth for structured metadata |
| **C** | Log / native document | Export projection | Truth |

---

## 2. Current state (pre-decision ground truth)

Before picking, what does km actually do today?

### What the docs say (contradictory)

| Doc | Claim |
|---|---|
| `docs/architecture.md:159` | `FILESYSTEM .md files (source of truth)` — Family A |
| `packages/km-storage/CLAUDE.md:24` | "Filesystem remains the source of truth for content; storage is a cache + index." — Family A |
| `packages/km-storage/src/watch/README.md:256` | "DB authority for user changes" — leaning toward B/C |
| `docs/ref/changes.md:278` | "The change log is the ground truth." — Family C |
| `docs/concepts.md:33` | `FS  markdown files on disk  source of truth` — Family A |
| `docs/glossary.md:173` | "event-sourcing-lite: events appended to `.km/changes.jsonl`, SQLite is a rebuildable cache." — B-shaped |

The codebase has been drifting. The on-disk artifacts (`.km/changes.jsonl`, `.km/state.db`) and the emit pipeline (`commit → persist → broadcast → save`) implement B-shaped mechanics, but the semantic contract in the main architecture and storage package docs is A. Both happen to work because, in single-writer reality, the log + the DB + the .md files agree. The contract has never been stress-tested under divergence.

### What the code does

**Memory mode** (no `.km/`):

- `.md` is truth. SQLite lives in `:memory:`, rebuilt on every startup.
- Node IDs are ephemeral (`path:line`). No log. No history.
- `updateNode()` writes through directly to `.md`.

**Disk mode** (`.km/` exists):

- `emit(change)` = `commit()` + `save()`:
  1. Apply to SQLite.
  2. Append to `changes.jsonl`.
  3. Broadcast via `ChangeHub`.
  4. Project to `.md` files (unless `origin: "fs"`).
- On startup (`loadRepo`): read `changes.jsonl` → apply to SQLite → reconcile against filesystem (detect externally added / removed files, emit `node_created` / `node_deleted`).
- Ownership tracker (L1 hash + L2 `sync_state` table) distinguishes "our write" from "external edit" to prevent echo loops.
- `km doctor rebuild` rebuilds `state.db` from events; `km doctor reset` rebuilds from worktree (trusts filesystem).

**Externally authoritative today (deviations from "A"):**

- **Sibling order** (`.km/.sibling-order`) — which order children appear in at a given parent folder. Markdown has no way to encode this; it's persisted alongside `.md` but outside `.md`.
- **Block IDs (`^blockid`)** — present in `.md` (Obsidian syntax), but km rewrites them during reconciliation when unreferenced. Live in `.md`, derived-but-also-persisted in the `links` table.
- **Collapse-parse metadata** — some files stay opaque per `.km/config.yaml` policy. Their outbound link edges are regex-extracted, written to `collapsed_file_links`, and treated as authoritative for the backlink graph until someone navigates in. This is DB-authoritative for a link subgraph.
- **Inbound anchor resolution** — derived cache, rebuildable.
- **FTS5 index** — purely derived.
- **Rules evaluation (materialized `km.add::` queries)** — derived, but has nondeterminism if query results change between rebuilds without any `.md` edit. Acceptable under A.

**Session-local (never in .md, never in journal):**

| Subsystem | Location | Persistence |
|---|---|---|
| Cursor (`sel.node.cursor`) | React state, alien-signal | None |
| Selection anchor / range | React state | None |
| Fold depths (`foldDepths`) | `BoardState` in-memory | None |
| Collapsed columns (`collapsedNodes`) | `BoardState` in-memory | None |
| Nav history | `BoardState` in-memory | None |
| Move mode | `BoardState` in-memory | None |
| Tree-op undo stack (`withHistory`) | In-process only | None |
| Workspace layout (pane tree, root path, view mode) | `.km/workspaces/default.json` | Explicit save file, *not* in `changes.jsonl` |
| Hidden nodes filter | `.km/hidden` | Explicit file, not in `changes.jsonl` |

**Observation**: the op-based tree history in `@km/tree/history.ts` is NOT the same stack as `changes.jsonl`. `changes.jsonl` persists semantic node-level changes (CRUD); `history.ts` holds `TreeOp` primitives for in-session undo. Two parallel mutation trails exist. Undo today cannot survive a restart.

### Measured baseline

- km's own `.km/changes.jsonl`: **11,831 events, 6.9 MB** across km's full development history.
- km's own `state.db`: 12 MB (mostly FTS5 + indexes + expanded node rows).
- km's full vault (test target): ~65K nodes, cold-start 4.0s median pre-lazy-hydration.
- Rebuild from `.md` today (memory mode full parse): single-digit seconds on the km repo itself.

The log is small (<1 MB/year at current km dev-repo velocity). The DB is small. Rebuild is cheap. None of these stores is near a scale ceiling.

### Conclusion from ground truth

km today is **A-in-intent, B-in-mechanics, with C-shaped doc drift.** The "intent" docs are the older ones; the change-log doc line "ground truth" appears to be aspirational. The actual failure modes are all reconcilable under A (ownership tracker, FS reconcile loop, `km doctor reset`).

---

## 3. Family analysis against hard constraints

Constraints from `km-storage.scale-architecture`:

- **H1**. Single-user working session.
- **H2**. Offline read/write of local vault.
- **H3**. Obsidian syntax interop: `[[wiki-links]]` + `^blockids` resolve.
- **H4**. 16 ms frame budget preserved.

Soft constraints (bendable with explicit sign-off):

- **S1**. No server required.
- **S2**. Plain-text portability (the "open in vim" test).
- **S3**. Fully synchronous global backlink freshness (already soft — eventual <1s is acceptable).

### Family A: markdown authoritative, DB + log derived

**Mechanics**: `.md` files are canonical. SQLite is a rebuildable cache. `changes.jsonl` is an audit trail (optional, can be deleted without data loss). Conflict resolution prefers `.md`. External edits win over cached DB state.

| Dimension | Family A |
|---|---|
| Obsidian interop (H3) | Native — we live in `.md`, so interop is the definition |
| Plain-text portability (S2) | Native — user's data is exactly what `ls -la` shows |
| External edit reconciliation | Filesystem watcher → re-parse → diff → update DB. Already built. |
| Crash recovery | Delete `.km/`, re-scan vault. Current `km doctor reset`. |
| Backup story | `tar czf vault.tgz vault/` — hand to user, zero vendor lock-in |
| CRDT story | Hard — must CRDT-ify the markdown *round-trip*, which is inherently lossy |
| Undo across restart | Hard — no canonical op stream to replay |
| Structured metadata (sibling order, done state, priority) | Constrained by what markdown can encode — falls back to sidecar files for the rest |
| Rebuild budget | O(files × parse-cost). Measured: single-digit seconds for 65K nodes |
| 16ms frame (H4) | Fine — hot path reads from DB, writes hit DB + .md |

**Where A leaks today:** sibling order, collapse-parse edges, hidden filters, workspace layout — already live in sidecar JSON. This is acceptable as long as each sidecar file names itself explicitly and the app degrades gracefully when a sidecar is missing.

**Tradeoff**: Family A is the cheapest to maintain, the best interop story, and the hardest platform for anything that wants a canonical op stream (CRDT, time-travel debugging, merge).

### Family B: markdown + op-log, DB = log projection

**Mechanics**: `changes.jsonl` is canonical alongside `.md`. Co-canonical means: text content lives authoritatively in `.md`, structured mutations (status changes, sibling reorders, task claims) live authoritatively in the log. SQLite is a pure projection of the log. Conflict = log's last-write-wins or CRDT merge.

| Dimension | Family B |
|---|---|
| Obsidian interop (H3) | Good — `.md` is still authoritative for text; `^blockids` + `[[links]]` resolve natively |
| Plain-text portability (S2) | Good, but weaker than A — structured state (task status, priority) lives in log. External edits that *change* status need a log entry to be authoritative — otherwise .md wins temporarily then loses on next reconcile |
| External edit reconciliation | Harder — needs to distinguish "text edit" (write through to .md) from "structured edit" (emit log entry) |
| Crash recovery | Replay log. Already implemented. |
| Backup story | `tar czf vault.tgz vault/ .km/` — user must understand both halves matter |
| CRDT story | Natural — log is a sequence of ops; each op can be a CRDT op |
| Undo across restart | Natural — replay backwards from log |
| Structured metadata | First-class — log carries semantic `node_updated`, `task_completed`, etc. |
| Rebuild budget | O(events × apply-cost). Measured: km dev repo = 12K events ≈ <1s |
| 16ms frame (H4) | Fine — same hot path as A |

**Where B collides with A**: today's `changes.jsonl` has the B *shape* (node_created with full payload, node_updated with field deltas) but not the B *contract* — reconciliation treats `.md` as winner, and a change that's only in the log but not reflected in `.md` loses when we re-scan. To actually become B we'd need to:

1. Commit that after a crash, the log replays *over* the filesystem (not the other way around).
2. Define which mutation types are "text" (write through to .md) vs "structured" (log-only).
3. Decide what happens when the log and `.md` disagree — currently `.md` wins; under B, it depends.

**Tradeoff**: B buys us a cleaner CRDT path + durable undo, at the cost of a more complex reconciliation contract and a "plain text portability" asterisk.

### Family C: log-first canonical, markdown is export

**Mechanics**: `.md` files are an export/projection of the log. Editing `.md` externally is import-at-your-own-risk. Canonical data shape is native (probably Automerge-shaped, or similar). SQLite caches projected state.

| Dimension | Family C |
|---|---|
| Obsidian interop (H3) | Broken — Obsidian's writes are imports, not edits. User can't reasonably alternate between km and Obsidian |
| Plain-text portability (S2) | Violated — `.md` is a one-way export; editing it out-of-band loses data |
| External edit reconciliation | Replace, not reconcile. User loses structured metadata on external edit. |
| Crash recovery | Replay log. |
| Backup story | `tar czf vault.tgz .km/` — the `.md` files are redundant |
| CRDT story | Best — native document shape is the canonical state |
| Undo across restart | Best — full op history |
| Rebuild budget | Excellent — log is source, everything else is derived |
| 16ms frame (H4) | Fine |

**Tradeoff**: C is the best for an ambitious collaborative, time-travelling, AI-native future; and the worst for the user's actual workflow today (vim + Obsidian + git on the .md files).

---

## 4. Decision: Family A (formalize, don't expand)

**The filesystem is authoritative. Full stop.** All derived stores (`changes.jsonl`, `state.db`, in-memory projections) are rebuildable caches with explicit rebuild contracts. The `.md` files are what the user owns.

### Why A and not B

km today is effectively a muddled A/B — the mechanics are B-shaped, the contract is A, and nothing forces the contract to actually hold. Picking A forces the contradiction closed. The ownership tracker already implements the A contract (`.md` changes win over cached DB), and `km doctor reset` already implements the A recovery path (trust filesystem, discard log).

**Stepping up to B** (making the log canonical) would require:
- Reversing the reconcile priority (log wins over `.md` on conflict), which contradicts user expectations ("I edited the file in vim, why did my edit disappear?").
- Writing and maintaining migrations on log schema changes (small today, not small at 10x).
- Accepting that `.md` files exported from a fresh replay may differ from the user's committed `.md` files — a git-diff surprise for users.

**Stepping down to C** is off the table — it breaks H3 Obsidian interop.

The gains B offers (durable undo, CRDT-natural path, time-travel) can all be re-opened as *extensions* to A without surrendering the filesystem contract:

- **Durable undo**: a scoped-replay of the log filtered by session ID would give us this without changing canonicity.
- **CRDT-natural path**: if multi-device sync becomes real, we'd introduce a CRDT document format as a *mirror* of the filesystem (sync adapter), not as the canonical state.
- **Time-travel debugging**: the log is already there; it just isn't canonical.

### What Family A means *concretely* for km

1. **External edits win.** If the filesystem says X and the DB cache says Y, X wins. Always. This is the existing behaviour; we're promoting it to a contract.
2. **Deleting `.km/` is a no-op for user data.** Full rebuild from `.md` restores every bit of content a user cares about. Known sidecar files (`sibling-order`, `workspaces/*`, `hidden`) are separate "preference" files whose loss is a minor UX regression, not data loss.
3. **The journal is an audit trail, not a canonical state.** `changes.jsonl` survives as:
   - Useful for debugging ("what did I change last Tuesday?")
   - Useful for a future session-bounded undo-across-restart feature
   - Useful as a replication feed for future multi-device sync
   - NOT relied on as canonical state. If the log disagrees with `.md`, `.md` wins.
4. **SQLite is a cache with invalidation semantics.** Any derived row can be dropped and rebuilt. Explicit SLOs below.
5. **Session-local state stays session-local.** Selection, fold, nav history, undo stack — acceptable as scope debt, never promoted to canonical.

### Explicit deviations list

Subsystems that don't fit cleanly under "markdown authoritative, cache the rest":

| Subsystem | Current home | Deviation from A? | Verdict |
|---|---|---|---|
| Sibling order at a parent folder | `.km/.sibling-order` JSON | Yes — not in `.md` | **Accepted**. Markdown has no way to encode this; document as a "preference sidecar" |
| Hidden-nodes filter | `.km/hidden` file | Yes | **Accepted**. Preference, not content |
| Workspace layout (panes, split ratios) | `.km/workspaces/*.json` | Yes | **Accepted**. Pure session UX |
| `collapsed_file_links` table | SQLite only | Partial — rebuildable from `.md` via regex | **Accepted**. Derived cache, marked as such |
| FTS5 index | SQLite only | No — fully derived | **Accepted**. Pure cache |
| `km.add::` materialized query results | SQLite only | Yes — output depends on query state | **Accepted with caveat**. Idempotent re-evaluation is required; document that replaying may produce different results than a prior snapshot |
| Block IDs (`^id`) lifecycle (rewrite on reconcile) | Live in `.md`, derived in `links` table | No | **Accepted**. `.md` is authoritative; links table is derived |
| Session / tool-call log (`session_*` change types) | `changes.jsonl` only | Yes — never reflected in `.md` | **Accepted**. Agent telemetry is journal-only by design; document that this subgraph is B-shaped |
| Tree-op undo stack | In-memory (`withHistory`) | — | **Accepted**. Session-scoped; pairs with the separate TEA plan for serializable ops |

The session/tool-call deviation is the most interesting — those `ChangeType`s (`session_started`, `session_tool_call`, etc.) exist today but have no `.md` projection. They're purely log-resident. Under Family A they are explicitly agent-telemetry with no user-content promise. This is consistent with the "brain" future direction (telemetry accretes in logs; statements derive from them).

### Constraint contract for derived stores

Promotable to a test suite so drift is caught.

1. **Rebuild invariant**: `rm -rf .km/ && km init && km view` restores all user content from `.md`. Loss budget: sidecar preferences (sibling order, hidden filter, workspaces) reset to defaults; no user-authored content or relationship is lost.
2. **Rebuild time budget**:
   - Cold rebuild from `.md` at 1x (current vault, ~65K nodes, post-lazy-hydration): **<500ms first frame**. (Already the lazy-hydration acceptance target.)
   - Full rebuild (no lazy) at 1x: **<5s wall-clock**.
   - Log replay at 1x (12K events today): **<1s**.
   - At 10x: 10x the cold rebuild is acceptable if lazy hydration kicks in — *first frame* stays <500ms, full rebuild soft-caps at 30s.
3. **Cache invalidation**: every derived store declares a freshness signal. `state.db` holds `last_event` + `last_event_offset`; FTS triggers sync on DB mutations; `links` + `collapsed_file_links` are rebuilt via explicit reconcile.
4. **Conflict resolution priority**: on divergence, **filesystem wins**. `km doctor reset` is the idiomatic recovery. `km doctor rebuild` (replay log over current FS) is a *debugging* command, not a recovery command, and should be labelled as such in docs.
5. **Stale index detection**: `health` checks for orphan rows (node in DB, no `.md` file) and missing rows (`.md` file, no node). Already implemented; lift its checks into the constraint contract.
6. **Schema migrations**: additive by default. Destructive migrations require a bead + user-visible note (already in km-storage CLAUDE.md, reaffirmed here).

### Open questions deferred

1. **Durable undo semantics under Family A** — do we replay a scoped subset of the log, or snapshot `.md` at session start and diff at end? File as `km-storage.durable-undo`.
2. **Eventually-consistent backlink freshness** — already soft-constrained; formalize a <1s budget. File as `km-storage.backlink-freshness-budget`.
3. **Sidecar file proliferation** — at what point does `.km/` become de-facto canonical despite our A contract? File as `km-storage.sidecar-audit` (cadence: per release).
4. **Session/chat log promotion** — if the brain vision lands, some `session_*` changes will want to be user-visible. Re-open the contract then. File as `km-brain.log-canonicity`.
5. **Multi-device sync** — re-opens the question. Not now.

---

## 5. Does CRDT help here?

The user's framing: *"in-as-much-as CRDT helps, I don't mind us going all-CRDT sooner — but only if it helps and doesn't complicate things."*

### CRDT under each family

- **Under A**: CRDTs would have to merge at the `.md` serialization boundary. This is notoriously lossy (you'd be doing 3-way markdown merges or Automerge-on-strings). The CRDT becomes a mirror of the filesystem, not a canonical state. Most of the win CRDTs offer (automatic conflict resolution, offline-first merge) is dulled because the source of truth keeps discarding CRDT internal state on every reconcile.
- **Under B**: CRDTs fit the op log naturally. Each `node_updated` becomes a CRDT op; merge is well-defined per field. The `.md` file is derived from the merged log. This is the Automerge-typical shape (see Automerge, Yjs for similar).
- **Under C**: CRDTs *are* the canonical state. Maximum leverage, minimum interop.

### What does CRDT cost today?

- **Bundle size**: Automerge 3.x ≈ 150KB gzipped (WASM); Yjs ≈ 100KB. Both are larger than our current `bun:sqlite` footprint.
- **Schema migration**: CRDTs don't migrate like SQL. Either accept a one-way upgrade tool, version your document shape explicitly, or ship both formats during transition.
- **Conflict UX**: CRDTs don't make conflicts go away — they make them merge "silently." In a knowledge tool, silent resolution of "did I mean P0 or P2" is worse than a visible conflict. Surface UX still required.
- **Debugging**: CRDT state is opaque binary; debugging requires tooling.
- **Performance**: CRDT merges can have surprising tails at large doc sizes; well-studied for collaborative text, less so for tree-of-nodes.
- **pam / kimmi already use Automerge** — km inherits institutional knowledge + prior-art bugs for free if we go this route.

### Conclusion: defer CRDT, with a concrete reopen trigger

Under Family A — which is what we just committed to — CRDT leverage is low. There is no structural reason to import 150KB + a new debugging regime to get conflict handling that single-writer + `.md`-authoritative already gives us for free.

The user was right to be skeptical. "Does it help?" — under A, not yet. "Does it complicate things?" — yes, materially.

**Reopen trigger** (file as `km-storage.crdt-trigger`):
1. Multi-device sync becomes a shipping requirement (not "we might want this someday" — an actual user story).
2. AND simultaneous multi-writer scenarios are observed in the wild (two km instances editing the same vault, or km + pam/kimmi editing overlapping state).
3. AND the non-CRDT path (sync adapter with last-write-wins, or operational-transform over the existing log) has been tried and shown insufficient.

Until all three fire, CRDT stays on the research shelf. No spike this cycle.

### What to do instead

The **event-sourcing-lite** foundation (`changes.jsonl` with `origin` + `actor` provenance) is already CRDT-compatible without being a CRDT. When multi-writer becomes real, the sync_state table can evolve into a vector clock system; the log can grow an ops-to-be-merged section; the existing projection machinery takes it from there. This preserves the reopen path without paying the CRDT tax now.

---

## 6. What changes in this repo after this RFC

1. **Docs reconciled**. The single-writer line in `docs/ref/changes.md` ("the change log is the ground truth") becomes "the change log is the durable audit trail; `.md` is the ground truth." Updates filed under `km-docs.source-of-truth-language`.
2. **Watch README reconciled**. The line "DB authority for user changes" is accurate only in the sense of "DB is the intermediate that coordinates the write" — clarify that `.md` is the canonical destination.
3. **`km doctor rebuild` is documented as a diagnostic tool**, not a recovery path. `km doctor reset` is the recovery.
4. **Deviation sidecars are documented** in `docs/design/model/storage.md` so nobody rebuilds assuming only `.md` matters.
5. **Lazy-hydration's `HydrationPort`** remains backend-agnostic — if we ever re-open the family question, we don't have to rewrite the TUI side.
6. **No production code changes from this RFC.** It is a decision document; implementation is tracked in separate beads.

---

## 7. References

- Bead: `km-storage.source-of-truth-contract` (this RFC closes it)
- Bead: `km-storage.scale-architecture` (input; unblocked by this decision)
- Bead: `km-storage.lazy-hydration` (running; HydrationPort preserves optionality)
- Memory: `storage-crdt-direction.md` (aligns with defer-CRDT conclusion)
- Code: `packages/km-storage/src/repo/loader.ts`
- Code: `packages/km-storage/src/watch/README.md`
- Docs: `docs/architecture.md`, `docs/design/model/storage.md`, `docs/ref/changes.md`
- Data point: 11,831 changes / 6.9 MB / 12 MB DB across km's own development history — not near any ceiling
