---
id: "@km/inkx/cursor-query"
aliases:
  - km-inkx.cursor-query
  - km-inkx-cursor-query
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:25:54Z
closed_at: 2026-02-25T23:37:05Z
owner: bjorn@stabell.org
---

# [x] queryCursorPosition() API — DSR cursor position query @km/inkx #feature #P2

Expose DSR (Device Status Report) cursor position query as a public inkx API.

Send \x1b[6n, parse \x1b[row;colR response. Same pattern as detectKittySupport, queryPaletteColor, etc.

API: queryCursorPosition(write, read, timeout?) → { row: number, col: number }
Convenience: queryCursorFromStdio(stdout, stdin, timeout?) → { row: number, col: number }

Motivation: inline mode apps need to know cursor-to-bottom distance at startup to size their dynamic area correctly (e.g. useScrollback pattern without forcing height=termRows).