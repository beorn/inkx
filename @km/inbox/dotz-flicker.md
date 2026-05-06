---
mentions:
  - km
id: "@km/inbox/dotz-flicker"
aliases:
  - km-dotz-flicker
  - "@km/_orphan/dotz-flicker"
created_at: 2026-01-28T18:21:57Z
closed_at: 2026-02-04T11:27:27Z
---

# [x] DotzReporter flickers when view exceeds screen height @km/_orphan #bug #P2

## Problem

When the DotzReporter output grows taller than the terminal screen height, there's visible flickering during live updates.

## Expected Behavior

Content should scroll smoothly when it exceeds screen height, with the live-updating portion remaining stable.

## Current Behavior

Flickering occurs, possibly due to cursor movement calculations or frame redraw timing.

## Technical Context

- Reporter uses cursor movement (CSI.moveUp) to redraw in place
- Cursor movement is capped to terminal rows to prevent going past screen top
- Content is allowed to scroll naturally when exceeding screen height
- Issue may be in writeFrame() method in infra/vitest-dotz/index.tsx

## Reproduction

```bash
bun run test:fast2  # with many packages that trigger file breakout
```

