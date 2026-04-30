---
id: "@km/inbox/ykx3"
aliases:
  - km-ykx3
  - "@km/_orphan/ykx3"
created_at: 2026-01-22T12:12:19Z
closed_at: 2026-01-24T01:13:17Z
---

# [x] TUI goes blank on scroll, keys appear as text instead of actions @km/_orphan #bug #P2

When scrolling in the TUI, the screen sometimes goes blank and keyboard input (h, j, k, l) appears as literal text on screen instead of being handled as commands. This suggests the Ink app is losing raw mode or the input handler is being disconnected.