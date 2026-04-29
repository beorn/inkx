---
id: "@km/silvery/strict-layout-overflow"
aliases:
  - km-silvery.strict-layout-overflow
  - km-silvery-strict-layout-overflow
created_by: Bjørn Stabell
created_at: 2026-04-12T07:31:02Z
closed_at: 2026-04-12T08:19:42Z
close_reason: Implemented strictLayoutOverflowCheck() in layout-phase.ts. Walks
  tree after layout+correction, checks child.boxRect.width <= parent inner
  width. Skips overflow:scroll/hidden and position:absolute. STRICT=1 warns,
  STRICT=2 throws. Wired into ag.ts after fitContentCorrectionPass. 3207 vendor
  tests pass at STRICT=1, 509 at STRICT=2 — zero false positives. Committed as
  0b060360.
---

# [x] SILVERY_STRICT layout overflow invariant — no child wider than parent @km/silvery #feature #P1

blocks:: [[@km/silvery/layout-quality-plateau]], [[@km/silvery/test-runtime-parity]]

Add a layout-level property invariant to SILVERY_STRICT mode: after every layout pass, walk the tree and verify no child's boxRect.width exceeds its parent's inner content width (unless overflow:visible is set on the parent).

This catches the entire class of fit-content/snug-content bugs — any measure-phase or correction-pass error that produces an overflowing child would fire immediately on every test run with STRICT=1.

Analogous to the existing STRICT buffer-level verification (incremental vs fresh render). This adds layout-level verification.

~50 lines. File: vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts or a new layout-invariants.ts.

Prior art: the 7 regressions in 14 days from rendering-diagnostics-review.md were all caught by STRICT buffer verification. This extends the same approach to layout.