---
id: "@km/tui/manage-favorites-escape"
aliases:
  - km-tui.manage-favorites-escape
  - km-tui-manage-favorites-escape
created_by: Bjørn Stabell
created_at: 2026-04-15T01:30:35Z
closed_at: 2026-04-15T01:53:38Z
close_reason: "Fixed in 40aacb487: favorites dialog bindings now guarded by
  favoritesDialogOpen (direct UI state check) instead of
  inScope('dialog:favorites'), which depended on pushDialogMode wiring that
  wasn't reliably reached before the first key event. Regression test added in
  dialog-lifecycle.test.ts."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.manage-favorites-escape
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T18:30:35Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Escape does not close Manage Favorites dialog @km/tui #bug #P2

blocks:: [[@km/tui]]

Pressing Shift+M opens the Manage Favorites dialog; pressing Escape should close it (via dialog.cancel command) but does nothing. Possibilities: wildcard binding favorites.select_key (line 578 keybindings.ts) resolving before the Escape binding (line 577); inScope('dialog:favorites') returning false because the focus scope is not actually pushed; DIALOG_CANCEL handler's showFavoritesDialog check reading stale state. Need a unit test that calls resolveKeybinding('Escape', {}, ctx) with activeScopes=['dialog:favorites'] and favoritesKeySelected=false, expecting dialog.cancel. Not blocking — the user can still close the dialog another way.