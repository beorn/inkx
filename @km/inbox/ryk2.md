---
id: "@km/inbox/ryk2"
aliases:
  - km-ryk2
  - "@km/_orphan/ryk2"
created_at: 2026-01-20T11:28:55Z
closed_at: 2026-01-20T12:03:57Z
---

# [x] Fix extra blank lines in columns/cards/tabs views @km/_orphan #bug #P2

Fixed: Trailing newlines in task content caused wrapText() to produce empty string elements at the end of the lines array. These empty strings were then rendered as blank lines in the TUI.

Root cause: The wrapAnsi library preserves trailing newlines when wrapping text. For example, 'Hello world\n' becomes ['Hello world', ''] after split. The empty string at the end gets rendered as a blank line.

Fix: Modified wrapText() in vendor/beorn-tui-measure/src/text.ts to strip trailing empty lines from the result array. Empty lines in the MIDDLE of content (intentional paragraph breaks like 'para1\n\npara2') are preserved.

Added comprehensive tests in vendor/beorn-tui-measure/src/text.test.ts covering:
- Trailing newline handling
- Multiple trailing newlines
- Preserved middle blank lines (paragraph breaks)
- constrainText behavior with trailing newlines