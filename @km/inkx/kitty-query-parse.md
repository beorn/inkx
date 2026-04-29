---
id: "@km/inkx/kitty-query-parse"
aliases:
  - km-inkx.kitty-query-parse
  - km-inkx-kitty-query-parse
created_by: claude:d3a7049b
created_at: 2026-02-20T14:04:30Z
closed_at: 2026-02-20T14:08:53Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Parse Kitty protocol query response @km/inkx #task #P2 @claude:d3a7049b

queryKittyKeyboard() sends CSI ? u but we don't parse the terminal's response (CSI ? flags u). Need a parser that reads the response from stdin and returns which flags the terminal supports. This is needed by @km/silvery-legacy/kitty-auto for detection.