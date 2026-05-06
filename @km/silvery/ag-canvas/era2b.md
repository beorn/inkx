---
mentions:
  - km
id: "@km/silvery/ag-canvas/era2b"
aliases:
  - km-silvery.ag-canvas.era2b
  - km-silvery-ag-canvas-era2b
created_by: Bjørn Stabell
created_at: 2026-03-31T07:08:32Z
owner: bjorn@stabell.org
---

# [ ] Era2b migration: commands + signals for canvas @km/silvery #feature #P4

When @silvery/commands and @silvery/headless ship (era2b), migrate the canvas client from era2a (useInput + useState) to era2b (command tree + keymaps + signals). This replaces the manual j/k/h/l handler with the command system, enables command palette, AI automation, and undo/replay. Blocked on silvery era2b Phase 2 (@silvery/commands).

