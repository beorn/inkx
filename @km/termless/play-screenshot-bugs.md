---
id: "@km/termless/play-screenshot-bugs"
aliases:
  - km-termless.play-screenshot-bugs
  - km-termless-play-screenshot-bugs
created_by: claude:4929065a
created_at: 2026-04-02T15:15:46Z
closed_at: 2026-04-02T16:37:06Z
close_reason: "Fixed: zero-dim terminal crash (pass undefined not 0 for
  cols/rows), empty frame capture (remove premature initial frame), font loading
  (loadSystemFonts: true). Screenshots now render correctly with Menlo
  monospace."
---

# [x] play screenshots broken: vterm crashes, xterm captures empty frames @km/termless #bug #P1

Two bugs in tape playback screenshot capture: (1) vterm.js crashes with cell.char=ch on undefined cell when cursor goes out of bounds during Type commands; (2) xterm.js captures empty/black frames because headless terminal screenshots before PTY output arrives.