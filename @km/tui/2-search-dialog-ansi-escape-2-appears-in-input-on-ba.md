---
mentions:
  - km
  - claude
id: "@km/tui/2-search-dialog-ansi-escape-2-appears-in-input-on-ba"
aliases:
  - km-tui.2
  - km-tui-2
  - "@km/tui/2"
created_at: 2026-02-04T15:55:59Z
closed_at: 2026-02-04T17:38:25Z
assignee: claude:44a381e0
---

# [x] Search dialog: ANSI escape [2 appears in input on backspace @km/tui #task #P2 @claude:44a381e0

When clearing the search input by pressing backspace repeatedly, the characters [2 appear in the input.

**Investigation (2026-02-04):**

- NOT an ANSI escape sequence leak - the ANSI output does NOT contain \x1b[2
- The characters [ (0x5b) and 2 (0x32) are literal text in the buffer
- React state is correct: use-line-edit shows value='' after second backspace
- InputBox receives correct props: beforeCursor='', afterCursor='', showPlaceholder='type to search...'
- BUT the terminal buffer shows [2 at the input position

**Root cause:** inkx rendering pipeline bug. The React tree is correct but the buffer content is wrong. This suggests a differential rendering issue where old content isn't being properly overwritten when content changes.

**Repro:** Type 2+ chars in search, backspace twice to empty.

