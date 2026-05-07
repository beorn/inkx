# Hybrid Output Emission

Per-row density-based mode selection for the terminal output phase: whole-row, run-length, or per-cell scatter. Preserves silvery's 3.73x kanban advantage while closing cold-render gaps.

> Status: design + scaffold landed. Integration TBD. Parent analysis: ../../internals/perf-analysis-2026-04.md (Tier 2 recommendation E). Tracking bead: km-silvery.hybrid-output.

> Horizon note: This is a v1.0 terminal-runtime optimization. It lives under v05-layout/ because the output phase is the last layer of the layout→paint pipeline and the parent bead file was placed here. If the directory taxonomy is revisited it may move to v10-terminal/.

## 1. Problem statement

### Current state

`vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts` has two emission paths:

1. `bufferToAnsi(next, ...)` — full cold render. Walks the buffer row by row and writes every cell sequentially. One SGR transition per style change, no cursor jumps between cells on the same row. Used when `prev` is null or dimensions change.
2. `changesToAnsi(pool, count, ...)` — incremental diff emission. Sorts the dirty-cell pool by `(y, x)` then emits each cell with a cursor jump when the target differs from the current cursor. Uses the `\r\n` next-line shortcut when moving from the tail of row `y` to `x=0` on row `y+1`, and `CUF` for small forward jumps. Otherwise falls back to absolute `CUP` in fullscreen or relative cursor motion in inline mode.

`changesToAnsi` is brilliant for sparse updates (a single-cell text edit costs ~21 bytes), which is why silvery wins 3.73x on the kanban single-text-edit scenario. But it is **quadratic-pessimal in bytes** when the dirty set is dense:

- Each changed cell can cost up to one SGR transition, one cursor move, and the character itself.
- For a fully dirty row (e.g. a cold render falling through `changesToAnsi` because a dimension-less full-repaint path still emits cell-by-cell) this is ~15-30 bytes per cell vs ~1-2 bytes in the sequential row path.
- For a contiguous run of dirty cells, the cursor auto-advances — silvery avoids the per-cell `CUF` cost correctly, but it still forces a style recomputation per cell and still pays the allocation and `styleEquals` cost per cell.

### Measured gaps (from bench baseline)

Data from `vendor/internal/silvery/internals/perf-analysis-2026-04.md` (2026-04-09):

| Scenario                     | Silvery  | Ink      | Winner        | Gap     |
| ---------------------------- | -------- | -------- | ------------- | ------- |
| Flat list 10 items cold      | 0.336 ms | 0.294 ms | Ink 1.20x     | 0.042ms |
| Kanban 5×20 mounted (1 edit) | 1.04 ms  | 3.89 ms  | Silvery 3.73x | 2.85ms  |

The cold-render losses are fixed cost, but Pro's review called out that `changesToAnsi` degrades as dirty density grows: the cell-level emitter is strictly better than line-level emitters on sparse updates and strictly worse on dense ones, without any in-between.

A synthetic worst case: a full 80-col row whose text changed. Under the current emitter, that is 80 cells in the pool, 80 `styleEquals` comparisons, 80 char writes, and 0-1 cursor jumps. Under a whole-row emitter (the `bufferToAnsi` inner loop reused), that is 1 cursor jump to `(0,y)`, ~1-5 SGR transitions, 80 char writes. The cell count is the same; the per-cell overhead is not.

### What we are solving

Close the gap for dense dirty regions **without regressing the sparse path**. Do it by making the emission mode a per-row choice driven by measured density, not a global toggle.

## 2. Density analysis

### Inputs

For any row `y` that has at least one entry in the dirty pool, we can compute:

- `dirtyCount[y]` — number of pool entries with that `y` (after dedup of wide-char continuations).
- `dirtyMin[y]`, `dirtyMax[y]` — leftmost and rightmost dirty column on the row.
- `runCount[y]` — number of maximal contiguous dirty runs on the row. A run ends when the next dirty cell's `x` is greater than the previous `x + width`.
- `runBytes[y]` — an estimate of the byte cost of the run-length path (see §4).

These all fall out of a single linear pass over a per-row slice of the sorted pool, so the analysis itself is `O(dirty)` with no extra allocation beyond a per-row scratch buffer that we size to `cols`.

### Density threshold

We pick the mode by comparing three **estimated** byte costs, not by a hard density threshold. Density is still the primary signal because it dominates the cost difference, but the estimator is the arbiter.

As a sanity lower bound: if `dirtyCount[y] / width < 0.5` **and** `runCount[y] > 1`, the scatter path is almost always cheaper because cursor jumps are cheap and whole-row would waste bytes on clean cells. If `dirtyCount[y] / width >= 0.5`, whole-row becomes competitive because the per-cell cursor/style overhead dominates. The 50% figure comes from two observations:

1. At 50% density, the whole-row path writes `width` cells (all of them). The scatter path writes `dirtyCount = width/2` cells **plus** up to `runCount` cursor moves, **plus** the per-cell `styleEquals` cost. Cursor moves plus SGR transitions eat the saving from writing half as many cells.
2. At >50% density, contiguous runs tend to span >50% of the row anyway, so run-length already behaves like whole-row minus a prefix/suffix skip. Whole-row wins by avoiding the run bookkeeping.

The real decision is estimator-based (§4), and the threshold is the coarse pre-filter.

## 3. Emission modes

Each mode has the same invariant: **after emission, the terminal row matches the `next` buffer for every dirty column, and does not touch any clean column that is outside the span we intended to write.** The cursor state after the mode ends is documented so the next row can decide how to move.

### Mode A: Whole-row

Emit the entire row `[0, width)` as if we were in `bufferToAnsi`. Used when the row is effectively dense, the entire span from leftmost to rightmost dirty is near full width, or when the run-length estimator falls over because of many alternating runs.

```
cursor → (y, 0)      (CUP in fullscreen, \r + CUD/CUU + CUF in inline)
for x in 0..width:
  write cell(x, y)    (same inner loop as bufferToAnsi, including SGR diffing
                       against the previous cell written — not against the
                       screen)
```

Byte cost model (fullscreen, 80-col row, ~3 style runs): `~8 (CUP) + 3 * ~8 (SGR) + 80 (chars) ≈ 112 bytes`.

Wide-char handling matches `bufferToAnsi`: the wide cell is emitted once and `x` skips the continuation cell; we optionally emit a cursor resync after wide chars for emoji width drift.

Side effects: leaves the cursor at `(y, width)` in pending-wrap state. Next mode must not rely on auto-advance from pending-wrap — it must issue its own explicit positioning.

### Mode B: Run-length

Walk the dirty cells on the row grouped into maximal contiguous runs. For each run, move the cursor to `(y, runStart)` and write the cells in sequence. Let the cursor auto-advance within the run.

```
for each run (start, end) in sorted runs:
  moveCursorTo(y, start)
  for x in start..end:
    write cell(x, y)
```

This is a generalization of the current emitter for the case where the cells happen to be contiguous. In the current `changesToAnsi`, if two cells are adjacent and the cursor is already at the right place, no jump is emitted — so the practical distinction from the current code is that Mode B **guarantees** cursor-move amortization per run and avoids recomputing style transitions at the run boundary.

Byte cost model: `runCount * (~8 bytes cursor + ~8 bytes SGR) + totalDirty * ~1 byte char`.

Used when there are a small number of runs (1-3) that collectively cover less than ~50% of the row.

### Mode C: Per-cell scatter (current behavior)

Keep the existing `changesToAnsi` per-cell loop for this row. This is the optimal path when the dirty cells are truly scattered, because even constructing runs has a fixed bookkeeping cost, and whole-row wastes `width` worth of work.

Used when there is exactly one or two dirty cells, or when the cells are spread across so many runs that run-length has the same cost as scatter minus the bookkeeping.

### Mode selection per row

```
dirty = dirtyCount[y]
width = buffer.width

if dirty <= 2:
  return Scatter                  # trivially optimal
if dirty / width >= 0.5:
  return WholeRow                 # density dominates
if runCount[y] <= 3 and dirty / width < 0.5:
  return RunLength                # a few dense runs in a mostly clean row
# tie-break: pick cheapest estimated byte cost (see §4)
return argmin(estimateBytes(WholeRow), estimateBytes(RunLength), estimateBytes(Scatter))
```

## 4. Per-row decision algorithm

The estimator is the arbiter when the density heuristics do not already decide.

```typescript
function pickMode(row: DirtyRowSummary, width: number): EmissionMode {
  const { dirty, runCount, runs, bufferRow } = row

  if (dirty <= 2) return "scatter"
  if (dirty * 2 >= width) return "whole-row"
  if (runCount === 1) return "run-length"

  // Byte-cost estimator
  //   scatter:  dirty * PER_CELL_SCATTER
  //   runs:     runCount * RUN_PREAMBLE + dirty * PER_CELL_IN_RUN
  //   whole:    1 * ROW_PREAMBLE + width * PER_CELL_IN_ROW
  //
  // Constants calibrated from bench data; see §7.
  const scatterCost = dirty * 12
  const runCost = runCount * 10 + dirty * 2
  const wholeCost = 8 + width * 2

  let best: EmissionMode = "scatter"
  let bestBytes = scatterCost
  if (runCost < bestBytes) {
    best = "run-length"
    bestBytes = runCost
  }
  if (wholeCost < bestBytes) {
    best = "whole-row"
    bestBytes = wholeCost
  }
  return best
}
```

The constants are placeholders until we calibrate them from the new bench scenarios. The shape of the estimator matters more than the exact numbers — it has to pick the right mode on the three canonical scenarios (dense, run, scatter) and degrade gracefully in between.

## 5. Data structures

### DirtyRowSummary

Produced by the density analyzer from the sorted cell pool. One per row that has any dirty cells.

```typescript
/** Summary of dirty cells on a single row, used by the mode picker. */
export interface DirtyRowSummary {
  /** Row index in the buffer (not render-relative). */
  readonly y: number
  /** Number of dirty cells on the row (wide-char continuations deduped). */
  readonly dirty: number
  /** Leftmost dirty column. */
  readonly minX: number
  /** Rightmost dirty column (inclusive). */
  readonly maxX: number
  /** Number of maximal contiguous dirty runs. */
  readonly runCount: number
  /** Maximal contiguous dirty runs, inclusive ranges. */
  readonly runs: readonly DirtyRunSpan[]
  /** Offsets into the cell pool: [poolStart, poolEnd). */
  readonly poolStart: number
  readonly poolEnd: number
}

/** A contiguous run of dirty columns on a single row. */
export interface DirtyRunSpan {
  /** First dirty column in the run. */
  readonly start: number
  /** Last dirty column in the run (inclusive). */
  readonly end: number
}

export type EmissionMode = "whole-row" | "run-length" | "scatter"
```

### Zero-allocation considerations

The pipeline is aggressive about zero-per-frame allocation (see `diffPool`, `reusableCellStyle`, `wideCharLookupCell`). The summary layer must match that. Plan:

- Keep a module-level pool of `DirtyRowSummary` objects, grown lazily to `maxDirtyRows`.
- Keep a module-level pool of `DirtyRunSpan` objects, grown lazily to `maxRuns`.
- `DirtyRowSummary.runs` is a readonly view into a shared slab, re-populated per row.
- Reset-on-use semantics: summaries and spans are valid only until the next `analyze` call.

All three pools grow monotonically; they never shrink. This mirrors `diffPool`.

### CellChange pool ordering invariant

`changesToAnsi` sorts the pool by `(y, x)` before emission. The density analyzer must run **after** this sort so the per-row slices are contiguous. If the sort ever moves, the analyzer moves with it.

## 6. Integration with buffer diff

The existing diff path is unchanged:

```
diffBuffers(prev, next) → { pool, count }   # already O(dirty) via isRowDirty + rowEquals short-circuit
```

Hybrid emission hooks in **after** `diffBuffers` and **after** the existing `sortPoolByPosition`:

```
1. diffBuffers(prev, next) → { pool, count }
2. sortPoolByPosition(pool, count)
3. analyzeRowDensity(pool, count, width) → DirtyRowSummary[]   # new
4. for each row summary:
     mode = pickMode(summary, width)
     switch (mode) {
       case "whole-row": emitWholeRow(summary, next, ctx, state)
       case "run-length": emitRuns(summary, pool, ctx, state)
       case "scatter":   emitScatter(summary, pool, ctx, state)
     }
```

The per-row emitters share cursor state (`cursorX`, `cursorY`, `currentStyle`, `currentHyperlink`, `lastEmittedX/Y`) so that cross-row transitions can still use the `\r\n` shortcut when appropriate. The shared state is passed through an `OutputEmitState` record — a mutable object threaded through each emitter to preserve the existing zero-allocation discipline.

The wide-char resync that lives in `changesToAnsi` today moves into the shared state mutation too. Whole-row mode inherits the resync rules from `bufferToAnsi`.

### What we do not touch

- `diffBuffers` — already optimal.
- The `minDirtyRow`/`maxDirtyRow` bounding-box fast path.
- The `rowMetadataEquals` / `rowCharsEquals` / `rowExtrasEquals` row-level pre-check.
- The inline-mode cursor bookkeeping and the inline incremental fallback chain. Hybrid emission is only wired into the fullscreen incremental path in the first pass. Inline gets it in a follow-up commit.
- The dimension-mismatch full-render fallback.
- The wide-char cursor resync formulas.

### Compatibility with SILVERY_STRICT modes

STRICT runs the output phase twice per frame (incremental + fresh) and diffs the resulting ANSI. Hybrid emission must return byte-for-byte the same output only up to **terminal state equivalence**, not byte equivalence. STRICT already tolerates different byte streams that replay to the same cell grid via `verifyOutputEquivalence`, so the existing check is the correct gate.

`SILVERY_STRICT_TERMINAL=xterm` and `SILVERY_STRICT_TERMINAL=ghostty` replay the accumulated bytes through real emulators, catching bugs where our parser and the real terminal disagree. These must pass in hybrid mode because mode selection cannot depend on emulator quirks.

## 7. Testing strategy

### Must-have correctness checks

1. **Per-row parity**: for each row, every mode must produce an ANSI byte string that, when applied to the `prev` cell grid, yields the `next` cell grid exactly. This is verified by `verifyOutputEquivalence` in the existing STRICT path. Running `SILVERY_STRICT=1 bun run test:all` is the minimum bar.
2. **Mode coverage**: a unit test that constructs a synthetic row for each density bucket (dense, single-run, multi-run, sparse, fully clean) and asserts that the picker chooses the intended mode. See `tests/pipeline/output-density.test.ts` (to be added).
3. **Whole-row boundary wrap**: the last cell of a whole-row emission leaves the cursor in pending-wrap state. Moving to the next row must use the safe cursor strategy (`CUP` in fullscreen, `\r\n` only if the next cursor target is `(y+1, 0)` and style has been reset). Covered by `tests/pipeline/hybrid-cursor-transitions.test.ts` (to be added).
4. **Mixed-mode frames**: a frame that picks `whole-row` for row 5, `run-length` for row 6, and `scatter` for row 7 must still produce a correct terminal. Synthetic fixture + STRICT verification. Covered by `tests/pipeline/hybrid-mixed-modes.test.ts` (to be added).
5. **Wide characters on the boundary**: a wide char straddling the run boundary must not be split. The emitter must widen the run to cover both halves, mirroring the wide-char handling in `changesToAnsi`.
6. **All existing km-tui visual tests** must pass with `SILVERY_HYBRID_OUTPUT=1` set globally in the test setup.

### Bench scenarios (see §9)

Three new bench scenarios in `silvery-vs-ink.bench.ts`, each designed to stress one mode:

- `Dense row update` → favors whole-row.
- `Contiguous run update` → favors run-length.
- `Scatter update` → favors scatter (and should be a no-regression guard for the kanban case).

### How to verify correctness in practice

```bash
# 1. Unit mode picker
bun vitest run vendor/silvery/packages/ag-term/tests/pipeline/output-density.test.ts

# 2. Per-frame STRICT for every km-tui test
SILVERY_STRICT=1 SILVERY_HYBRID_OUTPUT=1 bun vitest run apps/km-tui/tests

# 3. Terminal-level STRICT (xterm + ghostty) on the visual suite
SILVERY_STRICT_TERMINAL=all SILVERY_HYBRID_OUTPUT=1 bun vitest run vendor/silvery/tests

# 4. Accumulate-mode STRICT (catches compounding errors)
SILVERY_STRICT_ACCUMULATE=1 SILVERY_HYBRID_OUTPUT=1 bun vitest run apps/km-tui/tests

# 5. Fuzz
FUZZ=1 SILVERY_HYBRID_OUTPUT=1 bun vitest run vendor/silvery/tests/features/incremental-rendering.fuzz.tsx

# 6. Bench baseline + hybrid
SILVERY_STRICT=0 bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
SILVERY_STRICT=0 SILVERY_HYBRID_OUTPUT=1 bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
```

The fuzz suite is the acid test: it generates random tree mutations, and any discrepancy between fresh and incremental renders at the cell level fails the test. Running the fuzz loop with and without `SILVERY_HYBRID_OUTPUT=1` is the strongest guarantee we have.

## 8. Rollout plan

Three commits in strict order, each independently revertable:

### Commit 1 — design + scaffold (this commit, no prod code touched)

Adds the two scaffold files (`output-density.ts`, `output-modes.ts`), the three bench scenarios, and this design doc. Scaffold functions throw "not implemented" and are not called from anywhere. `output-phase.ts` is untouched. CI passes because the scaffold is additive.

### Commit 2 — feature-flagged implementation

- Implement `analyzeRowDensity`, `emitWholeRow`, `emitRuns`, `emitScatter` and the shared `OutputEmitState`.
- Wire into `outputPhase` behind `process.env.SILVERY_HYBRID_OUTPUT === "1"`.
- Default **off**. All existing code paths behave identically.
- Add targeted unit tests for the mode picker.
- Run the STRICT suite with the flag on, verify parity.
- Run benches with and without the flag; capture numbers.

### Commit 3 — default-on + flag removal

- Flip the default to hybrid, keep `SILVERY_HYBRID_OUTPUT=0` as an opt-out during the soak period.
- Run one full `test:ci` pass and one real-app dogfood session (`bun km view`).
- After 1-2 weeks of dogfooding with no regressions reported, remove the flag entirely and delete the legacy single-mode path from `changesToAnsi`.
- Update `pipeline/CLAUDE.md` "Symptom → Check" table with hybrid-mode debugging guidance.

Rollback plan at each step: `git revert` the previous commit. Because each commit is self-contained and no data format changes, revert is strictly safe.

## 9. Expected impact

Baselines are captured from the current `silvery-vs-ink.bench.ts` run on 2026-04-09. Deltas are predictions based on the estimator model in §4. These become the acceptance gates for commit 2.

| Scenario                          | Baseline (silvery) | Prediction     | Rationale                                               |
| --------------------------------- | ------------------ | -------------- | ------------------------------------------------------- |
| Kanban 5×20 single edit (mounted) | 1.04 ms            | 1.00 – 1.05 ms | Scatter path unchanged; ≤5% overhead from mode picker   |
| Cursor move 100-item list         | 2.27 ms            | 2.15 – 2.30 ms | Run-length wins on the toggled item; rest is scatter    |
| Flat list 10 cold (80x24)         | 0.336 ms           | 0.29 – 0.31 ms | Whole-row reused path shortens cold by ~5-10%           |
| Flat list 100 (200x60) cold       | 3.18 ms            | 2.90 – 3.10 ms | Whole-row dominates; savings are proportional to width  |
| Dense row update (new)            | TBD                | 0.5–0.7x ink   | First scenario where silvery should beat ink decisively |
| Contiguous run update (new)       | TBD                | ≥1.5x ink      | Run-length encoding matches ink's strengths             |
| Scatter update (new)              | TBD                | ≥3x ink        | Same shape as kanban; scatter path must not regress     |

Acceptance gate for commit 2: **no scenario regresses by more than 3% from baseline, and the three new scenarios hit their predictions within 20%.**

## 10. Risks and mitigations

### R1 — Mode picker mispredicts on style-heavy rows

Style-heavy rows (lots of SGR transitions) inflate the whole-row byte cost beyond the estimator's assumption. If the estimator picks whole-row on a row where scatter would be cheaper, it may regress the kanban scenario.

- **Detection:** the kanban bench scenario guards against this at every commit.
- **Mitigation:** the estimator can be refined to count `styleRunCount` as part of `PER_CELL_IN_ROW`. If simple tuning fails, add an explicit short-circuit: if `dirtyCount <= 3 && width > 40`, always pick scatter.

### R2 — Whole-row emission leaks into clean columns

The whole-row path writes every cell in the row. If the `next` buffer has stale values in columns that were clean in the diff (e.g. because a prior frame wrote them and they were not marked dirty), whole-row will overwrite with the **correct** value anyway. The risk is the opposite: whole-row writes a cell that the terminal already has, costing bytes but not correctness.

- **Detection:** STRICT byte-accounting counters in bench mode. Add `__silvery_bench_output_detail.wholeRowRedundantCells`.
- **Mitigation:** mode picker keeps the scatter fallback. The bench counter becomes the tuning signal for the estimator.

### R3 — Hybrid path mishandles wide-char boundaries

The scatter path's wide-char handling is load-bearing. Any mode that emits spans must preserve the invariants: main cell emitted, continuation skipped, resync issued after wide chars.

- **Detection:** `tests/features/cjk` suite, `SILVERY_STRICT_TERMINAL=all` on wide-char fixtures, fuzz.
- **Mitigation:** whole-row mode reuses the `bufferToAnsi` inner loop which already handles wide chars. Run-length widens spans to cover both cells of a straddling wide char. Unit test explicitly added in phase 2.

### R4 — Inline-mode incremental path is not covered in phase 1

Inline mode uses its own cursor arithmetic (`\x1b[nA/nB`, `\r`, `\x1b[nC`) and doesn't share `changesToAnsi`'s fullscreen cursor model. Enabling hybrid for inline in the same commit risks breaking the inline cursor bookkeeping.

- **Detection:** inline-mode tests (`tests/inline-mode.test.ts`).
- **Mitigation:** phase 1 only enables hybrid in fullscreen mode. Phase 2 ports the mode picker to inline mode in a separate commit after fullscreen has soaked.

### R5 — Bench noise drowns out the signal

The absolute deltas are small (tenths of a millisecond). Bench noise could make the measurement look worse than it is.

- **Detection:** run each bench scenario 5 times and report the median.
- **Mitigation:** rely on the structural invariants — the mode picker is deterministic, and for a given input produces a fixed mode. Unit tests that assert mode selection per scenario give us a noise-free signal even when bench variance is high.

### R6 — Complexity budget in `output-phase.ts`

This file is already 2941 lines. Adding three more modes increases the surface area for future bugs.

- **Mitigation:** scaffold files (`output-density.ts`, `output-modes.ts`) move the new logic out of `output-phase.ts`. `output-phase.ts` gains only a small dispatch block. Public API of the new modules is limited to `analyzeRowDensity`, `pickMode`, `emitWholeRow`, `emitRuns`, `emitScatter`, `DirtyRowSummary`, `DirtyRunSpan`, `EmissionMode`.

## 11. Open questions for phase 2

These do not block the design but should be resolved before implementation:

1. **Should the estimator be calibrated per-terminal?** Ghostty handles CUF differently from iTerm2; in practice the byte cost is close enough to ignore. Recommend: no, single estimator, per-terminal tuning only if a bench regression shows up.
2. **Is there a cheap way to detect "this row is actually the full viewport width and every cell is dirty"?** This is the fast-path for `bufferToAnsi`-quality output when the whole screen was repainted (e.g. scroll tier 2). If `dirtyRowCount === height && dirtyCellsPerRow === width`, we could skip mode selection and call `bufferToAnsi(next)` directly. Worth measuring.
3. **Does the wide-char resync in whole-row mode need its own emitter, or can it share the `bufferToAnsi` code path verbatim?** Probably share; verify during implementation.
4. **Should we keep the `SILVERY_FULL_RENDER` bypass?** It's a debug aid that bypasses incremental entirely. Hybrid doesn't interact with it. Leave as-is.
5. **How do we expose mode telemetry in `SILVERY_INSTRUMENT=1` mode?** Add `__silvery_bench_output_detail.modeCounts: { wholeRow, runLength, scatter }`. This is the signal for tuning the estimator constants.

