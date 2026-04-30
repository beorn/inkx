---
id: "@km/inbox/azw2"
aliases:
  - km-azw2
  - "@km/_orphan/azw2"
created_at: 2026-01-19T10:50:51Z
closed_at: 2026-01-19T11:05:49Z
---

# [x] Audit keybinding conflicts (z/Z/Ctrl+z) @km/_orphan #task #P2

Potential keybinding conflicts in keybindings.ts:132-148: z=toggle_fold, Ctrl+z=undo, Shift+Z could conflict between fold_all and unfold_all. Need to verify resolution order and document intended behavior.