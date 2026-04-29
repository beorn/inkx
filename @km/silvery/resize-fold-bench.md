---
id: "@km/silvery/resize-fold-bench"
aliases:
  - km-silvery.resize-fold-bench
  - km-silvery-resize-fold-bench
created_by: Bjørn Stabell
created_at: 2026-04-10T18:53:41Z
closed_at: 2026-04-10T19:00:08Z
close_reason: "Resize bench added (cad36ec0). PreparedText cache: 27-49% faster
  on resize, 18-47% on oscillation. Largest at 1000 items (49%)."
---

# [x] Resize/fold benchmark — prove PreparedText cache wins @km/silvery #task #P2

Add benchmarks that exercise resize and fold/unfold workloads where
PreparedText cache provides the most benefit.

## Why
Current benchmarks only test cursor move, where fast-path skip already
handles most nodes. PreparedText helps when nodes re-render with unchanged
text (resize: layout changed, text same; fold: children restructured).

## Proposed benchmarks
1. Resize 100→120 cols: all nodes re-render, collected text cached, format recomputed
2. Resize 1000→1200 cols: same at scale
3. Fold column (hide 50 items): children restructured, remaining items shift
4. Unfold column (show 50 items): new items enter, existing shift
5. Scroll 100 items in 20-row viewport: nodes enter/exit, cache hits on re-entry

## Expected results
- Resize: 20-30% faster (skip collectTextWithBg, only reformat at new width)
- Fold/unfold: 10-20% faster (cached text for shifted siblings)
- Scroll: 15-25% faster (cache hits on re-entering nodes)

## File
vendor/silvery/benchmarks/pipeline-only.bench.ts (add resize/fold sections)