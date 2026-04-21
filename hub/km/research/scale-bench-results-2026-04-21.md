# km-storage scale benchmark — 2026-04-21

**Host**: darwin arm64, 128.0GB RAM, Bun 1.3.11

**Tiers completed**: 1x, 2x, 5x, 10x

## Verdict

**Bottleneck detected** — kill-switch criteria triggered at 2x:
- 2x cold load 102.05s >> 1s threshold (102x over budget)
- 10x cold load 516.16s (8.6 minutes) is operationally unusable
- 10x RSS steady 27.1GB — scales linearly, no cache discipline
- FTS5 search p50 grows linearly: 180ms@1x → 395ms@2x → 920ms@5x → 1.80s@10x (not a true FTS5 index hit — likely fallback scan)

**Per-query performance is fine** — navigation (getChildren) stays at ~40µs p95 across all tiers, and backlink queries stay under 5ms even at 10x. The storage query layer is not the bottleneck at steady state.

**The real finding: cold-load + memory footprint.** `createRepo({ loadFiles: true })` scales linearly with node count, fully materializing all ~7.6M nodes into SQLite before any UI can run. At 2x this is already over the 1s threshold; at 10x it's 8.6 minutes and 27 GB. The km-storage.lazy-hydration work (P0, just landed) skips reconciliation but still materializes everything — synthetic evidence confirms lazy-hydration alone is insufficient for even 2x vaults.

**Family A verdict: fails at 2x under full-load semantics.** If lazy-hydration becomes truly viewport-scoped (only ~50 cards + ancestors materialized, rest deferred), Family A can still hold — the per-query numbers support that. But full-load Family A is dead.

**Recommendation for scale-architecture epic:**
- Do NOT auto-WONTFIX on 2026-06-01 — the 2x kill-switch threshold has been breached.
- Scope the decision narrowly: is viewport-scoped hydration (extension of the current P0) sufficient, or do we need Family B's append-only op log to avoid full file-tree rescan on every startup?
- The dimension that forces B vs A-extended is **external edit reconciliation** — can we detect 10 external edits in <100ms at 10x without a full rescan? Current reconcile measurement (≈170µs for touched files) is post-hydration — the pre-hydration rescan is the cost driver not measured here.
- Family C (log-first) remains unforced by this evidence; plain-text portability still holds as a constraint.

Caveat: this harness measures the storage-layer cold path in memory mode (no `.km/`). Disk mode with incremental event log would change the numbers — that's Family B territory and warrants its own harness run once Family B prototype exists.

## Results table

| tier | files | nodes | gen | cold load | RSS steady | nav p50/p95 | backlinks p50/p95 | FTS5 p50 | reconcile(10) |
|------|------:|------:|----:|----------:|-----------:|------------:|------------------:|---------:|--------------:|
| 1x | 10024 | 753098 | 1.64s | 47.65s | 2.9GB | 13µs/39µs | 400µs/494µs | 180.0ms | 166µs |
| 2x | 20024 | 1550782 | 3.98s | 102.05s | 5.8GB | 13µs/37µs | 900µs/1.0ms | 380.0ms | 171µs |
| 5x | 50024 | 3797404 | 10.06s | 282.88s | 13.2GB | 13µs/38µs | 1.9ms/2.1ms | 900.0ms | 143µs |
| 10x | 100024 | 7629217 | 22.22s | 516.16s | 27.1GB | 12µs/45µs | 3.7ms/4.1ms | 1.80s | 182µs |

## Per-tier detail

### 1x — 10000 files, 753098 nodes

- Generated: 10024 files (54.5 MB) in 1.64s
- Cold load (createRepo → queryable, memory mode): 47.65s, 753098 nodes, 41820 links, 0 errors
- RSS: baseline 110MB → after load 2.8GB → steady 2.9GB
- Navigation (getChildren x100): p50 13µs, p95 39µs, p99 240µs
- Backlinks (getBacklinksByHref x50, 8 popular hub hrefs): p50 400µs, p95 494µs, p99 600µs
- FTS5 search (x30, common words): p50 180.0ms, p95 185.0ms, p99 190.0ms
- External-edit reconcile (10 files, post-hydration): 166µs, 0 changes applied

### 2x — 20000 files, 1550782 nodes

- Generated: 20024 files (113.4 MB) in 3.98s
- Cold load (createRepo → queryable, memory mode): 102.05s, 1550782 nodes, 84800 links, 0 errors
- RSS: baseline 110MB → after load 5.7GB → steady 5.8GB
- Navigation (getChildren x100): p50 13µs, p95 37µs, p99 250µs
- Backlinks (getBacklinksByHref x50, 8 popular hub hrefs): p50 900µs, p95 1.0ms, p99 1.2ms
- FTS5 search (x30, common words): p50 380.0ms, p95 395.0ms, p99 400.0ms
- External-edit reconcile (10 files, post-hydration): 171µs, 0 changes applied

### 5x — 50000 files, 3797404 nodes

- Generated: 50024 files (277.6 MB) in 10.06s
- Cold load (createRepo → queryable, memory mode): 282.88s, 3797404 nodes, 208200 links, 0 errors
- RSS: baseline 110MB → after load 13.1GB → steady 13.2GB
- Navigation (getChildren x100): p50 13µs, p95 38µs, p99 250µs
- Backlinks (getBacklinksByHref x50, 8 popular hub hrefs): p50 1.9ms, p95 2.1ms, p99 2.3ms
- FTS5 search (x30, common words): p50 900.0ms, p95 920.0ms, p99 930.0ms
- External-edit reconcile (10 files, post-hydration): 143µs, 0 changes applied

### 10x — 100000 files, 7629217 nodes

- Generated: 100024 files (560.1 MB) in 22.22s
- Cold load (createRepo → queryable, memory mode): 516.16s, 7629217 nodes, 417820 links, 0 errors
- RSS: baseline 255MB → after load 27.0GB → steady 27.1GB
- Navigation (getChildren x100): p50 12µs, p95 45µs, p99 252µs
- Backlinks (getBacklinksByHref x50, 8 popular hub hrefs): p50 3.7ms, p95 4.1ms, p99 4.3ms
- FTS5 search (x30, common words): p50 1.80s, p95 1.82s, p99 1.82s
- External-edit reconcile (10 files, post-hydration): 182µs, 0 changes applied

## Scaling behaviour

Per-10k-files coefficients (observed):

- Cold load: ~4.7-5.2s per 10k files (effectively linear)
- RSS steady: ~280-290MB per 10k files (linear)
- Node count: ~76-78k nodes per 10k files (linear, reflects generator's 3-5 sections × 3-8 items/section)
- Link count: ~4.2k links per 10k files (linear)
- Navigation (getChildren): constant ~40µs p95 across 1x-10x (index-hit query)
- Backlink (getBacklinksByHref): linear in node count — 0.5ms@1x → 4.1ms@10x
- FTS5 search: linear in node count — this is suspicious; real FTS5 should be sub-linear. Likely the `nodes_fts` index is rebuilt on demand in memory mode, which is not the production path (disk mode populates it on insert).

## Methodology

- In-process measurement: `createRepo(vaultDir, { loadFiles: true, forceMemory: true })` driven to completion via generator.
- Memory mode (no `.km/` directory) — worst-case: full parse + resolve + materialize on every invocation.
- Disk mode (with `.km/` and an event journal) would skip parsing on subsequent boots; that's a separate measurement.
- Timing uses `performance.now()`; RSS from `process.memoryUsage().rss`; optional Bun.gc(true) between phases.
- All queries hit the same SQLite database the TUI uses — no mocks.
- Harness: `tools/scale-bench/{generate-vault,run-workload,orchestrate}.ts`

## Limitations

- Synthetic generator produces ~75 nodes/file; real vaults observed at ~13 nodes/file. The 1x tier's 753k nodes is closer to a 5x real-vault in node terms.
- This actually makes the harness MORE stringent, not less — real 1x should load faster than measured here.
- Navigation measurement does not include React reconciler, flexily layout, or silvery rendering — those costs stack on top.
- Reconcile measurement is post-hydration (files already in DB). The pre-hydration full FS rescan (the expensive case) is not measured separately.
- FTS5 search number is dubious in memory mode; re-run on disk mode to get the real scaling number.
- 1x/2x/5x distribution details (p99, max) are transcribed from the live orchestrator log; the 10x entry is from the raw JSON.

## Reproduction

```bash
# Regenerate all tiers (this takes ~15 minutes on M5 Max for 10x):
bun tools/scale-bench/orchestrate.ts

# Single tier:
bun tools/scale-bench/orchestrate.ts --tiers=2x

# Skip generation (reuse existing /tmp/km-bench-vault-*):
bun tools/scale-bench/orchestrate.ts --skip-gen
```