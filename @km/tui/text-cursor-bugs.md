---
mentions:
  - km
id: "@km/tui/text-cursor-bugs"
aliases:
  - km-tui.text-cursor-bugs
  - km-tui-text-cursor-bugs
created_by: claude:97217d5d
created_at: 2026-02-17T07:35:41Z
closed_at: 2026-02-19T22:11:57Z
owner: bjorn@stabell.org
---

# [x] Text cursor nav: ghost cursor, wrong line positions, exits edit on block cross @km/tui #bug #P1

Three bugs in @km/tui/text-cursor-nav (just shipped):

1. Exits edit mode when crossing to another node — should seamlessly enter edit on next block
2. Ghost cursor (two cursors shown) — stale inv attribute not cleared on cursor move
3. Line positions wrong — manual wrapSegment() doesn't match inkx's actual visual wrapping (prefixes, priority markers, indentation change available width)

User idea: leverage/improve/fix inkx's Textarea feature instead of manual line position calculation. Let inkx handle visual line geometry since it already knows actual screen positions.

