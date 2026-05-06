---
mentions:
  - km
  - claude
projects:
  - Escape
id: "@km/tui/chord-escape-artifact"
aliases:
  - km-tui.chord-escape-artifact
  - km-tui-chord-escape-artifact
created_by: claude:d3a7049b
created_at: 2026-02-21T17:10:36Z
closed_at: 2026-02-21T17:12:52Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Rendering artifacts after g+Escape chord cancel @km/tui #bug #P2 @claude:d3a7049b

After pressing 'g' (chord prefix) then Escape to cancel, there are visual artifacts at the top of the screen in the column header area. The column headers show extra border fragments and corrupted rendering.

Repro: press g, then Escape. Look at top bar area.
Screenshot: ~/Desktop/Screenshot 2026-02-21 at 17.09.49.png

