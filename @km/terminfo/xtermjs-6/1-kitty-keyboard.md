---
id: "@km/terminfo/xtermjs-6/1-kitty-keyboard"
aliases:
  - km-terminfo.xtermjs-6.1-kitty-keyboard
  - km-terminfo-xtermjs-6-1-kitty-keyboard
created_by: claude:27beac99
created_at: 2026-03-26T06:51:38Z
closed_at: 2026-03-26T17:03:59Z
close_reason: "Probed 6.0.0 and 6.1.0-beta.195, added to version catalog.
  kitty-keyboard detection blocked on termless backend capability reporting
  (hardcoded false). 32 new annotations added. Remaining: update
  @termless/xtermjs to detect version and report kittyKeyboard=true for 6.1+
  (separate termless bead)."
---

# [x] xterm.js 6.1: kitty keyboard protocol — update headless backend + version catalog @km/terminfo #task #P2 @claude:27beac99

xterm.js 6.1.0 (Jan 2026) added kitty keyboard protocol support. This is huge — xterm.js powers VS Code, Cursor, and most web terminals.

Actions:
1. Add 6.1.0 to versions.json xterm.js versions
2. Update @xterm/headless dependency
3. Re-run headless probes — extensions.kitty-keyboard should now pass
4. Re-probe VS Code and Cursor when they ship with xterm.js 6.1+

Source: https://github.com/xtermjs/xterm.js/pull/5600