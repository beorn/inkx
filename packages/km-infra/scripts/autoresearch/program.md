# Autoresearch: km Performance Optimization

> Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch).
> You are an autonomous AI agent optimizing km's performance.

## Your Mission

Improve km's benchmark scores **without degrading code quality**. You make small,
focused changes to the codebase, measure their effect, and keep only genuine
improvements. You never stop — iterate until interrupted.

## Setup (once per session)

```bash
cd /Users/beorn/Code/pim/km

# 1. Agree on a run tag with the human (e.g., "mar21")
RUN_TAG="<tag>"
git checkout -b autoresearch/$RUN_TAG

# 2. Read this file, then read results.tsv if it exists
# 3. Run baseline
bun packages/km-infra/scripts/autoresearch/run.ts --baseline
```

## Experiment Loop (repeat forever)

### 1. Choose an experiment

Pick ONE small, focused change. Good experiments:

- **Algorithmic**: Replace O(n²) with O(n), add caching/memoization, batch operations
- **Data structure**: Array→Map, linear search→index lookup, pre-compute derived values
- **Hot path**: Reduce allocations in render/layout/render phases, avoid unnecessary work
- **Remove waste**: Dead code paths, redundant computations, unnecessary copies

Bad experiments (DO NOT):

- Rewrite entire files or modules
- Add abstraction layers "for performance"
- Micro-optimize cold paths
- Trade readability for <5% improvement
- Add complexity that makes the code harder to understand

### 2. Implement the change

Modify the relevant source file(s). Keep changes minimal — one idea per experiment.

### 3. Commit

```bash
git add -A
git commit -m "experiment: <one-line description of what you changed>"
```

### 4. Run measurement

```bash
bun packages/km-infra/scripts/autoresearch/run.ts
```

This will:

- Run `bun fix` (lint + format) — abort if it fails
- Run `bun run test:fast` — abort if tests fail
- Run benchmarks and profile-startup
- Measure complexity delta (lines changed, complexity score)
- Compare against baseline
- Output a VERDICT: KEEP or DISCARD with reasons

### 5. Act on verdict

**If KEEP**: The commit stays. Move to the next experiment.

```bash
# Verdict will have already appended to results.tsv
# Continue to next experiment
```

**If DISCARD**: Reset the commit, try something else.

```bash
git reset --hard HEAD~1
# Try a different approach
```

### 6. Never stop

Go back to step 1. Each experiment takes ~2-5 minutes. You should complete
~12-30 experiments per hour. The human will interrupt you when done.

## Decision Criteria

An experiment is **KEEP** when ALL of these hold:

1. **Performance improved**: Geometric mean of benchmark medians improved by ≥2%
2. **Tests pass**: `bun run test:fast` exits 0
3. **Lint passes**: `bun fix` exits 0
4. **Complexity budget**: Net lines added ≤ 10, no new functions with complexity > 20
5. **No regressions**: No individual benchmark regressed by > 10%

An experiment is a **STRONG KEEP** (notable) when:

- Geometric mean improved by ≥10%, OR
- Any single benchmark improved by ≥25%

An experiment is **DISCARD** when ANY of these hold:

- Tests fail
- Lint fails
- Performance regressed or improved < 2% (noise threshold)
- Lines added > 10 without proportional perf gain (>1% per line)
- Any individual benchmark regressed > 10%

## What You Can Edit

**Fair game** (these are the hot paths):

- `vendor/silvery/` — Rendering pipeline, layout, render phase, output phase
- `vendor/flexily/` — Layout engine
- `packages/km-storage/` — SQLite queries, node caching, tree traversal
- `packages/km-board/` — Board state derivation, column computation
- `apps/km-tui/src/` — React components, hooks, state management
- `packages/km-markdown/` — Parser, serializer

**Off limits** (do not modify):

- `packages/km-infra/scripts/autoresearch/` — This tooling
- `benchmarks/*.bench.ts` — The measurements themselves
- `tests/` — Test files (except to fix tests you broke)
- `package.json`, `tsconfig.json` — Config files
- `.claude/` — Skill files

## Tips

- **Profile first**: Run `bun apps/km-tui/tests/profile-startup.ts 2>&1` to see where
  time is spent. Focus on the slowest phases.
- **Read the benchmark**: Before optimizing, understand what's being measured.
  `benchmarks/*.bench.ts` shows exact operations.
- **Silvery pipeline**: The `__silvery_last_pipeline` breakdown shows
  measure/layout/content/output phase times. Content and layout are usually the bottleneck.
- **Simpler is better**: If two changes give equal improvement, prefer the one that
  removes code over the one that adds it.
- **Compound gains**: Small improvements compound. 3% + 3% + 3% = ~9.3% total.
- **Check allocations**: `new Map()`, `new Set()`, spread `{...obj}`, `Array.from()` in
  hot paths are common perf killers.
