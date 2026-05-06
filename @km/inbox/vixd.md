---
mentions:
  - km
id: "@km/inbox/vixd"
aliases:
  - km-vixd
  - "@km/_orphan/vixd"
created_at: 2026-01-19T14:04:28Z
closed_at: 2026-01-19T14:13:14Z
---

# [x] Split keyboard-handler.ts (1,464 lines) @km/_orphan #task #P1

keyboard-handler.ts in apps/@km/tui/packages/@km/_orphan/ink/src/ is 1,464 lines with mixed concerns:

- Main board keyboard handling
- Detail pane keyboard handling
- Card movement logic (should be in storage layer)
- UI state mutations (should be in ui-reducer)
- Navigation history logic (should be in state management)

Should split into:

- keyboard-main.ts (~800 lines) - Main board keyboard handling
- keyboard-detail-pane.ts (~200 lines) - Detail pane input
- keyboard-helpers.ts (~300 lines) - Card manipulation helpers (moveCardInColumn, indentNode, etc.)
- Possibly move card movement to @km/storage layer

