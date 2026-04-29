---
id: "@km/silvery/box-scroll-stable-on-height-change"
aliases:
  - km-silvery.box-scroll-stable-on-height-change
  - km-silvery-box-scroll-stable-on-height-change
created_by: claude:c56dc5d6
created_at: 2026-04-24T01:56:32Z
closed_at: 2026-04-24T02:27:45Z
close_reason: silvery 671a06b0 + km 1d3a51266 — memoize prevScrollTo in
  calculateScrollState; ensure-visible fires only on scrollTo change or mount.
  Zero consumer changes. Regression tests at both layers verify viewport stays
  anchored when visible items grow. 45+6+5+52 tests pass; tsc unchanged at
  baseline.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.box-scroll-stable-on-height-change
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T18:56:45Z
    created_by: claude:c56dc5d6
    metadata: "{}"
---

# [x] Box overflow="scroll" shifts viewport when visible item grows @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Repro: click a collapsible row in ListView to expand it. Expected: rows above the clicked row stay pinned to their screen positions; rows below get pushed down as the clicked row grows. Actual: the whole viewport shifts — the clicked row moves on screen.

Root cause: the Box with overflow="scroll" applies ensure-visible logic on every render. When a visible child grows (e.g. user expanded it), the Box re-anchors so the child stays fully in view — but this moves the viewport top, pushing content above the click point out of view.

Two places this ran:
1. useVirtualizer's edge-based scroll (FIXED in 50d13d41: scrollToChanged guard skips re-anchor on height-change renders).
2. Box's own scrollTo prop processing (STILL BROKEN): ListView passes boxScrollTo=scrollToIndex on every render when cursor is in the visible slice. The Box re-applies its own ensure-visible on every such render.

Attempted fix (reverted): memoize boxScrollTo to pass scrollToIndex only on cursor-change renders. Broke 3 ListView tests because createRenderer's synchronous first-render path needs unconditional scrollTo on mount.

Better fix directions:
- Move the guard into Box's overflow="scroll" internals (compare prev/current scrollTo, skip re-anchor if unchanged AND target is still visible).
- OR pass a 'scrollIntent' prop distinct from 'scrollTarget' — intent fires ensure-visible once, target is a passive anchor.
- OR expose a 'keepTargetStable' Box prop that suppresses ensure-visible on content height changes.

Acceptance:
- Click-to-expand a row in @km/logview: rows above stay at same on-screen Y; clicked row's top edge doesn't move; rows below get pushed down naturally.
- All existing ListView tests still pass (especially 'cursor item is always visible' suite).
- 'Programmatic cursor move' behaviour preserved: setting cursorKey to an off-screen index scrolls to make it visible.