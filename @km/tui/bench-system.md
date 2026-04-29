---
id: "@km/tui/bench-system"
aliases:
  - km-tui.bench-system
  - km-tui-bench-system
created_by: Bjørn Stabell
created_at: 2026-04-07T18:38:05Z
closed_at: 2026-04-07T19:34:17Z
close_reason: "Implemented in 7e4d317d9 (portable realistic-board fixture +
  per-phase timing helper) + 2e7e26b20 (bench-now.sh manual ritual with tribe
  coordination + history) + 45a83e8cd (bench parser robustness fixes) +
  56fef3dab (seed history.jsonl). Silvery phase markers committed at e3c806e in
  vendor/silvery worktree but DEFERRED for main vendor/silvery merge — another
  tribe session has uncommitted silvery work blocking the bump. Major finding
  from agent's profiling: silvery output phase = 73-89% of cursor wall time on
  synthetic boards. React reconcile = 0%, layout = 1%, content = 8%. The cursor
  sluggishness is in silvery's diff/ANSI generation, not km-tui rendering."
---

# [x] Manual + tribe-coordinated bench ritual with per-phase timing breakdown @km/tui #feature #P1 @Bjørn Stabell

## Why

User reported `km view` cursor sluggishness on 2026-04-07. We had benchmarks (`apps/km-tui/tests/cursor-perf.bench.ts`, `cursor-real-vault.bench.ts`) but:
- No saved baseline → bench:compare had nothing to compare against
- No CI gate (rejected as too noisy / unreliable timing)
- No portable real-board fixture (cursor-real-vault.bench.ts depends on /tmp/vt)
- No phase breakdown — "104ms per j-press" doesn't tell us where the time goes

The current bench is also useless for spotting regressions because it just produces a number, not a profile.

## Goal

Manual + tribe-coordinated bench ritual that produces:
1. Apples-to-apples comparisons (system load checked + paused via tribe)
2. Per-phase timing breakdown (react reconcile / flexily layout / silvery output / silvery diff / content cells / other)
3. Per-commit history file we can git-diff or git-blame
4. Portable fixture (no /tmp/vt dependency) — runs anywhere, same numbers

## Deliverables

### 1. `scripts/bench-now.sh` — manual bench ritual

Steps:
- Run `/cpu` (or `cpu_hunter` script if `/cpu` is a slash command) to identify load. If load > 0.5 × cores, abort with a warning.
- Broadcast via tribe: `tribe_send to=* "BENCH STARTING — please pause CPU-heavy work for 60s"`
- Wait ~5s for any objections (no ACK protocol — assume silence = consent)
- Run the cursor bench (or whatever bench file is passed as arg, default cursor-perf.bench.ts)
- Capture output to `benchmarks/results/<commit-sha>-<timestamp>.txt`
- Append a summary line to `benchmarks/history.jsonl` with `{commit, timestamp, mean-ms-by-bench-name, system-load-at-start}`
- Broadcast `tribe_send to=* "bench done"`
- Print the summary to stdout

### 2. `scripts/bench-compare.sh <ref>` — historical comparison

- Spins up a git worktree at the given ref (commit or HEAD~N) at `/tmp/km-bench-<sha>`
- Runs `bun install` if needed, inits submodules
- Runs the same bench in that worktree
- Diffs the bench output against the current HEAD result (from history.jsonl, or runs current HEAD if no recent entry)
- Removes the worktree afterward
- Reports the diff per-bench-name with % change

### 3. Per-phase timing breakdown

The current cursor-perf.bench.ts just measures the entire `board.command("cursor_down")` round-trip. We need a profile-style breakdown.

Add `performance.mark()` + `performance.measure()` markers in the silvery render loop and in @km/tui board rendering for these phases:
- `react-reconcile` — React reconciliation pass (start at top of render, end after children mounted)
- `flexily-layout` — Flexily layout pass (silvery already exposes this)
- `silvery-output` — silvery's output phase (ANSI generation)
- `silvery-diff` — silvery's diff against previous frame
- `content-cells` — inline content rendering inside cells

Then make the bench harness collect the marks via `performance.getEntriesByType("measure")` between iterations and report a per-phase breakdown like:

```
Full pipeline: 20 j-presses on column of 1000 cards (200x60)
  total:           2101ms
    react reconcile:  462ms (22%)
    flexily layout:   735ms (35%)
    silvery diff:     378ms (18%)
    content cells:    504ms (24%)
    other:            22ms  (1%)
```

If silvery already has a `_perfLog` flag (it does — set via env var, writes to /tmp/silvery-perf.log), reuse and extend that. Don't reinvent.

### 4. Portable realistic-board fixture

Replace `/tmp/vt` dependency with a checked-in JSON fixture:
- `apps/km-tui/tests/fixtures/realistic-board.json` — synthesized board: 10 columns × 50 cards × 3-5 sub-items each, mixed inline content (broken wikilinks, tags, projects, mentions, code spans, bare URLs, markdown links)
- Helper `loadRealisticBoardFixture()` in tests/helpers/ that creates a fake repo from the JSON
- Update `cursor-real-vault.bench.ts` to use the fixture if /tmp/vt is missing (or rename to `cursor-realistic-board.bench.ts`)

The fixture should be deterministic and reproduce on any machine. Aim for ~750 nodes total to mirror /tmp/vt scale.

### 5. Documentation

`benchmarks/README.md`:
- How to run a bench (`scripts/bench-now.sh`)
- How to compare against history (`scripts/bench-compare.sh <ref>`)
- The phase breakdown — what each phase covers and what would cause regressions in it
- Which benches exist and what they measure
- The history.jsonl schema

## Acceptance

- [ ] `scripts/bench-now.sh` exists, executable, runs cleanly with tribe coordination
- [ ] `scripts/bench-compare.sh HEAD~5` works end-to-end and reports a diff
- [ ] `benchmarks/history.jsonl` has at least one entry from running bench-now.sh on current HEAD
- [ ] `benchmarks/README.md` exists with the schema + usage docs
- [ ] cursor-perf.bench.ts (or its replacement) reports per-phase timing
- [ ] Portable fixture exists at `apps/km-tui/tests/fixtures/realistic-board.json` and is usable by the bench
- [ ] One bench run on current HEAD recorded to history with phase breakdown

## Out of scope

- No CI integration (user explicitly rejected this — unreliable timing on shared runners)
- No automatic regression alerts
- No baseline.json for bench:compare — that script exists but is fine as-is

## Related

- @km/tui/cursor-perf-2026-04-07 (P1) — the regression that motivated this
- @km/tui/hierarchical-node-state (will be filed) — depends on having before/after bench numbers