---
id: "@km/silvery/ansi-passthrough"
aliases:
  - km-silvery.ansi-passthrough
  - km-silvery-ansi-passthrough
created_by: claude:474834b0
created_at: 2026-03-10T05:32:42Z
closed_at: 2026-03-10T06:00:00Z
close_reason: SGR colors and OSC 8 hyperlinks already parsed to cell properties.
  Fixed non-SGR CSI leak (cursor movement, erase). 12 tests.
owner: bjorn@stabell.org
---

# [x] Preserve pre-styled ANSI text (chalk colors, OSC hyperlinks) through renderer @km/silvery #feature #P2
