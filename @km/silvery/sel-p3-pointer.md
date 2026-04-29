---
id: "@km/silvery/sel-p3-pointer"
aliases:
  - km-silvery.sel-p3-pointer
  - km-silvery-sel-p3-pointer
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:33Z
closed_at: 2026-04-04T09:20:56Z
owner: bjorn@stabell.org
---

# [x] Selection Phase 3: Pointer gestures @km/silvery #task #P1

Mouse-driven selecting kinds: area select, text drag, drop, gesture morphing, lasso overlay.

## What changes
- `packages/silvery-selection/src/pointer-gestures.ts` — NEW: selectingKind derivation, gesture morphing
- `packages/silvery-selection/src/lasso.ts` — NEW: ANSI inverse-video lasso overlay during drag
- `packages/silvery-selection/src/provider.tsx` — wire pointer events → gesture signals

## Delete
Nothing — still additive.

## New tests
- `packages/silvery-selection/tests/pointer-gestures.test.ts` — all 9 selecting kinds, morphing, drop
- `packages/silvery-selection/tests/lasso.test.ts` — lasso overlay rendering
- `packages/silvery-selection/tests/area-select-filter.test.ts` — filter parameter for cards-vs-blocks

## Definition of Done
- [ ] All mouse selecting kinds from design doc work
- [ ] Gesture morphing (text-drag ↔ node-area) works
- [ ] Lasso visual overlay renders during drag
- [ ] Area-select filter parameter works
- [ ] Tests pass

## /complete
- `bun vitest run packages/silvery-selection/tests/pointer` → all pass