---
id: "@km/silvery/virtualizer-from-layout"
aliases:
  - km-silvery.virtualizer-from-layout
  - km-silvery-virtualizer-from-layout
created_by: claude:8b5b9e1c
created_at: 2026-04-20T22:09:46Z
closed_at: 2026-04-21T02:27:01Z
close_reason: >-
  Activated on 2026-04-21 via read-don't-walk approach. The previous walk-based
  steady-state attempt (669e9f19) hit a feedback loop: each new measurement
  shifted avgMeasured, shifting findViewportTopItem's conclusion, shifting the
  window, triggering re-measurement. 5-iteration layout-loop exhausted on
  tall-outlier cases.


  Read-don't-walk severs the loop by topology: useVirtualizer's steady-state now
  reads scrollState.firstVisibleChild / lastVisibleChild DIRECTLY (child
  indices, not pixel positions), maps through prevWindowRef to virtual-item
  indices, and picks the next window as [firstVI - overscan, lastVI + 1 +
  overscan). avgMeasured is used only for placeholder heights (sumHeights), not
  window bounds — measurement arrivals can't feed back into visibility
  decisions.


  Commits (vendor/silvery):

  - 80d8bcdb refactor(ag-react): useVirtualizer reads firstVisibleChild from
  layout-signals

  - 6d74de86 feat(ag-react): ListView wires containerNode to useVirtualizer

  - ddb2551b test(silvery): enable property invariant 5 (virtualizer↔scroll
  agreement)


  km root:

  - c9a89e1db docs(silvery-knowledge): virtualizer-from-layout activated via
  read-don't-walk

  - 85d92fc4c chore(silvery): bump — virtualizer-from-layout activated


  Additional pieces that made activation stable:

  1. Callback-form useScrollState (not reactive). Scroll-phase offset can
  oscillate for oversized scrollTo targets — reactive would force re-render on
  every oscillation, exhausting the layout-loop budget. Callback form only bumps
  scrollStateVersion when firstVC/lastVC map to items OUTSIDE the current window
  (offset-only oscillations are absorbed).

  2. Cursor-anchor expansion in steady-state: when scrollTo moves cursor outside
  current window, pull anchor to include cursor (handles G-jump, PgDn-to-end).

  3. Oversized-target bypass in ListView: when measuredHeight(target) >
  viewportHeight, pass explicit scrollOffset=sumHeights(0, cursor)-1 instead of
  scrollTo (sidesteps pre-existing layout-phase oscillation for oversized
  targets; keeps cursor pinned at top — expected UX).


  Verification (all at SILVERY_STRICT=2):

  - 14/14 listview-variable-heights (including test 5 "cursor ON tall outlier" —
  the canonical activation blocker from the previous attempt)

  - 3/3 listview-scroll-contract (seeded regressions)

  - 13/13 listview-navigation (G/Home/PgDn edge cases)

  - 4/4 listview-overflow-fits

  - 27/27 apps/km-tui/tests/scroll-and-cursor.test.tsx

  - 2/2 apps/km-tui/tests/column-top-disappears-realvault.slow.test.tsx

  - INV-5 enabled in fuzz helpers: rendered items form contiguous range
  (tautology by construction under read-don't-walk, but guards future
  regressions that reintroduce divergence)


  TypeScript: 0 errors in useVirtualizer.ts / ListView.tsx /
  listview-scroll-helpers.tsx.


  Remaining pre-existing fuzz failures (not caused by this bead, not in scope):

  - Fuzz seed -1071789314 case 152: oversized last item extending past viewport
  triggers phantom ▼1. Scroll-phase's isPhantomReserveCut guard doesn't cover
  "last child bottom > rawViewportBottom". Guarded by INV-2b for bead
  km-silvery.virtualized-overflow-indicator-counts.
---

# [x] Virtualizer reads visible range from layout-phase via alien-signals (single source of truth) @km/silvery #feature #P2 @claude:8b5b9e1c

blocks:: [[@km/silvery]]

ARCHITECTURAL REFRAME for the column-top-disappears bug class.

# Problem

Today, two systems independently compute 'what's visible' in a scroll container:
- React: useVirtualizer (packages/ag-react/src/hooks/useVirtualizer.ts) computes start/end indices from estimatedVisibleCount + scrollOffset + measuredHeights. Uses count-based + pixel-based math mixed.
- ag-term: layout-phase scroll container (packages/ag-term/src/pipeline/layout-phase.ts:561 calculateScrollState) computes firstVisibleChild/lastVisibleChild from actual measured pixel positions after Yoga layout.

When their answers diverge — common with variable-height items (vault @next column with ~80-row outlier card) — leadingHeight ≠ scrollOffset, producing visible blank gaps at top OR bottom of viewport. This bug class has reopened 4× this session with 5+ commits each fixing a sub-variant: scroll-snap, indicator-overlap, forward-walk count-based, backward-walk count-based, tall-outlier interaction.

Each 'fix' makes the two systems agree under one more condition. The next variant always exists because they're computing the same thing twice.

# Reframe

Make scroll-phase the single source of truth. Virtualizer subscribes to its output via alien-signals (the primitive silvery already uses for useBoxRect / useScreenRect).

## Implementation pattern

1. layout-phase already produces node.scrollState = { offset, firstVisibleChild, lastVisibleChild, hiddenAbove, hiddenBelow, contentHeight, viewportHeight }
2. Add ScrollStateSignals to layout-signals.ts (peer of RectSignals): per-node signals for firstVisibleChild, lastVisibleChild, scrollOffset, hidden counts. Sync via syncRectSignals after each layout pass.
3. New hook useScrollState(node?: AgNode) → returns reactive { startIdx, endIdx, scrollOffset, hiddenAbove, hiddenBelow }. Re-renders only when those values change.
4. useVirtualizer becomes a thin consumer:
   - Bootstrap (no measurements yet): use estimateHeight to pick a small initial window
   - Steady state: read useScrollState, render items [firstVisibleChild - overscan, lastVisibleChild + overscan]
   - leadingHeight / trailingHeight derived from sumHeights using scroll-phase's index boundaries — guaranteed to match scrollOffset by construction (since scroll-phase computed them from the same heights)

This eliminates divergence by topology: there's only one place that decides visibility (scroll-phase). Virtualizer is a one-frame-lagging consumer, like CSS contain:strict on the web.

# What this fixes beyond column-top-disappears

- All future virtualizer/scroll-phase divergence bugs
- Indicator counts become trivially correct (visible == rendered count)
- Synthetic tests start matching real-vault behavior (no separate virt logic)
- Tests can assert 'every card is mounted' — much easier than 'the right window is mounted'
- Removes the count-vs-pixel confusion in useVirtualizer entirely

# What this does NOT fix

- First-render bootstrap still uses estimates (unavoidable — no measurements yet)
- Layout still has to compute scrollState every frame (unchanged cost)
- Doesn't reduce React tree size — virtualizer still mounts/unmounts items

# Why NOT alien-projections / alien-trees

- alien-projections solves 'list of N items → derived per-item value with stable cache.' Wrong shape — we need a range query, not per-item memoization.
- alien-trees solves 'tree aggregates (any-descendant-has-X, inherit-from-ancestor in O(1)).' Wrong shape — items are flat.
- The right primitive is plain alien-signals, which silvery already uses.

# Effort

Medium. Estimated 2-3 days:
- 1 day: add ScrollStateSignals + syncScrollStateSignals in layout-signals.ts
- 1 day: rewrite useVirtualizer to consume useScrollState
- 0.5 day: migration — verify all existing virtualizer callers still work
- 0.5 day: STRICT tests + real-vault verification

# Sequence

1. SHORT-TERM (this session): height-aware backward walk fix landing now (Fix 2 in flight) + auto-disable virtualization for lists < 200 items + runtime invariant in scroll-phase. These ship first; bug stops affecting users.
2. MEDIUM-TERM (this bead): the architectural reframe. Lets virtualization be re-enabled safely for large lists.

# Related

- @km/silvery/implicit-invariants-audit — same root cause class (no SoT for cross-layer state). The runtime invariants from that audit will live on the same scrollState signals this bead introduces.
- @km/tui/column-top-disappears — the bug that surfaced this.