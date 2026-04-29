---
id: "@km/tui/input-mode-stack"
aliases:
  - km-tui.input-mode-stack
  - km-tui-input-mode-stack
created_by: claude:36393b5d
created_at: 2026-02-18T23:42:50Z
closed_at: 2026-02-19T12:03:47Z
owner: bjorn@stabell.org
---

# [x] Global input mode state machine with push/pop context stack @km/tui #task #P2

O3 recommendation: Implement a global keyboard mode manager using a context stack pattern. States: 'command', 'insert', 'dialog:search', 'dialog:rename', etc. Push/pop model — opening any dialog pushes its mode, closing pops back to previous. Single source of truth for 'who handles keystrokes right now'. Prevents the entire category of bugs where two subsystems both process the same key event (keys-as-text, search close focus leak, edit mode after zoom). Related: @km/tui/keys-as-text (this is the architectural fix).