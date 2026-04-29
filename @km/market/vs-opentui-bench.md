---
id: "@km/market/vs-opentui-bench"
aliases:
  - km-market.vs-opentui-bench
  - km-market-vs-opentui-bench
created_by: Bjørn Stabell
created_at: 2026-04-15T23:22:36Z
---

# [ ] Benchmark suite: silvery vs OpenTUI (harness + scenarios) @km/market #task #P2

blocks:: [[@km/market]]

Fair perf benchmark harness comparing silvery vs OpenTUI. Back the vs-opentui comparison doc (@km/market/vs-opentui) with real numbers.

**Harness**:
- Monorepo vendor/internal/silvery/bench/silvery-vs-opentui/
- Two apps rendering same scene: React + @silvery/ag-react and React + @opentui/react
- Headless terminal backend (termless / vterm.js) for determinism
- Scripted driver injects synthetic keys/resize events at known timestamps

**Metrics per run**:
- Time-to-first-frame (cold start)
- Mount time for N items
- Per-frame render time (p50, p95, p99)
- Bytes emitted to terminal per frame (incremental efficiency proxy)
- CPU time (process.cpuUsage())
- RSS delta (process.memoryUsage().rss)

**Scenarios**:
1. cold-start-1k — mount 1,000-item list, measure first-frame time
2. type-latency — 500 keystrokes into text input, per-keystroke render time
3. scroll-10k — 10k-item VirtualList, top-to-bottom scroll
4. resize-churn — rapid resize, layout recompute cost
5. full-redraw — 200x50 dense styled grid, 100 full repaints
6. sparse-update — same grid, change one cell per frame, 1000 frames (dirty-flag efficiency)
7. tree-heavy — 20-level deep tree, 500 nodes, small leaf prop change
8. animation — spinner + progress bar at 60fps for 10s

Scenarios 2/6/7 favor silvery (incremental + memo). Scenarios 3/5/8 favor OpenTUI (native throughput). 1/4 are genuinely unclear — the interesting battlegrounds.

**Bench both OpenTUI+React and OpenTUI+Solid** to separate reconciler cost from core cost.

**Honest caveats to publish**:
- Same React version, same grid size
- Headless backend — real TTY adds latency floor
- Incremental-efficiency metric is a proxy, not latency

Effort: ~2-3 days harness + 1 day tuning + 1 day run/writeup. Steal shape from existing silvery-benchmark Ink comparison infra.