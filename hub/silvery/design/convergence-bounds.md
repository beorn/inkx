# Convergence Bounds (C3b)

## Theorem

The renderer's convergence loops in `vendor/silvery/packages/ag-term/src/renderer.ts`
and `runtime/create-app.tsx` terminate within an attributed bound that is a
function of the **edge inventory**, not a retry constant. Specifically:

- **Subscriber-feedback loops** (singlePassLayout, effect-flush, production-flush)
  terminate in **at most 2 passes** (1 initial + 1 settle) given the
  per-`PassCause` bounds in `pass-cause.ts:PASS_CAUSE_BOUNDS`.
- **The classic loop** (legacy multi-pass with interleaved
  runPipeline + flushSyncWork) terminates in **at most 5 iterations**, the
  empirical envelope for virtualizer + scroll stabilisation on
  heterogeneous lists.

The historical magic constants
(`MAX_SINGLE_PASS_ITERATIONS = 15`, `MAX_LAYOUT_ITERATIONS = 5`,
`MAX_EFFECT_FLUSHES = 5`, `maxFlushes = 5`) are removed. Each loop is now
named, documented, and asserted under SILVERY_STRICT.

## Empirical baseline

The C3a v3 corpus (105 termless app teardowns, 11 538 pass-cause records,
across the silvery + km-tui test suites) confirmed:

| Pass index | Commits                     |
| ---------: | --------------------------: |
| 0          | 80 (11 silvery + 69 km-tui) |
| 1+         | 0                           |

No test reached pass 1+. Dominant edge: layout-invalidate (84-98%) via
`scrollRect`, `screenRect`, `boxRect` rect-signal changes in
`notifyLayoutSubscribers` → `syncRectSignals`, gated to subscriber-observed
nodes (nodes with `getLayoutSignals(node)` allocated). Secondary edges:
viewport-resize (depth-0 root trigger), scrollto-settle (1-2%).

## PassCause taxonomy (post-audit)

The C3a v2 enum scaffolded **14 PassCause categories** after a dual-pro
review (GPT-5.4 Pro + Kimi K2.6, 2026-04-26). C3b's audit confirmed
**6 have a real production emit path** in the silvery pipeline; the
remaining 9 are removed. Keeping un-emitted enum members bloats the
discriminated union and signals "we expect to emit this" when no path will.

### Kept (6)

| Category             | Producer                                                                                               | Bound          |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| layout-invalidate    | pipeline/layout-phase.ts:notifyLayoutSubscribers (boxRect / scrollRect / screenRect, subscriber-gated) | 0 extra passes |
| intrinsic-shrinkwrap | pipeline/measure-phase.ts:measurePhase (snug-content width / fit-content height across passes)         | 0 extra passes |
| scrollto-settle      | pipeline/layout-phase.ts:calculateScrollState (scrollTo:newIntent / scrollTo:recovery)                 | 0 extra passes |
| sticky-resettle      | pipeline/layout-phase.ts (stickyChildren array changed)                                                | 0 extra passes |
| viewport-resize      | runtime/renderer.ts (terminal dim change)                                                              | 0 extra passes |
| unknown              | 3 exhaustion synthesis sites in renderer.ts + create-app.tsx                                           | 0 extra passes |

Every kept category has a per-cause bound of **0 extra passes** because the
canonical settle pass (the +1 in `MAX_CONVERGENCE_PASSES = 1 + 1 + sum`)
absorbs all of them. The bound is shared across causes, not per-category
budget.

### Removed (9, with rationale)

| Category                  | Reason for removal                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| wrap-reflow               | Subsumed by intrinsic-shrinkwrap. Silvery wraps inside computeSnugContentWidth (binary search) — there's no separate wrap producer. |
| font-metrics-changed      | Terminals have fixed cell width, no font fallback path. Theme density is a one-shot setState, not a within-frame loop.              |
| decoration-remap          | useDecorations subscribers fire as layout-invalidate (rect signal change). No separate decoration-loop producer.                    |
| focus-scroll-into-view    | Programmatic scroll already fires scrollto-settle. The focus manager calls into the scroll pipeline, not as a distinct edge.        |
| async-image-size          | Silvery's Kitty graphics protocol sets dims at register time, not lazy. No async image-resolution path.                             |
| theme-metric-changed      | Theme tokens propagate via React setState, not within-frame mutation. The re-render is a normal React commit, not a feedback loop.  |
| resize-resettle           | Subsumed: rect changes after resize fire as layout-invalidate against the new dims. The "follow-on" was a duplicate category.       |
| viewport-dependent        | Legacy bucket replaced by viewport-resize (more precise) + layout-invalidate (the actual feedback edge).                            |
| text-measurement-feedback | Legacy bucket replaced by intrinsic-shrinkwrap (the only measure-phase producer).                                                   |

## Per-cause bound proofs

Each bound is a structural invariant of the producer, not a histogram
observation. The argument for each:

### `layout-invalidate`: 0 extra passes

**Claim**: when a subscriber re-renders in response to a rect-signal change,
the new layout produces the SAME rects, so the next `notifyLayoutSubscribers`
reports no change.

**Proof sketch**: `boxRect` / `scrollRect` / `screenRect` are pure functions
of the layout tree (positions + dimensions from Flexily). Given the same
tree, layout is deterministic. The subscriber's commit may add/modify React
state used in next-frame's render, but it cannot change the layout's input
to itself within the same frame — that would require the React state to
feed back into the layout tree (a different feedback edge with its own
PassCause).

**Where this can break**: a useBoxRect subscriber that modifies tree
structure based on the rect (e.g. "if width<X, render fewer items"). That's
a virtualizer pattern, captured separately as the classic-loop bound.

### `intrinsic-shrinkwrap`: 0 extra passes

**Claim**: measurement is content-deterministic — same tree → same
shrunkWidth / fitContentHeight on every pass.

**Proof**: `computeSnugContentWidth` is a pure function of (text content,
border, padding, available width). All inputs come from the React tree
(content) or the parent's resolved layout (constraints). Once the tree
is stable, repeated measurement yields the same result.

**Where this can break**: content changes mid-frame via a setState in a
useLayoutEffect that reads measure output. That's a React-state feedback
edge, not measurement feedback — it would attribute as `layout-invalidate`
or surface as `unknown`.

### `scrollto-settle`: 0 extra passes

**Claim**: the `prevScrollTo === scrollTo` guard prevents the same intent
from re-firing within a frame. The `targetCompletelyOffscreen` recovery
edge is a one-shot ("I scrolled past the target during this frame's
layout").

**Proof**: `calculateScrollState` writes `prevScrollTo = scrollTo` after
applying the offset. The next call sees them equal and skips. Recovery
fires only when scroll-target was offscreen at start; once it's onscreen,
it's onscreen.

### `sticky-resettle`: 0 extra passes

**Claim**: `stickyChildren` is recomputed deterministically from layout
positions; once layout is stable, sticky offsets are stable.

**Proof**: sticky offset = clamp(natural top, scroll offset,
viewport bottom - sticky height). All inputs stabilise within one layout
pass.

### `viewport-resize`: 0 extra passes

**Claim**: terminal dim change is a depth-0 root trigger, not a feedback
edge. Once the new dims are observed, no further resize fires.

**Proof**: the dim change comes from outside the pipeline (terminal
SIGWINCH or test driver `resizeFn`). It's recorded for histogram
attribution but doesn't seed feedback within a frame — the resize itself
is not loop-recursive.

### `unknown`: 0 extra passes

**Claim**: any non-zero unknown count is a regression to surface, not
budget to consume.

**Reason**: unknown fires when a pass commits React work but no specific
PassCause was attributed during the pass. Either:

1. A new feedback edge needs a PassCause category, OR
2. A pure-React feedback loop slipped past the pipeline's instrumentation.

Both warrant investigation, not silent budget. The bound is 0 to make this
visible.

## Loop-shape bounds

Two structurally different convergence loops in the renderer:

### Subscriber-feedback loops: MAX_CONVERGENCE_PASSES = 2

Loops where pipeline output and React effects flush in **separate phases**:

- `singlePassLayout` (renderer.ts) — one runPipeline + a separate
  effect-flush loop afterwards.
- `effect-flush` (renderer.ts, called after singlePassLayout) — drains
  React passive effects.
- `production-flush` (create-app.tsx, processEventBatch flush) — same
  shape as effect-flush in production.

Bound: 1 initial pass + 1 settle pass = 2. The settle pass drains
subscriber commits from the pipeline; per-cause bounds are all 0.

### Classic loop: MAX_CLASSIC_LOOP_ITERATIONS = 5

The legacy `MAX_LAYOUT_ITERATIONS = 5` loop in renderer.ts that
**interleaves** `runPipeline + flushSyncWork` in each iteration. This
absorbs subscriber feedback AND layout-vs-React stabilisation in one
drain.

Why the wider bound: virtualizer + scroll convergence on heterogeneous
lists genuinely needs 3-4 iterations. Iteration N runs layout, finds the
visible window, mounts items via React; iteration N+1 measures the new
items and re-runs layout with their actual heights; iteration N+2 may
recompute the window if the new heights pushed the cursor item
out-of-frame. Empirically this completes in ≤ 4 iterations across the
test corpus, so the historical 5 was empirically tight. We keep it as
`MAX_CLASSIC_LOOP_ITERATIONS = 5`, an explicit documented constant.

The classic loop's higher bound is intentional and split from
MAX_CONVERGENCE_PASSES so the subscriber-feedback bound stays honest.

## Assertion behaviour (`assertBoundedConvergence`)

Called at the tail of each convergence loop with `(passCount, loopName)`.
Behaviour:

- `SILVERY_STRICT=2`: throws when `passCount` exceeds the loop's bound,
  with a per-PassCause breakdown so a regression names the offending edge.
- `SILVERY_STRICT=1`: emits a stderr warning with the same breakdown.
- `SILVERY_STRICT` unset: no-op. The loop bound itself caps iteration
  count (production safety net).

The assertion is the regression surface: a future pipeline change that
breaks one of the per-cause invariants (e.g. a new feedback edge that
doesn't fit the existing categories) will exhaust the loop and fail
loudly with attribution, rather than silently consuming a 15-pass safety
margin.

## Testing

`vendor/silvery/tests/pipeline/bounded-convergence.test.ts` contains 13
unit tests covering:

- PASS_CAUSE_BOUNDS table totality and audit completeness (6 categories).
- MAX_CONVERGENCE_PASSES = 2 (subscriber-feedback bound).
- MAX_CLASSIC_LOOP_ITERATIONS = 5 (legacy classic-loop bound).
- The bound is dramatically tighter than the prior 15.
- Each cross-pass cause has a 0-extra-passes bound.
- `assertBoundedConvergence` does NOT throw at the bound (boundary inclusive).
- `assertBoundedConvergence` throws when over-budget, naming the loop.
- Classic loop has a wider bound than single-pass.
- STRICT-unset is a no-op for any pass-count.

The full vendor + km-tui suites pass with the new bounds (11 378 / 11 379
silvery records — 1 unrelated bearly LLM test fails on model name drift —
and 2 534 / 2 534 km-tui).

## References

- C3a baseline: `hub/silvery/design/pass-cause-histogram.md` (191 824
  records, pre-loggily, pre-audit).
- C3a v3 confirmation: feedback-trace's km-tui termless snapshot (105
  teardowns / 11 538 records, post-loggily, post-audit).
- Pre-bounded code: `MAX_SINGLE_PASS_ITERATIONS = 15` in
  `vendor/silvery/packages/ag-term/src/renderer.ts:587` (removed in C3b).
- Bound model: `vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts`
  (`PASS_CAUSE_BOUNDS`, `MAX_CONVERGENCE_PASSES`, `MAX_CLASSIC_LOOP_ITERATIONS`,
  `assertBoundedConvergence`).

## Tracking

- `km-silvery.renderer-convergence-by-design` (C3b, this work) — closes.
- `km-silvery.scrollto-single-pass` — folds in: scrollto-settle is bounded
  by the structural one-shot guard, no extra passes.
- `km-silvery.renderer-feedback-trace` (C3a, prerequisite) — already shipped.
- `km-silvery.structural-hardening` (parent epic).

