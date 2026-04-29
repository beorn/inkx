---
id: "@km/silvery/showcase-rendering"
aliases:
  - km-silvery.showcase-rendering
  - km-silvery-showcase-rendering
created_by: claude:474834b0
created_at: 2026-03-10T07:48:00Z
closed_at: 2026-03-10T15:36:56Z
close_reason: Fixed horizontal text clipping in content-phase-adapter.ts. Added
  ClipRect with horizontal bounds, truncateToWidth(), and overflow=hidden
  clipping. 3 new tests.
---

# [x] Coding Agent showcase on silvery.dev has rendering artifacts @km/silvery #bug #P2 @claude:55df8ef1

The Coding Agent showcase on silvery.dev shows rendering corruption:

- Stale/overlapping text fragments on the right side (e.g., 'rv', 'return', arrows)
- Characters bleeding outside the demo border/clipping region
- Visible in the live site as of 2026-03-10

Screenshot: ~/Desktop/Screenshot 2026-03-10 at 00.46.11.png

Likely causes:
1. Wide character or word-wrap overflow in the content-phase
2. Clipping bounds not applied to the showcase container
3. The web renderer (renderToXterm) might handle overflow differently than terminal