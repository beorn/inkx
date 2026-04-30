---
id: "@km/silvery/images-render-artifacts"
aliases:
  - km-silvery.images-render-artifacts
  - km-silvery-images-render-artifacts
created_at: 2026-04-30T08:17:31.219Z
type: task
priority: P0
---

# [ ] Make terminal images backend-owned render artifacts @km/silvery #task #P0

Move Kitty/Sixel images from effect-owned stdout writes toward typed renderer-owned artifacts.

Acceptance:

- [x] Typed frame-artifact queue owns image protocol writes.
- [x] Viewport clipping handles all four terminal edges.
- [x] Termless tests cover post-paint ordering, clipping, and no retransmit-on-scroll.
- [x] Termless tests cover cleanup protocol writes.
- [ ] Image/text layering policy is explicit.
- [ ] Old anonymous image write path is deleted or limited to non-image escape fallbacks.

## 2026-04-30 Codex update

First plateau slice:

- Added `TerminalFrameArtifact` and `StdoutContext.queueFrameArtifact`.
- `createApp()` now flushes typed frame artifacts after `runtime.render()`, sorted by `zIndex`, before legacy raw post-paint writes.
- `<Image />` queues Kitty/Sixel protocol writes as typed image artifacts.
- `<Image />` cleanup writes Kitty deletion immediately because unmount may not have a following paint frame.
- `computeVisibleImagePlacement()` now clips right/bottom against the terminal viewport and emits matching source crop dimensions.
- Added unit and termless coverage for right/bottom clipping and unmount cleanup.

Verification:

- `bun vitest run --project vendor vendor/silvery/tests/features/image-placement-plan.test.ts vendor/silvery/tests/features/image-stdout-routing.test.tsx vendor/silvery/tests/features/image-no-retransmit-on-move.test.tsx`
- `bun run typecheck` in `vendor/silvery`
