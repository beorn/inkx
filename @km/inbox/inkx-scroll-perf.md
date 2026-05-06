---
mentions:
  - km
  - claude
id: "@km/inbox/inkx-scroll-perf"
aliases:
  - km-inkx-scroll-perf
  - "@km/_orphan/inkx-scroll-perf"
created_at: 2026-01-30T15:29:46Z
closed_at: 2026-01-30T15:31:39Z
assignee: claude:b8b4780b
---

# [x] [inkx] scrollTo in LAYOUT_PROPS causes unnecessary layout recalculation @km/_orphan #bug #P1 @claude:b8b4780b

## Summary

scrollTo is in LAYOUT_PROPS (helpers.ts:50), so every scroll change triggers a full layout recalculation via layoutNode.markDirty().

## Evidence

- Before scroll: layout phase takes 10-50ms
- After scrolling right past edge: layout phase jumps to 150-400ms
- Scrolling back left: returns to 10-15ms

## Root Cause

Right columns likely have more nodes. When scrollTo changes, the entire tree is marked dirty and flexx recalculates layout for ALL nodes - not just visible ones.

## Fix

Remove scrollTo from LAYOUT_PROPS in `vendor/beorn-inkx/src/reconciler/helpers.ts`.

scrollTo doesn't affect layout dimensions - it only determines scroll offset in scrollPhase, which runs on every render anyway and reads props.scrollTo directly. The layout engine (flexx/yoga) never sees scrollTo.

## Alternative

Add a separate scrollPropsChanged check that marks a different flag (e.g., scrollDirty) that only triggers scroll recalculation, not full layout.

## Source

Reported by another agent investigating slow scrolling in inkx.

