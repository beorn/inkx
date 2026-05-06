---
aliases:
  - km-silvery.single-render-walk
  - km-silvery-single-render-walk
created_at: 2026-05-06T06:07:03.577Z
---

# Fold renderGraphemes + applyBgSegmentsToLine into one pass #P3

Architectural cleanup: the cyan-strip bug existed because two parallel walkers (renderGraphemes for chars, applyBgSegmentsToLine for bg) had independent clip math that drifted. The Round 12 fix adds clip params to applyBgSegmentsToLine, restoring parity. A deeper fix folds both into a single cell-by-cell emitter that writes char + bg + attrs together, eliminating the bug class by construction. ~1 day refactor.
