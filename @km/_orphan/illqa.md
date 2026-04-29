---
id: "@km/_orphan/illqa"
aliases:
  - km-illqa
created_by: claude:124bfbe5
created_at: 2026-02-12T17:07:51Z
closed_at: 2026-02-12T19:45:40Z
---

# [x] TUI: z (fold all/toggle) blocked by chord prefix — never fires synchronously @km/_orphan #bug #P3 @claude:124bfbe5

The z key is both a standalone shortcut (toggle_fold, fold_all) and a chord prefix (zc, zo, zO, zM, zR). The chord system enters pending state on z, deferring standalone execution to 300ms timeout. This means z alone never folds immediately — it waits for a potential chord completion. In TTY, the timeout eventually fires, but the fold produces garbled rendering. In sync tests, the timeout never fires so z has no effect. Root cause: keybinding conflict between z-standalone and z-chord-prefix in packages/@km/_orphan/commands/src/keybindings.ts.