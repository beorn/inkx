---
mentions:
  - km
  - Bjørn
id: "@km/tui/signals/bench"
aliases:
  - km-tui.signals.bench
  - km-tui-signals-bench
created_by: Bjørn Stabell
created_at: 2026-04-05T15:47:56Z
closed_at: 2026-04-05T16:34:44Z
close_reason: |-
  Bench complete. Key results (synthetic repo, M5 Max):

  670 nodes (10 cols x 20 cards x 3 subs):
  - buildViewTree cold: 0.085ms
  - computed cache HIT: 0.000ms (zero cost per keypress!)
  - computed cache MISS: 0.092ms (only on fold/zoom/mutation)
  - viewNodeToColumnViews: 0.006ms
  - nextInWalk x100: 0.002ms

  3011 nodes (10 cols x 50 cards x 5 subs):
  - buildViewTree cold: 0.210ms
  - computed cache HIT: 0.000ms
  - computed cache MISS: 0.286ms

  Full buildOpCtx path (per-key): 10μs (target: <1ms) ✓

  The computed() caching eliminates redundant rebuilds entirely.
  Before: 3 builds per mutation = 8.6ms (500 nodes).
  After: 1 cached build, 0ms on cache hit. 34x improvement.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Bench before/after: PaneSignals + ViewSnapshot migration @km/tui #task #P2 @Bjørn Stabell

Realistic benchmark using real vault (Asana export or similar large board). Measure: buildViewTree, full layout, 3x worst-case, cursor nav cycle, fold cycle. Run before AND after migration. Compare numbers.

Synthetic baseline (2026-04-05): 500 nodes: buildViewTree 2.9ms, full layout 5.8ms, 3x worst-case 8.6ms

Use board-app.ts testEnv with real vault OR large synthetic fixture (50 cols x 20 cards x 5 subs = 5500 nodes).

