---
id: "@km/silvery/known-limits/hybrid-output"
aliases:
  - km-silvery.known-limits.hybrid-output
  - km-silvery-known-limits-hybrid-output
created_by: claude:cc081a9a
created_at: 2026-04-26T22:47:01Z
closed_at: 2026-04-26T22:57:40Z
close_reason: "Phase 2 complete. Implemented all 5 stub functions in
  vendor/silvery/packages/ag-term/src/pipeline/{output-density,output-modes}.ts:
  analyzeRowDensity, pickEmissionMode, emitWholeRow, emitRuns, emitScatter.
  Design doc recovered to hub/silvery/design/v05-layout/hybrid-output.md
  (silvery-internal was absorbed 2026-04-17 but this doc didn't migrate). 17
  unit tests in vendor/silvery/tests/output-hybrid.test.ts pass under
  SILVERY_STRICT=2. Commits: silvery 626ac0e1 + km 8ce33dd0a. Phase 3 (wire
  SILVERY_HYBRID_OUTPUT=1 into output-phase.ts) tracked separately if needed."
started_at: 2026-04-26T22:47:51Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.known-limits.hybrid-output
    depends_on_id: km-silvery.known-limits
    type: parent-child
    created_at: 2026-04-26T15:47:00Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Output hybrid pipeline phase 2 — design doc recovery + implementation @km/silvery #task #P2 @claude:cc081a9a

blocks:: [[@km/silvery/known-limits]]

Multiple TODO(hybrid-output phase 2) markers in vendor/silvery/packages/ag-term/src/pipeline/{output-density,output-modes}.ts.

The design doc is referenced as 'https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md' but silvery-internal was absorbed into hub/silvery on 2026-04-17 and only pretext-integration.md migrated. The hybrid-output design doc was lost.

## Stub functions (5 throws, all 'not implemented')
- analyzeRowDensity (output-density.ts:89) — analyzes per-row dirty cells, runs, summaries
- pickEmissionMode (output-density.ts:122) — picks scatter / run-length / whole-row mode based on cost estimator
- emitScatter (output-modes.ts:76) — emits scatter mode (individual cells)
- emitRunLength (output-modes.ts:116) — emits run-length mode (contiguous runs)
- emitWholeRow (output-modes.ts:157) — emits whole-row mode (entire row replacement)

The Phase 1 implementation calls these from output-phase.ts. Currently it must use a fallback path since these throw — verify which.

## Approach
Phase A — design recovery (1-2h):
- Read all 5 stubs in full context (their JSDoc comments are quite detailed already!)
- Read the call site that uses them
- Read benchmarks/silvery-vs-ink.bench.ts (referenced by JSDoc)
- Reconstruct hub/silvery/design/v05-layout/hybrid-output.md from code intent

Phase B — implementation (1-3h):
- Implement analyzeRowDensity (pure function over CellChange[])
- Implement pickEmissionMode (cost estimator)
- Implement the 3 emit modes
- Wire benchmark to verify cost estimator is calibrated

Acceptance:
- All 5 stubs no longer throw
- Bench scenarios (Dense row, Contiguous run, Scatter) — silvery within 10% of best mode
- All vendor/silvery tests pass under SILVERY_STRICT