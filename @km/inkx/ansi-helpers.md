---
id: "@km/inkx/ansi-helpers"
aliases:
  - km-inkx.ansi-helpers
  - km-inkx-ansi-helpers
created_by: claude:fa5431cd
created_at: 2026-03-03T13:31:12Z
closed_at: 2026-03-04T16:36:01Z
owner: bjorn@stabell.org
assignee: claude:fbad9cb1
---

# [x] Consistent ANSI protocol helpers in chalkx, used by inkx @km/inkx #feature #P2 @claude:fbad9cb1

chalkx should export string-returning ANSI protocol helpers for all terminal control sequences. inkx currently has these scattered in output.ts with inconsistent APIs (some return strings, some write to stdout). Move to chalkx as the canonical source.

Helpers needed (all return string):
- enterAltScreen() / leaveAltScreen()
- cursorTo(row, col) / cursorHome()
- cursorHide() / cursorShow()
- cursorStyle(style) — block/underline/beam
- setTitle(title) — OSC 2
- enableMouse() / disableMouse()
- enableBracketedPaste() / disableBracketedPaste()
- enableSyncUpdate() / disableSyncUpdate()
- setScrollRegion(top, bottom) / resetScrollRegion()
- enableKittyKeyboard(flags) / disableKittyKeyboard()
- clearScreen() / clearLine()
- scrollUp(n) / scrollDown(n)

Then update inkx output.ts to import from chalkx instead of defining inline. This gives termless tests and any other consumer access to the same helpers.