---
id: "@km/inbox/ou68u"
aliases:
  - km-ou68u
  - "@km/_orphan/ou68u"
created_by: claude:c9beade3
created_at: 2026-03-13T23:20:41Z
closed_at: 2026-03-13T23:37:43Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: Peekaboo visual+data sessions are different processes @km/_orphan #bug #P0 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

File: packages/peekaboo/src/backend.ts:54-129, 321-347
Classification: P0

launchTerminalApp() starts one terminal app; spawnPty() starts a second process feeding xterm. Screenshot and asserted terminal state can diverge immediately. Input/resizing only affects PTY side.

Suggested fix: Use single shared PTY/session, or scope Peekaboo as 'best-effort visual companion' rather than same-session verification.