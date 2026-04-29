---
id: "@km/inkx/mouse-parse"
aliases:
  - km-inkx.mouse-parse
  - km-inkx-mouse-parse
created_by: claude:d3a7049b
created_at: 2026-02-20T14:05:56Z
closed_at: 2026-02-20T14:10:07Z
---

# [x] Parse SGR mouse sequences from stdin @km/inkx #task #P3 @claude:d3a7049b

No parser for SGR mouse sequences (CSI < button;x;y M/m). Need parseMouse() that extracts button, position, action (down/up/move/wheel), and delta from SGR 1006 format. Should integrate with splitRawInput() to handle mixed key+mouse input.