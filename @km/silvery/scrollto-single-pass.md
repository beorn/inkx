---
id: "@km/silvery/scrollto-single-pass"
aliases:
  - km-silvery.scrollto-single-pass
  - km-silvery-scrollto-single-pass
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:03Z
closed_at: 2026-04-27T08:55:40Z
close_reason: Folded into C3b bounded-convergence
  (km-silvery.renderer-convergence-by-design). The scrollto-settle PassCause is
  an attributed feedback edge with a documented per-cause bound of 0 extra
  passes (canonical settle pass absorbs it). The same-intent guard prev=scrollTo
  + targetCompletelyOffscreen one-shot recovery is the structural one-shot
  invariant — it can't re-fire on the same input. See
  hub/silvery/design/convergence-bounds.md (Per-cause bound proofs §
  scrollto-settle). The recovery loop is now part of the documented bound model
  rather than ad-hoc symptom suppression.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scrollto-single-pass
    depends_on_id: km-silvery.structural-hardening
    type: parent-child
    created_at: 2026-04-26T23:18:25Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Deterministic single-pass scrollTo — drop same-intent recovery loop @km/silvery #bug #P3

blocks:: [[@km/silvery/structural-hardening]]

silvery f7adc32b added a same-intent recovery loop in layout-phase.ts:670-697 because scrollTo can land on a target that doesn't intersect viewport after resize. Recovery loops fix the symptom; plateau is a scrollTo that can't fail to intersect viewport on first pass.

Files in scope:
- vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts:670-697
- vendor/silvery/tests for scrollTo

/complete:
- Recovery loop block at layout-phase.ts:670-697 removed
- The listview-resize regression test from @km/silvery/listview-resize-scroll-target still passes
- A new test exercises post-resize scrollTo and confirms target intersects viewport on first compute


## Quality rubric (hub/quality-rubric.md)
Current level: L0 — same-intent recovery loop at layout-phase.ts:670-697 is symptom suppression (re-run scrollTo until it works); silvery f7adc32b added it precisely because first-pass scrollTo could land on a non-intersecting target after resize.
Target level: L4 — folded into bounded-convergence (C3b): post-resize geometry is one of the documented feedback edges with an attributed bound. The recovery loop is deleted because the wrong-order layout sequence can no longer happen.
