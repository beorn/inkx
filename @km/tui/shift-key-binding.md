---
mentions:
  - km
  - Bjørn
id: "@km/tui/shift-key-binding"
aliases:
  - km-tui.shift-key-binding
  - km-tui-shift-key-binding
created_by: Bjørn Stabell
created_at: 2026-03-31T22:03:49Z
closed_at: 2026-03-31T22:04:06Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Kitty Shift+/ keybinding regression: show_help not triggered @km/tui #bug #P2 @Bjørn Stabell

When fixing Shift+3 text insertion (key.text = '#'), the Kitty fallback changed input from base key to shifted char. This broke keybinding resolution: Shift+/ produced input='?' instead of '/', so keyMap.get('?') missed the 'shift-/' binding for show_help.

Root cause: parseKey's input field serves two purposes (keybinding resolution via keyMap lookup AND text insertion fallback), but the fix only considered the text insertion use case.

Fix: parseKey now returns base key for input (for keybinding resolution) and shifted char for key.text (for text insertion). For letters, input is uppercase to match legacy terminal behavior (components check input === 'G').

Also fixed matchHotkey to check key.text for character hotkeys like '!' that need to match against the actual typed character.

Tests added: 42 new shifted-punct tests in silvery, integration tests for both text insertion and keybinding resolution paths in @km/_orphan/commands.

