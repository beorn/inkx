# benchmarks/

km performance benchmarks. **Manual ritual only — not in CI.** Vitest bench numbers are too sensitive to system load to be useful as a CI gate; we run them by hand on a quiet machine, with the rest of the tribe paused.

## Quick start

```bash
# Run the cursor-perf bench with the full ritual.
scripts/bench-now.sh

# Compare HEAD against an older commit.
scripts/bench-compare.sh HEAD~5
```

## What's in here

| Path                                | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `history.jsonl`                     | One JSON line per `bench-now.sh` invocation. Append-only.           |
| `results/<sha>-<ts>.txt`            | Raw vitest output + per-phase breakdown for one run.                |
| `results/.last-phases.json`         | Latest per-phase data, written by `withBenchPhases()`. Overwritten. |
| `baseline.json`                     | Baseline for `bun bench:compare` (existing infrastructure).         |

## Bench files

Located in `apps/km-tui/tests/`:

| File                          | What it measures                                                              |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `cursor-perf.bench.ts`        | Cursor j/k navigation latency at 100/500/1000/2000/3700 cards, 200x60 + 400x200 |
| `cursor-real-vault.bench.ts`  | Same as above but on a realistic 750-node board (portable fixture by default) |
| `breadcrumb-stale-on-hl.bench.ts` | Breadcrumb update cost on h/l navigation                                  |
| `level-nav-invariants.bench.ts`   | Tree-level navigation cost                                                |
| `architecture.bench.ts` / `architecture-bench.bench.ts` | Architecture-level micro-benchmarks               |
| `board.bench.ts`              | Board layer micro-benchmarks                                                  |

The cursor-perf and cursor-real-vault benches use `withBenchPhases()` to attach per-phase timing data to each iteration. Other benches still produce wall-clock numbers but no phase breakdown.

## The bench ritual: scripts/bench-now.sh

```text
1. Identify HEAD sha + timestamp
2. Check 1-min CPU load average; abort if load > 0.5 * cores (override: BENCH_FORCE=1)
3. Broadcast "BENCH STARTING" to all tribe sessions
4. Sleep 5s to let other agents object
5. Reset benchmarks/results/.last-phases.json so we don't merge stale data
6. Run `bunx --bun vitest bench --run <bench-file>`, capture output to results/<sha>-<ts>.txt
7. Run scripts/bench-format-phases.ts to render the phase breakdown, append to result file
8. Append a one-line JSON summary to benchmarks/history.jsonl
9. Broadcast "bench done" to the tribe
10. Print a short summary to stdout
```

Skip CPU check: `BENCH_FORCE=1 scripts/bench-now.sh`
Skip tribe broadcast: `BENCH_NO_TRIBE=1 scripts/bench-now.sh`
Run a different bench: `scripts/bench-now.sh apps/km-tui/tests/breadcrumb-stale-on-hl.bench.ts`

## history.jsonl schema

Append-only newline-delimited JSON, one record per `bench-now.sh` run:

```json
{
  "ts": "2026-04-07T18-46-30Z",
  "sha": "3ee6519",
  "benchFile": "apps/km-tui/tests/cursor-perf.bench.ts",
  "cores": 16,
  "load": 1.42,
  "benches": [
    { "name": "100 cards — 20 j-presses", "hz": 0.477, "meanMs": 2096.46 },
    { "name": "500 cards — 20 j-presses", "hz": 0.480, "meanMs": 2083.21 }
  ],
  "phases": [
    {
      "name": "cursor-perf:200x60:100-cards",
      "iterations": 5,
      "wallMs": 10481.7,
      "phases": {
        "measure": 11.9,
        "layout": 65.4,
        "scroll": 5.3,
        "scrollRect": 3.6,
        "notify": 3.2,
        "layoutTotal": 89.4,
        "content": 811.5,
        "output": 8076.8,
        "total": 8979.7,
        "reconcile": 0,
        "pipelineCalls": 340,
        "renderCalls": 340
      }
    }
  ]
}
```

`phases` is an array because a single bench file may declare multiple `withBenchPhases(...)` accumulators.

## Per-phase breakdown — what each phase covers

Source: `vendor/silvery/packages/ag-term/src/pipeline/index.ts` and `pipeline/CLAUDE.md`. The pipeline runs every frame in this strict order:

| Phase             | What runs                                                                      | Regression causes                                            |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `react reconcile` | React reconciliation against the SilveryNode tree (only tracked in `createApp` paths, not in test renderers — shows as 0 there) | New component allocations, broken `React.memo`, expensive context, large fan-out subtrees |
| `measure`         | `measurePhase()` — intrinsic-size measurement for `width/height="fit-content"` | New fit-content nodes, expensive text measurement            |
| `flexbox layout`  | `layoutPhase()` — Yoga's `calculateLayout()`                                    | Larger trees, broken layout caching, dimension thrashing     |
| `scroll`          | `scrollPhase()` — visible-children calculation for overflow=scroll containers   | More scroll containers, expensive sticky positioning         |
| `scrollRect`      | `scrollrectPhase()` — screen-relative rect propagation                          | Deeper trees                                                 |
| `notify`          | `notifyLayoutSubscribers()` — fires `useBoxRect`/`useScrollRect` callbacks  | More layout subscribers, expensive callbacks                 |
| `layout side total` | Sum of measure + layout + scroll + scrollRect + notify                        | —                                                            |
| `content (render)` | `renderPhase()` — walks the tree, writes cells to the TerminalBuffer            | New nodes, broken incremental skip path, sticky pass forced refresh |
| `output (diff/ANSI)` | `outputPhase()` — diffs prev vs current buffer, emits ANSI escape sequences   | More cells changed, expensive ANSI generation, incremental disabled |
| `other`            | Wall - (reconcile + layout + content + output). Includes setup, store updates, key handling, the React act() wrapper, garbage collection. | Test harness overhead, GC pressure, store update churn       |

## Realistic-board fixture

`apps/km-tui/tests/fixtures/realistic-board.ts` builds a deterministic ~770-node board (10 columns × 15 cards × 3-5 sub-items, mixed inline content). The JSON snapshot lives at `realistic-board.json` and is regenerated via:

```bash
bun apps/km-tui/tests/fixtures/realistic-board.ts --write
```

Loader: `loadRealisticBoardFixture()` returns `{ repo, rootId, nodeCount }` ready for `testEnvWithRepo()`. `cursor-real-vault.bench.ts` uses this fixture by default; set `KM_BENCH_VAULT=/path/to/vault` to opt back into a real vault.

## bench-compare.sh

Runs the same bench in two worktrees (a temporary `/tmp/km-bench-<sha>` for the historical ref and the current `REPO_ROOT` for HEAD), then prints a diff per bench name and per phase.

```bash
scripts/bench-compare.sh HEAD~5
scripts/bench-compare.sh HEAD~5 apps/km-tui/tests/breadcrumb-stale-on-hl.bench.ts
KEEP_WORKTREE=1 scripts/bench-compare.sh HEAD~5    # don't auto-remove the worktree
```

The script:

1. Creates a detached worktree at `/tmp/km-bench-<short-sha>` for the ref.
2. Runs `git submodule update --init` for the standard vendor packages.
3. Copies `vendor/vt100/` from the parent if the ref doesn't have it as a submodule.
4. Runs `bun install` in the worktree.
5. Runs the bench in BOTH the worktree and the current repo.
6. Diffs per-bench mean ms and per-phase wall time.
7. Removes the worktree on exit (unless `KEEP_WORKTREE=1`).

## Why no CI?

The user explicitly rejected CI integration: vitest bench numbers fluctuate by 20-40% between runs even on a quiet machine. CI would either be useless (huge thresholds) or noisy (constant false positives). Manual runs with system-load checks and tribe coordination give us the apples-to-apples comparisons we actually need.

## Past learnings

- **`exclude: alwaysExclude` in `vitest.config.ts` benchmark section** is required so vitest bench doesn't walk into `.claude/worktrees/` subtrees and `.direnv/` flake mirrors. Removing it brings back `bun:sqlite import error` cascades.
- **`bunx --bun vitest bench`** is required: without `--bun`, vitest runs under node and `bun:sqlite` imports fail.
- **Cursor latency is fixed-cost, not per-node** at the time of writing. 100 cards and 3700 cards both clock ~2050ms per 20-press iteration at 200x60. The bottleneck is `output` phase (~77% of wall) — each frame regenerates a lot of ANSI even though only the cursor styling changed. See bead `km-tui.cursor-output-cost` if it gets created from this finding.
