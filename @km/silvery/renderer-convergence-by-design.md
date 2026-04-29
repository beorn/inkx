---
id: "@km/silvery/renderer-convergence-by-design"
aliases:
  - km-silvery.renderer-convergence-by-design
  - km-silvery-renderer-convergence-by-design
created_by: claude:cc081a9a
created_at: 2026-04-27T05:45:31Z
closed_at: 2026-04-27T08:56:16Z
close_reason: "C3b complete: MAX_SINGLE_PASS_ITERATIONS=15,
  MAX_LAYOUT_ITERATIONS=5, MAX_EFFECT_FLUSHES=5 (renderer.ts) + maxFlushes=5
  (create-app.tsx) all replaced. Two structurally distinct loops with explicit
  attributed bounds: MAX_CONVERGENCE_PASSES=2 (subscriber-feedback loops:
  singlePassLayout, effect-flush, production-flush; 1 initial + 1 settle, every
  per-cause bound is 0) and MAX_CLASSIC_LOOP_ITERATIONS=5 (classic interleaved
  runPipeline+flushSyncWork loop, virtualizer/scroll envelope). PassCause type
  audited 14→6 (9 categories with no production emit path removed).
  assertBoundedConvergence(passCount, loopName) throws under SILVERY_STRICT=2,
  warns under =1, no-op when unset. Tests: 13 unit (bounded-convergence.test.ts)
  + 4 sabotage (bounded-convergence-sabotage.test.tsx) — verifies math AND a
  real feedback edge actually fires the bound. Full vendor suite 11382/11383 +
  km-tui 2534/2534 (1 unrelated bearly LLM failure). Design doc:
  hub/silvery/design/convergence-bounds.md. Folded in:
  km-silvery.scrollto-single-pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.renderer-convergence-by-design
    depends_on_id: km-silvery.structural-hardening
    type: parent-child
    created_at: 2026-04-26T23:18:24Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Eliminate MAX_SINGLE_PASS_ITERATIONS — convergence by construction @km/silvery #feature #P2

blocks:: [[@km/silvery/structural-hardening]]

The renderer currently loops up to 15 iterations (bumped from 5) until layout stops changing. This is a retry-until-stable pattern — works in practice, but means the dependency graph between layout/render passes isn't structured to converge in one pass.

Plateau: a single-pass renderer where layout dependencies form a DAG (or at most one settling pass for known feedback edges like measure-then-place). The cap stops being a tunable because it's never reached.

Approach:
1. Map the actual dependency edges between layout/render/output phases
2. Identify which edges create true feedback (measurement-driven layout) vs false feedback (just bad ordering)
3. Either topologically order the false-feedback edges away, or model the true-feedback edges as a fixed two-pass measure-then-place

Files in scope:
- vendor/silvery/packages/ag-term/src/runtime/renderer.ts
- vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts

/complete:
- MAX_SINGLE_PASS_ITERATIONS removed from renderer.ts
- All existing renderer/layout tests pass without retry behavior
- A new test asserts renderer settles in a deterministic max-pass count (1 or 2, not 15)


## Quality rubric (hub/quality-rubric.md)
Current level: L0 — MAX_SINGLE_PASS_ITERATIONS=15 is a tunable retry knob; correctness depends on a magic constant rather than a model of why pass N happens.
Target level: L4 — explicit feedback-edge model with attributed bounds per edge class (text-measurement, viewport-dependent constraints, scrollTo settling). Either CONVERGENCE_THEOREM_QED N=2, or honest documentation that N>2 is fundamental and the constant is replaced by attributed bounds. Note: per plateau-90 R1, this bead is being recast into C3a (renderer-feedback-trace, P1) + C3b (bounded-convergence, P2); when those land, this bead should fold into them.
