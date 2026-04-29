---
id: "@km/_orphan/5tpt"
aliases:
  - km-5tpt
created_at: 2026-01-19T14:21:33Z
closed_at: 2026-01-19T14:35:42Z
---

# [x] TUI crashes on start and leaves terminal broken @km/_orphan #bug #P1

Two issues:
1. TUI crashes with 'undefined is not an object (evaluating siblings.length)' in command-bridge.ts
2. When TUI crashes, the terminal alternate buffer is not properly cleaned up, leaving the terminal in a broken state

Root causes:
1. In executor.ts:36, siblings = currentNode.children can be undefined if children is missing
2. fullscreen-ink only cleans up in cleanUpOnExit which requires waitUntilExit() to complete, but crashes bypass this