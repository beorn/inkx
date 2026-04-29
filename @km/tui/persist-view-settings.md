---
id: "@km/tui/persist-view-settings"
aliases:
  - km-tui.persist-view-settings
  - km-tui-persist-view-settings
created_by: claude:4a5961be
created_at: 2026-03-16T20:19:02Z
closed_at: 2026-03-17T06:54:26Z
close_reason: "Implemented filterProperties persistence in workspace-persist.ts.
  Serialize: Sets to arrays (omitted when empty). Deserialize: arrays to Sets
  (backwards compatible). Restore in board-app-store.ts applies to all board
  panes. 12 new tests cover full round-trip."
---

# [x] Persist view settings (hide done, filters) across sessions @km/tui #feature #P2

View settings like 'hide done' are currently ephemeral — they reset when the app restarts. These should persist across sessions.

Settings to persist: hide done toggle, any other view filters/sort modes.

Options: persist per-vault in SQLite (alongside node data), or in a config file, or in the vault's .km/ directory.