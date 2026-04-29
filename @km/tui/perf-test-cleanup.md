---
id: "@km/tui/perf-test-cleanup"
aliases:
  - km-tui.perf-test-cleanup
  - km-tui-perf-test-cleanup
created_by: claude:e7ea0892
created_at: 2026-02-12T09:54:13Z
closed_at: 2026-02-12T09:56:03Z
---

# [x] Clean up cursor perf test files: consolidate, remove real-vault deps, fix console.log @km/tui #task #P2 @claude:e7ea0892

Consolidate the 4 cursor perf files into a coherent set:

**Current state (messy)**:
- cursor-profile.slow.test.ts — console.log profiling, needs /tmp/vt, fails in test:all
- cursor-perf.test.tsx — wall-clock timing, synthetic, has assertions
- cursor-perf.bench.ts — vitest bench, synthetic, getSibling + full pipeline  
- cursor-real-vault.bench.ts — vitest bench, needs /tmp/vt

**Plan**:
1. Merge per-phase pipeline breakdown (from cursor-profile) into cursor-perf.test.tsx using synthetic data
2. Delete cursor-profile.slow.test.ts (redundant with bench + now-enhanced test)
3. Also clean up architecture-bench.slow.spec.ts and production-entry.slow.spec.ts — they're real tests mislabeled as .slow.