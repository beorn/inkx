---
mentions:
  - km
  - claude
id: "@km/termless"
aliases:
  - km-termless
  - "@km/_orphan/termless"
created_by: claude:82965375
created_at: 2026-03-02T12:59:30Z
owner: bjorn@stabell.org
assignee: claude:8fc35754
---

# [ ] termless: headless terminal testing library @km/termless #epic #P3 @claude:8fc35754

## Vision

A terminal testing library following the Playwright model: **pluggable backends behind a unified interface**, integrated into Vitest. Write tests once, run against Ghostty, xterm.js, and eventually kitty, wezterm, etc.

**Packages**: termless (core interface + types + PTY), termless-ghostty (N-API/Zig), termless-xtermjs (@xterm/headless), viterm (Vitest integration). See Design section for complete architecture, interface, phases, and rationale.

