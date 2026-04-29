---
id: "@km/_orphan/hjda"
aliases:
  - km-hjda
created_at: 2026-01-19T10:50:43Z
closed_at: 2026-01-19T11:05:49Z
---

# [x] Fix lossy state conversion in command-bridge.ts @km/_orphan #bug #P2

boardStateToCommandContext() loses data: zoomStack cursor always [0] instead of actual position, navHistory dropped entirely. Location: apps/@km/tui/packages/@km/_orphan/ink/src/command-bridge.ts:88-99