---
id: "@km/tui/test-commands"
aliases:
  - km-tui.test-commands
  - km-tui-test-commands
created_by: claude:28b14b32
created_at: 2026-02-23T12:20:51Z
closed_at: 2026-03-04T00:01:16Z
owner: bjorn@stabell.org
assignee: claude:f47d1ff0
---

# [x] Tests: use command dispatch instead of keypresses for functional tests @km/tui #task #P2 @claude:f47d1ff0

Currently tests like collapse.test.ts use board.press('v').press('c') which couples them to keybinding assignments. When keybindings change, dozens of tests break. Instead, functional tests should dispatch commands directly (e.g., board.command('toggle_collapse')). Keypress-to-command mapping tests should be isolated in keybindings.test.ts. This decouples functional correctness from keybinding assignment.