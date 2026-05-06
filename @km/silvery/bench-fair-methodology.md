---
mentions:
  - km
  - Bjørn
id: "@km/silvery/bench-fair-methodology"
aliases:
  - km-silvery.bench-fair-methodology
  - km-silvery-bench-fair-methodology
created_by: Bjørn Stabell
created_at: 2026-04-10T07:18:59Z
closed_at: 2026-04-10T08:11:06Z
close_reason: "All Pro review fixes implemented: renamed bench labels
  (incremental -> synchronous rerender), fixed kanban label (single text change
  -> move editing marker, 2 cards change), added all-visible 20-item bench
  (2.7x), expanded methodology (clarified @silvery/test is production core,
  mocked stdout, Node.js pending), updated all public docs with qualified 3-6x
  claims. Fresh numbers: 2.7-6.1x range. Commits: 5fdb3d01, 5e01bd38 in
  silvery."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Fair benchmark methodology + fix loggily span overhead + re-validate claims @km/silvery #task #P1 @Bjørn Stabell

Pipeline profiling: 63% of Silvery per-frame time is loggily span overhead (0.7ms/frame). debug:false bench was invalid (Ink drops frames). Revert to debug:true, fix span overhead (zero-cost when disabled), reuse createAg, re-run, update docs, Pro review.

