# Hybrid Output Emission — Design (Recovered)

**Status**: Phase 2 implementation. Phase 1 (scaffold) shipped 2026-04 in
`packages/ag-term/src/pipeline/output-density.ts` and `output-modes.ts` with
all functions throwing.

**Tracking bead**: `km-silvery.known-limits.hybrid-output`.

> This document was recovered from JSDoc in 2026-04-26. The original design
> doc lived in the now-archived `silvery-internal` submodule (absorbed into
> `hub/silvery/` 2026-04-17 — only `pretext-integration.md` was migrated at
> the time). Treat this as the authoritative reference going forward.

## 1. Problem

The existing `changesToAnsi` in `output-phase.ts` is a single ~360-line
function that interleaves three emission strategies inside a per-cell loop:

1. Per-cell scatter (the original loop).
2. Whole-row emission (added inline as the "dense rows" branch).

It works, but:

- The hybrid choice is binary (>50% width → whole row, else scatter); there
  is no middle tier for "5 cells in 2 contiguous runs on a 80-col row" where
  run-length emission would be cheapest.
- The dense-row branch and scatter branch have ~80% duplicated cursor /
  style transition logic, making the file fragile to edit.
- The cost heuristic is hardcoded inline; we cannot tune or test it in
  isolation.

Phase 2 splits the function into clean parts:

- `output-density.ts` analyzes the dirty pool into per-row summaries +
  picks an emission mode.
- `output-modes.ts` ships three emitters that share a per-cell inner loop.

## 2. Density analysis

`analyzeRowDensity(pool, count, width)` produces a `DensityAnalysis` with
one `DirtyRowSummary` per dirty row.

Algorithm:

1. Walk the sorted pool once. For each maximal `y`-group:
   - Track `minX`, `maxX`, `dirty`.
   - Dedupe wide-char **continuation** cells from the `dirty` count
     (the main cell pays for both halves), but keep them in the run span
     so the emitter can widen the run to cover both halves.
   - Build runs by tracking the previous `x`. A new cell extends the
     current run when `x === prevX + 1` (or `x === prevX + 2` immediately
     after a wide char — the continuation is implicit). Otherwise close
     the current run and open a new one.
2. Record `poolStart` (inclusive) and `poolEnd` (exclusive) for each row
   so emitters can iterate the row's slice without re-scanning.
3. Reuse module-scoped pools for both `DirtyRowSummary` objects and
   `DirtyRunSpan` objects so steady-state allocation is zero.

Postcondition: rows are returned in ascending `y` order (the input pool
is already sorted by `(y, x)`).

## 3. Emission modes

Three modes, all sharing an inner per-cell helper:

### Mode A — `emitWholeRow`

Used when most of a row changed. Re-emits cells `[0, width)` from the
buffer, starting with one cursor jump to `(y, 0)`.

- One CUP per row (~6 bytes).
- One byte per cell (best case — same style as cursor).
- Closes hyperlinks and resets bg before the row-end transition.

### Mode B — `emitRuns`

Used when a small number of contiguous spans changed.

- One cursor jump per run (CUF for short gaps, CUP for long gaps).
- Cells inside a run rely on auto-advance.
- Wide-char continuations are absorbed by `analyzeRowDensity` widening
  the run; the emitter trusts `run.start` / `run.end`.

### Mode C — `emitScatter`

Used when changes are sparse (≤2 cells, isolated cells).

- Per-cell cursor jump (matches the legacy `changesToAnsi` behavior).

All three mutate a shared `OutputEmitState` so cross-row cursor state is
preserved (the `\r\n` shortcut between row N's last cell and row N+1's
first cell still works).

## 4. Cost estimator

```
PER_CELL_SCATTER  = 8   // ~CUP(6) + char(2) per cell, amortized
RUN_PREAMBLE      = 6   // one CUP per run
PER_CELL_IN_RUN   = 2   // char + minor SGR amortization
ROW_PREAMBLE      = 6   // one CUP per row
PER_CELL_IN_ROW   = 2   // char + minor SGR amortization

scatterCost = dirty * PER_CELL_SCATTER
runCost     = runCount * RUN_PREAMBLE + dirty * PER_CELL_IN_RUN
wholeCost   = ROW_PREAMBLE + width * PER_CELL_IN_ROW
```

Fast paths (skip estimator):

- `dirty <= 2` → `scatter` (always cheapest).
- `dirty * 2 >= width` → `whole-row` (≥50% coverage, matches legacy).
- `runCount === 1` → `run-length` (one preamble + tight cells).

These fast paths keep the hot path branchless. The estimator runs only
for the middle band where the choice is non-obvious.

## 5. Data structures

All summary objects live in module-scoped pools that grow lazily:

- `summaryPool: DirtyRowSummary[]` — one per row.
- `runPool: DirtyRunSpan[]` — global pool, sliced into per-row arrays.

Per-frame, the analyzer tracks `summaryCount` and `runCount` and rewinds
both to zero at the start of `analyzeRowDensity`. Callers must not retain
references after the next call.

## 6. Wide-char handling

Wide chars touch two columns: a main cell with `wide: true` and a
continuation cell with `continuation: true`. The pool may contain either
or both, depending on what changed.

Density analysis:

- Continuation cells **count toward run span** (so emitters cover both
  halves) but **do not increment `dirty`** (the main cell pays once).
- When only the continuation changed (rare — orphan), the analyzer still
  records both columns in the span; `emitScatter` is responsible for
  looking up the main cell from the buffer.

## 7. Testing

Phase 2 adds three unit tests in
`vendor/silvery/tests/output-density.test.ts`:

1. **Dense row update** — modify ≥50% of a row → expect `whole-row`.
2. **Contiguous run update** — modify 5 contiguous cells on a 80-col row
   → expect `run-length`.
3. **Scatter update** — modify 3 isolated cells across 3 rows → expect
   `scatter`.

Plus emitter-level golden tests asserting:

- Cursor state mutations match the documented post-conditions.
- Wide-char widening leaves no half-rendered cells.
- Cross-row `\r\n` shortcut still fires.

Phase 3 wires the new path into `output-phase.ts` behind
`SILVERY_HYBRID_OUTPUT=1`. Until then, the new emitters are reachable
only via direct unit tests; legacy `changesToAnsi` is unchanged.

## 8. Migration plan

1. **Phase 2 (this commit)**: implement the three emitters + density
   analyzer + tests. Legacy `changesToAnsi` untouched. New code path
   reachable via direct imports only.
2. **Phase 3**: behind `SILVERY_HYBRID_OUTPUT=1`, replace the inline
   dense-row branch in `changesToAnsi` with `analyzeRowDensity` +
   per-row `pickEmissionMode` dispatch. Keep the legacy code path as
   the default.
3. **Phase 4**: tune cost constants against the
   `Dense / Contiguous / Scatter` bench scenarios (added to
   `silvery-vs-ink.bench.ts`).
4. **Phase 5**: flip the default; delete the legacy code path.
