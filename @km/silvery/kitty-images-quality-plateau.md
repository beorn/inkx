---
mentions:
  - km
id: "@km/silvery/kitty-images-quality-plateau"
aliases:
  - km-silvery.kitty-images-quality-plateau
  - km-silvery-kitty-images-quality-plateau
created_by: Codex
created_at: 2026-04-30T06:28:00Z
closed_at: 2026-04-30T08:09:00Z
---

# [x] Bring Kitty images to quality plateau @km/silvery #task #P0

Move Kitty image rendering from L2/L3 toward L4/L5 quality plateau.

Acceptance:

- [x] Pure placement planner owns visible rect, crop, delete, and place decisions.
- [x] Protocol emitters only serialize a plan.
- [x] Image writes preserve cursor state without flicker.
- [x] Partial top/left clipping scrolls out naturally instead of abrupt disappearance.
- [x] No retransmit-on-scroll regressions.
- [x] High-value termless/unit tests cover scroll offsets, offscreen deletion, source crop preservation, cursor preservation, and no silent protocol drift.

## 2026-04-30 Codex update

Implemented the planner-centered shape in `vendor/silvery/packages/ag-react/src/ui/image/image-placement.ts`.

- Added `planKittyImagePlacement()`: owns partial clipping, source crop,
  offscreen delete, no-op suppression, source-change retransmit, and placement
  keys.
- Wired `Image.tsx` through the planner for Kitty placement and through
  `computeVisibleImagePlacement()` for Sixel placement.
- Removed duplicate visibility/delete/no-op decision logic from `Image.tsx`.
- Preserved cursor state for Kitty/Sixel image writes and cleanup via
  `withCursorPreserved()`.
- Added unit coverage in `vendor/silvery/tests/features/image-placement-plan.test.ts`
  for partial top clipping, fully offscreen deletion, unchanged no-op, and
  source-change retransmit.

Verification:

- `bun vitest run --project vendor vendor/silvery/tests/features/image-placement-plan.test.ts vendor/silvery/tests/features/image-no-retransmit-on-move.test.tsx vendor/silvery/tests/features/image-stdout-routing.test.tsx`
- `bunx oxlint vendor/silvery/packages/ag-react/src/ui/image/Image.tsx vendor/silvery/packages/ag-react/src/ui/image/image-placement.ts vendor/silvery/tests/features/image-placement-plan.test.ts`
- `bun run typecheck` in `vendor/silvery`

Implemented by silvery commit `76859222` and parent repo commit `dfe3e15a8`.

