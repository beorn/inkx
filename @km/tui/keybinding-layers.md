---
id: "@km/tui/keybinding-layers"
aliases:
  - km-tui.keybinding-layers
  - km-tui-keybinding-layers
created_by: claude:949598cc
created_at: 2026-02-11T20:12:17Z
closed_at: 2026-02-12T14:14:09Z
---

# [x] Structure keybindings as layered groups for clarity @km/tui #task #P3 @claude:586bad48

Replace flat ~100-entry keybinding array (where global order matters) with layered groups: dialog bindings, text bindings, navigation bindings, etc. Only search relevant layer based on current mode/state. Goal is readability and reduced ordering fragility, not performance. Could also evaluate adopting an existing keybinding library. Ref: O3 deep research review of event handling architecture.