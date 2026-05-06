---
mentions:
  - km
  - claude
id: "@km/inbox/08qxc"
aliases:
  - km-08qxc
  - "@km/_orphan/08qxc"
created_by: claude:4a5961be
created_at: 2026-03-17T03:41:02Z
closed_at: 2026-03-17T06:00:47Z
close_reason: Wired clickToCursorOffset into handleMouse. Same-node click
  repositions cursor via setCursorOffset. Different-node-in-card click saves and
  re-enters edit. idNode tracked during ancestor walk for rect lookup.
owner: bjorn@stabell.org
assignee: claude:656602a3
---

# [x] Wire clickToCursorOffset into handleMouse @km/_orphan #task #P2 @claude:656602a3

clickToCursorOffset utility exists (board/click-to-cursor.ts) with unit tests (click-to-position.spec.ts). Needs wiring into handleMouse for: (1) same-node click during edit → setCursorOffset, (2) different-node-in-card click → initialCursorPos, (3) double-click entering edit → initialCursorPos. Previous attempt caused cursor positioning on every click — needs investigation with real Ghostty terminal (not reproducible in headless xterm.js). Requires EnterInlineEditAction.initialCursorPos addition.

