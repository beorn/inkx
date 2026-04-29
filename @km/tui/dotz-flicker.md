---
id: "@km/tui/dotz-flicker"
aliases:
  - km-tui.dotz-flicker
  - km-tui-dotz-flicker
created_at: 2026-02-04T11:27:26Z
closed_at: 2026-02-04T12:42:37Z
assignee: claude:a7826e85
---

# [x] DotzReporter flickers when view exceeds screen height @km/tui #bug #P2 @claude:a7826e85

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