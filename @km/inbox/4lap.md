---
mentions:
  - km
id: "@km/inbox/4lap"
aliases:
  - km-4lap
  - "@km/_orphan/4lap"
created_at: 2026-01-20T07:44:26Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] InkX: Add tests for terminal output functions @km/_orphan #task #P2

## Problem

Terminal utility functions in `vendor/beorn-inkx/src/output.ts` (lines 537-579) have no unit tests:

- clearScreen()
- clearToEnd()
- clearLine()
- enterAlternateScreen()
- leaveAlternateScreen()
- enableMouse()
- disableMouse()

## Solution

Add tests verifying each function returns correct ANSI escape sequences.

