---
mentions:
  - km
  - Bjørn
id: "@km/tui/memory-leak"
aliases:
  - km-tui.memory-leak
  - km-tui-memory-leak
created_by: claude:db326126
created_at: 2026-03-30T18:50:07Z
closed_at: 2026-04-02T20:56:28Z
close_reason: "Fixed: (1) heartbeat interval not cleared on exit, (2)
  patchConsole unbounded entries array + quadratic snapshot copies — capped at
  1000 entries with lazy snapshots. Added opt-in km:memory diagnostics. Segfault
  likely Bun GC issue with large heap — reduced heap pressure should help.
  Commit f08bd819."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Bun segfault on exit — 10.54GB RSS, likely memory leak @km/tui #bug #P1 @Bjørn Stabell

User reported crash after trying to quit km view. RSS was 10.54GB (MacBook has 128GB). Bun segfault at address 0x23B923B823B723B6. Likely a memory leak in the TUI — possibly from popover render callbacks, unbounded cache growth, or event handler leaks.

