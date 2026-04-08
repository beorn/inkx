# Benchmarking

How we measure and track performance in km and silvery.

## Principle

**Bench numbers must represent production conditions.** Test-only overhead (SILVERY_STRICT, checkIncremental) is disabled during benchmarks. If a bench includes verification overhead, its numbers are useless for optimization decisions. See `docs/lessons/reactive-tree.md` for the cautionary tale.

## Running Benchmarks

```bash
bun bench                              # All benches (STRICT=0 automatic)
bun bench apps/km-tui/tests/           # km-tui benches only
bun bench vendor/silvery/tests/perf/   # silvery pipeline only
```

`bun bench` sets `SILVERY_STRICT=0` in `package.json`. This is intentional — benchmarks measure production perf.

## What We Benchmark

### km-tui (integration — full stack)

| File | What | Key metric |
|------|------|------------|
| `cursor-perf.bench.ts` | j/k/h/l press latency at various card counts + terminal sizes | ms/press |
| `cursor-real-vault.bench.ts` | Same but with real vault data (`/tmp/vt`) | ms/press |
| `reduced-signals.bench.ts` | (deleted — was for old count engine) | — |
| `computed-vs-engine.bench.ts` | Head-to-head: computed vs count engine | ops/sec |

### silvery (pipeline — isolated phases)

| File | What | Key metric |
|------|------|------------|
| `tests/perf/render.bench.ts` | Full pipeline: React + layout + render + output | ms/render |
| `tests/perf/layout.bench.ts` | Layout computation only (no React, no rendering) | ms/layout |
| `tests/perf/diff.bench.ts` | Buffer diff + ANSI output generation | ms/diff |
| `tests/perf/memory.bench.ts` | Memory under load: buffers, layout nodes, pipeline | bytes |

## Current Numbers (2026-04-08)

### Production per-press (200x60, 3700 cards)

| Phase | Time | % |
|-------|------|---|
| React reconciliation | ~5ms | 76% |
| Silvery pipeline | ~1.6ms | 24% |
| **Total** | **~6.6ms** | — |

Well under 16ms frame budget at standard terminal size.

### Bench per-press (includes testEnv overhead)

| Terminal | Cards | Per-press | Notes |
|----------|-------|-----------|-------|
| 200x60 | 100-3700 | 84-88ms | Includes React testEnv act() overhead |
| 400x200 | 500-3700 | 622-626ms | Large terminal — rendering bottleneck |

Bench numbers are higher than production because testEnv includes additional React lifecycle overhead that doesn't exist in a running app.

## History

Results are saved to `benchmarks/history.jsonl`. Each entry records commit SHA, timestamp, bench file, and per-scenario results. Compare with:

```bash
bun bench --compare benchmarks/baseline.json  # vitest compare mode
```

## When to Bench

| Trigger | What to run |
|---------|-------------|
| Before/after refactor | `bun bench` (full suite) |
| "Feels slow" report | `cursor-real-vault.bench.ts` with real vault |
| Silvery pipeline change | `vendor/silvery/tests/perf/` |
| New signal/state system | `computed-vs-engine.bench.ts` or equivalent |

## NOT in CI

Benchmarks are **not run in CI**. Shared runners have variable load, noisy neighbors, and inconsistent hardware. Results are unreliable. All benchmarks run locally on the developer's machine.

## Live Diagnostics

For production-representative timing without running benches:

```bash
# Per-keypress phase timing (loggily spans)
TRACE=silvery:render DEBUG_LOG=/tmp/perf.log bun km view ~/vault

# Render phase stats (node visit/skip/render counts)
SILVERY_INSTRUMENT=1 bun km view ~/vault

# Full pipeline debug output
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view ~/vault
```

## Perf Budgets

| Metric | Budget | Current | Status |
|--------|--------|---------|--------|
| Keypress latency (200x60) | <16ms | ~6.6ms | Under |
| Startup time | <500ms | Unknown | Not measured |
| Memory (1000 nodes) | <100MB | ~3MB reactive tree | Under |
| Scaling (100 vs 3700 cards) | <10% diff | ~5% | Under |
