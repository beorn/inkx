---
id: "@km/silvery/memo-pipeline-regression"
aliases:
  - km-silvery.memo-pipeline-regression
  - km-silvery-memo-pipeline-regression
created_by: Bjørn Stabell
created_at: 2026-04-09T15:54:22Z
closed_at: 2026-04-09T16:37:07Z
close_reason: "STRICT env check bug — isStrictOutput() treated '0' as truthy.
  Fix: envTruthy() helper. Real memo numbers: silvery 4.6-5.2x faster than Ink.
  Commit c8e382ee."
owner: bjorn@stabell.org
---

# [x] P0 BUG: memo'd trees 24-32x slower than Ink — pipeline walks entire tree @km/silvery #bug #P0

React.memo + dirty tracking expected to be silvery best case. Instead: Ink 24-32x faster. Memo'd kanban 92ms vs non-memo 1.03ms (90x slower WITH memo). Pipeline walks entire tree even when React skips memo'd components. commitUpdate/markDirty too aggressive + pipeline phases don't short-circuit clean subtrees. Bench: vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts useState section.