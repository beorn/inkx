---
id: "@km/silvery/paint-clear-l5-bufferssink-retire"
aliases:
  - km-silvery.paint-clear-l5-bufferssink-retire
  - km-silvery-paint-clear-l5-bufferssink-retire
created_by: claude:cc081a9a
created_at: 2026-04-28T05:06:17Z
---

# [/] L5: retire BufferSink as authoritative; eliminate intra-frame buffer reads; delete clearExcessArea + drop hasPrevBuffer arg @km/silvery #task #P2 @claude:cc081a9a

blocks:: [[@km/silvery/structural-hardening]]

Promote `km-silvery.paint-clear-invariant` from L4 → L5 by retiring BufferSink
as the authoritative output path. With BufferSink gone, the `hasPrevBuffer`
runtime check inside `requireExcessClearGate` becomes unreachable from any
real frame and can be dropped — at which point `clearExcessArea` collapses
into a derived `clearRect` op in `cleanupOps` and the function disappears.

CONTEXT

L4 ships in silvery c7cf93904 (ExcessClearGate brand + requireExcessClearGate
factory). Wrong-order excess-clear from second-pass dispatch is unrepresentable
at the call-site level, but the runtime guard inside the factory is still
load-bearing. Empirical proof from the L4 session: dropping `&& hasPrevBuffer`
from the factory in isolation re-introduces both
`tests/features/absolute-shrink-bg-preserve.test.tsx` failures (BufferSink
walk-order mutation stomps fresh sibling paints).

The L5 win requires three sequential pieces of work, all flagged in the parent
bead's existing notes as multi-session:

STEP 5 — outline snapshots off the buffer
  - Sink does not yet have setOutlineSnapshots; outline cleanup currently
    relies on per-cell snapshots stored on the buffer.
  - Move outlineSnapshots to RenderPostState (or off the buffer entirely) so
    the decoration phase can run against the PlanSink-committed buffer.

STEP 6 — eliminate intra-frame buffer reads (the real Phase 2 blocker)
  - Audit every read of buffer state during the render walk:
    - getCellBg fallback in render-text.ts:589,593 — applyBgSegmentsToLine
      readCellInto for nested <Text bg> reading sibling-painted chars (Step 1d
      from earlier notes; requires BackedPlanSink with internal buffer or a
      fully-propagated inheritedBg path through bg-segment tracking)
    - dirty-row inspection in output-phase.ts
    - any other getCellBg / getCell reads
  - PlanSink has no backing buffer; renderers must derive these from node state.
  - Reference: render-plan.ts line 6 ("fresh prevBuffer clone. Phase 1 is
    opt-in via SILVERY_RENDER_PLAN…") and render-sink.ts:23 onward.

STEP 7 — wire SILVERY_RENDER_PLAN as production source-of-truth
  - Currently at vendor/silvery/packages/ag-term/src/ag.ts:447, the line
    `buffer = captured.result` keeps BufferSink's output as authoritative.
    `replay = prevBuffer.clone(); commitSectionedPlan(replay, captured.plan)`
    runs but is parity-only (`void replay`).
  - After Step 6 lands, switch authoritative output to `replay` (or merge
    BufferSink into PlanSink and emit a single buffer).
  - Delete the legacy BufferSink code path.

PHASE 3 — final cleanup (after Steps 5/6/7)
  - Delete `clearExcessArea` entirely; cleanupOps section of the
    SectionedRenderPlan absorbs the clearRect emissions.
  - Delete the `hasPrevBuffer` argument from `requireExcessClearGate` (the
    second-pass case is now structurally impossible because there is no
    walk-order stomp — `commitSectionedPlan` applies cleanup → paint, so
    paints always win).
  - Remove `SILVERY_RENDER_PLAN` env var.
  - Add per-frame fuzz property test verifying paint-clear ordering on
    real-world tree shapes (current fuzz only tests synthetic op streams).

PROTOTYPE / EXPLORATION

silvery branch `feat/paint-clear-l5-final` (commits b994e077, e8c7a2db) shows
prior exploration:
  - Step 1a: selectableMode threaded via NodeRenderState (decouples sink from
    intra-frame state).
  - Step 1b: eliminated getCellBg fallback in render-text.ts at three sites
    (renderGraphemes:1002,1046; renderAnsiTextLineReturn:1116). The remaining
    sites at render-text.ts:589,593 (applyBgSegmentsToLine) need the harder
    BackedPlanSink-with-internal-buffer treatment per the L4 session notes.

Use that branch as a starting prototype. Note: it predates L4, so it forks
from before the ExcessClearGate brand landed — rebase onto current main +
the L4 commit before continuing.

ACCEPTANCE

- `clearExcessArea` deleted from render-phase.ts.
- `requireExcessClearGate` either deleted (because the call site is gone) or
  retained as a type-only invariant check on a derived clearRect op shape.
- `tests/features/absolute-shrink-bg-preserve.test.tsx` passes without the
  hasPrevBuffer guard (proved by experiment).
- `tests/features/render-plan-fuzz.test.tsx` extended with a real-tree fuzz
  case (not just synthetic op streams).
- SILVERY_STRICT=2 vendor suite passes.
- 0 net new tsc errors.
- /pro review confirms the abstraction holds.

TRACKING

Parent: @km/silvery/structural-hardening
Predecessor: @km/silvery/paint-clear-invariant (L4, closed)
