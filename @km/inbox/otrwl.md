---
id: "@km/_orphan/otrwl"
aliases:
  - km-otrwl
created_by: claude:c9beade3
created_at: 2026-03-13T23:21:17Z
closed_at: 2026-03-13T23:45:55Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: emulator cannot send responses back to application (no backend→PTY path) @km/_orphan #bug #P1 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

Files: src/types.ts:130-148, src/terminal.ts:85-108, src/pty.ts:47-138
Classification: P1

Backend can consume terminal output (feed) and encode keys, but no channel for emulator-generated replies (cursor position reports, device attributes, kitty keyboard negotiation, focus/mouse replies) to be written back to PTY. Some terminal apps will hang.

Suggested fix: Add backend→PTY response path: feed() returns bytes to write back, or backend exposes onResponse callback.