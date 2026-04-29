---
id: "@km/tui/edit-cursor-style-flicker"
aliases:
  - km-tui.edit-cursor-style-flicker
  - km-tui-edit-cursor-style-flicker
created_by: Bjørn Stabell
created_at: 2026-04-06T19:11:10Z
closed_at: 2026-04-06T19:11:50Z
---

# [x] [bug] Sub-item styling flickers during edit cursor movement — checkbox/dim/indent changes @km/tui #bug #P1

When cursoring through items in edit mode (Ctrl+N), sibling items change their visual rendering:

Repro: ~vault @next card 'Next' — items: Statin, Test task3, And another task, Subtask
1. Edit 'Test task3' (Enter) — Subtask shows with □ checkbox, white, indented
2. Ctrl+N to 'And another task' — Subtask loses checkbox, becomes dimmed, different indent
3. Ctrl+N to 'Subtask' — Subtask shows white text but still no checkbox

Expected: Subtask should always show the same (with checkbox, same indent, same color).
The cursor position shouldn't change how NON-CURSOR siblings render.

Root cause: likely shouldExpand or cursorInDescendant logic changing the body/structural classification or fold state of siblings when the cursor parent changes.