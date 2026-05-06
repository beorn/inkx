---
mentions:
  - km
  - claude
id: "@km/silvery/hybrid-output-phase3"
aliases:
  - km-silvery.hybrid-output-phase3
  - km-silvery-hybrid-output-phase3
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:45Z
closed_at: 2026-04-27T00:06:57Z
close_reason: >-
  Phase 3 wired and tested.


  Silvery commits (branch feat/hybrid-output-phase3):

  - ed0f231d: fix(pipeline): reconcile hybrid-output cost constants with design
  doc

  - cdfefc75: feat(pipeline): wire hybrid output dispatch behind
  SILVERY_HYBRID_OUTPUT=1


  km commits (branch feat/hybrid-output-phase3):

  - 63b84c4b5: feat(silvery): bump for hybrid-output phase 3 wiring


  Constants reconciled with design doc §4
  (hub/silvery/design/v05-layout/hybrid-output.md):
    PER_CELL_SCATTER  8 → 12
    RUN_PREAMBLE      6 → 10
    ROW_PREAMBLE      6 → 8
    (PER_CELL_IN_RUN, PER_CELL_IN_ROW unchanged at 2)

  Wiring: SILVERY_HYBRID_OUTPUT=1 dispatches per-row through analyzeRowDensity

  + pickEmissionMode + emit{WholeRow,Runs,Scatter} from output-modes.ts.

  Falls back to the legacy in-line emitter when:
    - flag is off (default)
    - mode is inline (design doc R4 — phase 2 follow-up)
    - no buffer is supplied (defensive)

  Tests added (vendor/silvery/tests/output-hybrid-integration.test.ts):
    1. mixed-density frame (scatter + run + dense in one diff)
    2. wide-character glyph in a run-length row
    3. single-cell scatter dispatch is exclusive
    4. fully-dense whole-row dispatch is exclusive
    5. flag-off path leaves no hybrid telemetry

  Verification:
    - 22 hybrid + integration tests pass under SILVERY_STRICT=2
    - 75 broader output tests (dimension change, wide-char matrix, xterm
      replay, cross-backend) pass with the flag both on and off

  Telemetry hooks fire on __silvery_bench_output_detail.modeCounts so

  estimator constants can be tuned from real workloads (design doc §11

  open question 5).


  Note: imports use relative paths to the silvery source tree because the

  host monorepo's @silvery/ symlink may resolve to a sibling silvery

  checkout (the parent km worktree) that does not yet contain this

  commit's wiring during dual-worktree development. Once the parent km

  is rebased onto feat/hybrid-output-phase3, the standard @silvery/

  imports resolve correctly through the symlink chain.
started_at: 2026-04-26T23:25:17Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.hybrid-output-phase3
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:37Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-vendor-fuzz
---

# [x] [task] Hybrid-output Phase 3: wire SILVERY_HYBRID_OUTPUT=1 + reconcile constants @km/silvery #task #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

Wire the dormant analyzer/estimator into output-phase.ts behind SILVERY_HYBRID_OUTPUT=1 flag. Reconcile cost-estimator constants — recovered original spec (hub/silvery/design/v05-layout/hybrid-output.md): 12/10/2/8/2. Implemented (output-density.ts/output-modes.ts): 8/6/2/6/2. /complete: grep 'SILVERY_HYBRID_OUTPUT' vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts → ≥1 hit; constants in output-modes.ts match design doc §4.

