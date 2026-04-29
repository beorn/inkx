---
id: "@km/inkx/terminal-caps-degrade"
aliases:
  - km-inkx.terminal-caps-degrade
  - km-inkx-terminal-caps-degrade
created_by: claude:23485adf
created_at: 2026-02-24T12:10:17Z
closed_at: 2026-03-07T02:12:08Z
close_reason: "Grooming: already implemented — terminal-caps.ts with detectTerminalCaps"
owner: bjorn@stabell.org
---

# [x] Detect terminal capabilities and gracefully degrade rendering @km/inkx #feature #P2

inkx should detect terminal capabilities (true color, DEC 2026 sync, kitty keyboard, etc.) and gracefully degrade. Currently INKX_SYNC_UPDATE=0 is the only workaround for Ghostty garbled rendering. Need: (1) auto-detect terminal (Ghostty, Kitty, iTerm2, Terminal.app) (2) disable features known to be buggy per-terminal (3) provide env var overrides. Triggered by: Ghostty shows garbled output with DEC 2026 sync + incremental updates, works fine with sync disabled.