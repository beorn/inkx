---
id: "@km/silvery/modifier-keys-all"
aliases:
  - km-silvery.modifier-keys-all
  - km-silvery-modifier-keys-all
created_by: claude:656602a3
created_at: 2026-03-16T21:40:30Z
closed_at: 2026-03-16T22:00:24Z
close_reason: "6 Cmd shortcuts added to inline-edit-barrier (Cmd+F, Cmd+Shift+F,
  Cmd+D, Cmd+N, Cmd+Enter, Cmd+Shift+Enter). Most Cmd shortcuts already worked.
  Tests: 251 pass."
---

# [x] Report all modifier keys to enable app-level Cmd/Super shortcuts @km/silvery #feature #P2

With REPORT_ALL_KEYS, apps can now bind Cmd+key shortcuts directly (not just Ctrl+key). Kitty protocol reports Super modifier on key events. This allows macOS-native keybindings like Cmd+S (save), Cmd+Z (undo), Cmd+F (find) instead of Ctrl variants.