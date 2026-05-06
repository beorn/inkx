---
mentions:
  - km
  - claude
id: "@km/terminfo/inline-examples"
aliases:
  - km-terminfo.inline-examples
  - km-terminfo-inline-examples
created_by: claude:f8196c1c
created_at: 2026-03-26T04:25:19Z
closed_at: 2026-03-26T04:35:04Z
close_reason: Inline escape sequence example tables on /features (8 rows) and
  /standards (6 rows). vitepress-plugin-glossary installed for site-wide acronym
  tooltips. All deployed.
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Inline escape sequence examples on /standards and /features pages @km/terminfo #task #P3 @claude:f8196c1c

Add a few inline examples showing escape sequences and their rendered effect on both index pages. Not comprehensive — just enough to make the pages tangible.

Examples like:

- SGR: ESC[1m → Bold, ESC[38;2;255;0;0m → Red text
- Cursor: ESC[5;10H → Move to row 5, col 10
- Modes: ESC[?1049h → Alternate screen
- Device: ESC[6n → Terminal responds with cursor position
- Kitty: ESC[>1u → Enable Kitty keyboard

Format: small styled table or code block with annotation. Scattered through the relevant sections, not grouped into one big table.

