---
id: "@km/tui/backspace-edit"
aliases:
  - km-tui.backspace-edit
  - km-tui-backspace-edit
created_by: claude:db326126
created_at: 2026-03-30T18:10:07Z
closed_at: 2026-03-30T18:16:15Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] [bug] Backspace/delete keys don't work in inline edit mode (Ghostty) @km/tui #bug #P1

Backspace doesn't delete the previous character in inline edit mode. Ctrl-D doesn't work as forward delete. Text can be typed but not deleted.

Works in TTY MCP test (xterm.js emulator) but NOT in user's Ghostty terminal.

Likely cause: Ghostty with Kitty keyboard protocol sends Backspace differently than xterm.js. The Kitty-encoded key event may not set key.backspace=true in silvery's input parser, causing keyToString() to not return 'Backspace', so the text.delete_backward binding never matches.

The unguarded Backspace→delete_node binding (now fixed with when:not(textInputFocused)) was masking this — before the fix, Backspace was deleting the NODE instead of text. After the fix, Backspace does nothing because the text binding also doesn't match.

Debug steps:
1. Add DEBUG logging to key-adapter.ts to trace what keyToString returns for Backspace in Ghostty
2. Check silvery's Kitty protocol input parser for Backspace handling
3. May need to handle Kitty-encoded backspace (CSI 127 u) alongside legacy \x7f