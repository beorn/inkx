---
id: "@km/tui/chord-timeout"
aliases:
  - km-tui.chord-timeout
  - km-tui-chord-timeout
created_by: claude:d3a7049b
created_at: 2026-02-20T16:12:32Z
closed_at: 2026-03-04T16:23:30Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Chord help popup disappears too quickly — leave open 1-2s @km/tui #bug #P2 @claude:d3a7049b

The chord keybinding timeout feels too short. Users can't reliably complete chord sequences. The which-key popup staying open was fixed (1.5s), but the actual chord timeout (time allowed between prefix key and suffix key) may still be too short. User reports it should be a little longer.