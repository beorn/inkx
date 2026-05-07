---
mentions:
  - km
id: "@km/silvery/paint-clear-l5-final"
aliases:
  - km-silvery.paint-clear-l5-final
  - km-silvery-paint-clear-l5-final
created_by: claude:cc081a9a
created_at: 2026-04-27T14:51:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.paint-clear-l5-final
    depends_on_id: km-all.plateau-90
    type: parent-child
    created_at: 2026-04-27T11:00:55Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.plateau-90
---

# [ ] C2 Phase 3 final: full Step 6 + delete clearExcessArea/hasPrevBuffer/env flag (L4→L5) @km/silvery #task #P2

blocks:: [[@km/all/plateau-90]]

After plateau-90 Phase 1+2+3-default-flip ship, C2 (render-plan-commit) is at L4 — sectioned RenderPlan structurally proven via fuzz (1400 scenes, 0 violations) and active in production (default-ON via opt-out env var). Phase 3 final cleanup is gated on full Step 6 read-after-write elimination — multi-session work.

Why this is filed separately:

- L4: ClearOp can't land in paintOps (disjoint types in sectioned commit). The bug class is structurally unrepresentable in the captured plan.
- L5 requires deletion of the workaround code that was load-bearing on the direct-mutation path AND fuzz coverage proving the guard is unreachable.

Sequence (must be in this order):

1. Eliminate read-after-write reads in render-text:
- getCellBg, readCellInto, getCell, getSelectableMode, outlineSnapshots reads
- Two paths: (a) thread inheritedBg more aggressively through render-text (cleaner), or (b) backed-PlanSink with internal TerminalBuffer (faster ship). Decision before starting.
5. Make PlanSink authoritative — drop BufferSink primary fallback. TeeSink degenerates to PlanSink-only.
6. Delete clearExcessArea — folds into sectioned commit's cleanupOps. The renderer becomes a sink-emit-only for shrinking-node clear ops.
7. Delete hasPrevBuffer guard at silvery 168b4989 — load-bearing only on direct-mutation path; structurally redundant under sectioned commit.
8. Remove SILVERY_RENDER_PLAN env var — cosmetic last step once BufferSink primary is gone.

Acceptance:

- grep -rn 'clearExcessArea\|hasPrevBuffer\|SILVERY_RENDER_PLAN' vendor/silvery/src/ → 0 hits
- All STRICT tests pass with sectioned commit as the only path
- Phase 3 fuzz test (silvery 014cf395) continues to pass
- L5 reached: workaround deleted AND fuzz proves the guard is unreachable.

Reach: multi-session (Step 6 read elimination is the bulk of the work). Filed as P2.

