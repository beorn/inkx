---
id: "@km/silvery/virtualizer-single-mode"
aliases:
  - km-silvery.virtualizer-single-mode
  - km-silvery-virtualizer-single-mode
created_by: claude:8b5b9e1c
created_at: 2026-04-21T03:59:06Z
closed_at: 2026-04-21T04:32:14Z
close_reason: >-
  Strategy (a) shipped in commit 380e9644.


  Bootstrap windowCalc replaced with minimal count-based seed (anchor = scrollTo
  ?? 0; window = minWindowSize items; placeholder heights via sumHeights).
  Mid-cycle calcEdgeBasedScrollOffset dance removed from both windowCalc and
  scrollOffsetRef derivation. scrollToItem now sets the anchor directly (Box
  overflow=scroll handles ensure-visible-with-padding in scroll-phase).


  LOC delta in useVirtualizer.ts: -123 / +49 (slightly above the projected ~50
  LOC because the old architecture comment block shrank alongside the code).


  Tests green:

  - vendor/silvery/tests/features/listview-*.test.tsx -> 34/34

  - vendor/silvery/tests/ui/virtualizer-*.test.tsx + siblings -> 41/41

  - apps/km-tui/tests/scroll-and-cursor.test.tsx -> 27/27


  FUZZ note: listview-scroll-properties.fuzz.tsx fails at counterexample
  [40,150,10,"random",4.215e-20,0] under INV-5 — but this is PRE-EXISTING
  (verified by running the same seed on HEAD before the commit). The failure is
  a fuzz-generator artifact: heights[6]=2 renders a border-only card with no id
  text, so the id-detector in listview-scroll-helpers.tsx reports a fake "hole".
  Unrelated to this change.


  calcEdgeBasedScrollOffset stays exported — HorizontalVirtualList still uses it
  via useVirtualization.
---

# [x] Delete useVirtualizer bootstrap mode — containerNode is universal @km/silvery #feature #P3 @claude:8b5b9e1c

blocks:: [[@km/silvery]]

After @km/silvery/virtualizer-from-layout activated with containerNode wired in ListView, the bootstrap mode (count-based calcEdgeBasedScrollOffset + height-aware forward walk using estimateHeight) is dead code for the ListView path. Exists to handle first render before useLayoutEffect captures the containerNode ref. Strategy: first render returns minimal placeholder window (start=0, end=minItems, leadingHeight=0, trailingHeight=0). useLayoutEffect captures containerNode → setContainerNode triggers re-render with real layout-signals data. Eliminates ~150 LOC of bootstrap code and conditional-mode complexity. Risk: 2-frame mount may flicker; mitigated by empty-first-render.