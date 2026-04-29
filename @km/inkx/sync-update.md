---
id: "@km/inkx/sync-update"
aliases:
  - km-inkx.sync-update
  - km-inkx-sync-update
created_at: 2026-02-09T10:35:16Z
closed_at: 2026-02-09T10:40:09Z
assignee: claude:f471fe61
---

# [x] DEC 2026 Synchronized Update Mode for flicker-free rendering @km/inkx #feature #P2 @claude:f471fe61

Wrap terminal output with DEC private mode 2026 (Synchronized Update) sequences to prevent tearing during redraws. The terminal batches all output between CSI?2026h and CSI?2026l and paints atomically.

## Status
- Tests exist in terminal-multiplexers.test.ts with constants and helpers
- ANSI.SYNC_UPDATE not yet exported from output.ts
- Scheduler writes raw output without sync wrapping

## Implementation
1. Add SYNC_UPDATE constants to ANSI export in output.ts
2. Wrap stdout.write() in scheduler.ts with sync update sequences (TTY mode only)
3. Add tests verifying the wrapping behavior
4. Terminal compat: supported by Ghostty, Kitty, WezTerm, iTerm2, Foot, Alacritty 0.14+. Terminals that don't support it safely ignore it.