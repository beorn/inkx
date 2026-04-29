---
id: "@km/storage/scale-architecture"
aliases:
  - km-storage.scale-architecture
  - km-storage-scale-architecture
created_by: claude:8b5b9e1c
created_at: 2026-04-21T08:25:27Z
closed_at: 2026-04-21T22:29:50Z
close_reason: "Superseded. The scale-architecture decision is resolved: Family A
  (markdown authoritative) + adapter-architecture + federation + lazy-hydration.
  No log-first / CRDT-first flip. Open arc lives under
  km-storage.adapter-architecture and its sub-beads. CRDT reopen trigger moved
  out as km-storage.crdt-trigger (standalone P3). Design canonicalized at
  hub/km/storage-architecture.md."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.scale-architecture
    depends_on_id: km-all.plateau
    type: parent-child
    created_at: 2026-04-21T01:25:27Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Scale architecture — forced decision under benchmarked workloads (not survey) @km/storage #epic #P1

blocks:: [[@km/all/plateau]]

Decision epic for km's path to 10-100x vault scale. Rewritten 2026-04-21 after dual-pro review flagged the original as 'design epic death' — survey-first scope + document-only acceptance.

## Kill-switch (auto-close condition)

This epic auto-closes as **WONTFIX on 2026-06-01** unless:
1. A synthetic 2x vault (~130K nodes) demonstrates a reproducible cold-start >1s OR frame drop >16ms on M5 Max 128GB after lazy-hydration lands, AND
2. The bottleneck is profiled to be in the storage/indexing/query layer — NOT in bun boot, signal graph, rendering, or something else.

If neither condition fires, the stack is sufficient and the epic closes unimplemented. Speculative architecture ≠ progress.

## Primary question

**What is authoritative?** Everything downstream depends on this.
- (A) Markdown files authoritative → DB + indexes are derived, rebuildable
- (B) Markdown authoritative + append-only op log → log is derived audit trail
- (C) Log-first canonical state → markdown is a projection (weakens plain-text portability)

Answer this ONE question first. Tool choices follow.

## 3 architecture families to evaluate (NOT 12 tools)

- **Family A**: markdown-first + derived SQLite/indexes + tiered lazy hydration. Conservative, fits current constraints.
- **Family B**: markdown-first + append-only op log + materialized SQLite views. Enables replay/audit without breaking plain-text.
- **Family C**: log-first canonical + markdown projection. Only valid if we accept weakening portability.

Rejected as out of scope or wrong shape: CRDT (collab concern, separate epic), sharding (single-user), LiteFS/rqlite (server-shape), vector DB (no stated requirement), Meilisearch (server process).

## Hard constraints (immutable for this epic)

- Single-user working session (multi-user = separate collab epic)
- Offline read/write of local vault
- Obsidian syntax interop: [[wiki-links]] + ^blockids resolve correctly
- 16ms frame budget preserved

## Soft constraints (bendable with explicit documentation)

- No server required (bendable at 100x: native embedded indexer acceptable if still local-first)
- Plain-text portability (bendable at 100x: loose .md files may become import/export format, not runtime source — bead filed separately)
- Fully synchronous global backlink freshness (bendable: eventual within 1s acceptable)

## Hard/soft must be re-signed-off during the epic — don't treat as fixed.

## Required deliverables (falsifiable acceptance)

1. **Workload/scale model** (`hub/km/scale-workload-model.md`): what 10x / 100x ACTUALLY mean per dimension (files, source nodes, active nodes, simultaneously hydrated, edits/s, searches/s, external edits/s). Not just node counts.
2. **Benchmark harness committed** (bead: @km/storage/scale-benchmarks) — synthetic corpus generator + real-vault trace replay + workload runners + latency/memory metrics. Without this, epic cannot close.
3. **Architecture RFC** (`hub/km/scale-rfc-2026-XX.md`): picks ONE family with quantitative reasoning, rejects the other 2 with numbers (not prose), addresses the source-of-truth question.
4. **1-2 risk spikes** — highest-uncertainty items only. Not all unknowns; just the ones that would kill the chosen family.
5. **Successor implementation beads filed** — sequenced, owned, migration order spec'd.
6. **Explicit WONT-try list** — what was considered and rejected, with reasoning.

## Parallel inputs (not prerequisites — can proceed in parallel)

- @km/storage/lazy-hydration (P0) — telemetry on post-materialization working set, cache churn, lazy query surfaces
- @km/storage/scale-benchmarks (new, P1) — workload harness (prerequisite for acceptance but can be built in parallel)
- @km/silvery/signal-graph-scale-limits (new, P1) — reactive graph ceiling — likely the real scale bottleneck per dual-pro

## Removed from prerequisites

- TEA Phase 1 — orthogonal. Storage backend doesn't care about plugin architecture at TUI layer.
- 'Pro scale review findings' — that's input, not a prereq.

## Key open questions (rewrites old list; now workload-first not tool-first)

1. **Authoritative store** (see Primary Question above)
2. **What must scale with corpus vs bounded by viewport** — if lazy-hydration is real, active hydrated state should NOT scale linearly with source corpus
3. **Hot/warm/cold tiering policy** — C2 proved the concept; what's the principled contract?
4. **Consistency/freshness model** — is backlink freshness immediate? eventual <1s? background-only?
5. **Failure/recovery model** — crash mid-write, stale index, corruption — rebuild time budget at 10x / 100x
6. **External edit reconciliation** — md file changed by another tool; how fast does km detect + re-index? (separate bead: @km/storage/external-edit-reconciliation)
7. **FS scanning scale** — at 5M+ files, OS-level stat/readdir is a bottleneck (separate bead: @km/storage/fs-watch-scale)
8. **Signal graph scaling** — primary K2.6 finding; likely real bottleneck above memory (separate bead: @km/silvery/signal-graph-scale-limits)

## Tools (surveyed AFTER family chosen, not before)

Only evaluate tools WITHIN the chosen family. E.g., if Family A wins, compare FTS5 vs Tantivy within that family. Do NOT pre-survey all tools across all families — that's the shopping-list trap the original bead fell into.

## Migration constraint on lazy-hydration

@km/storage/lazy-hydration MUST ship with a backend-agnostic hydration interface (not hardcoded SQLite SQL in TUI). This preserves optionality for later Family B/C if telemetry shows Family A insufficient. Costs ~2 days of interface discipline; prevents rewrite later. Added as requirement on lazy-hydration bead.

## What this epic does NOT solve

- Collaboration / multi-device sync — separate epic (CRDT candidate)
- Cold-start phase optimization — @km/tui/cold-startup-block, separate bead
- Lazy hydration implementation — @km/storage/lazy-hydration P0, separate bead
- TUI / reactive graph scaling — @km/silvery/signal-graph-scale-limits, separate bead