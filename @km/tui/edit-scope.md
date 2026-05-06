---
mentions:
  - km
id: "@km/tui/edit-scope"
aliases:
  - km-tui.edit-scope
  - km-tui-edit-scope
created_by: Bjørn Stabell
created_at: 2026-04-06T19:53:18Z
owner: bjorn@stabell.org
---

# [ ] Edit mode as bounded scope — constrain operations to card boundary @km/tui #feature #P2

Root cause from /big analysis (2026-04-06): 4 edit-mode bugs (nav-column-jump, undo-crash, outdent-promote, empty-card-key-capture) share the same structural cause — edit mode is a flag (isInlineEditing), not a scope with defined valid operations.

Current: each operation individually checks edit boundaries (or doesn't). New operations forget to check.

Design: Edit mode should be a bounded context that intercepts ALL operations and constrains them to the card. Invalid actions are rejected at the scope boundary. This is the TEA state machine vision: editMachine(action) -> [state, effects] where the machine only accepts valid actions.

Would prevent: all 4 bugs above, plus any future edit-mode boundary violations.

