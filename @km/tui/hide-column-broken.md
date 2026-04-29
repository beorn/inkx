---
id: "@km/tui/hide-column-broken"
aliases:
  - km-tui.hide-column-broken
  - km-tui-hide-column-broken
created_by: Bjørn Stabell
created_at: 2026-04-06T19:45:51Z
closed_at: 2026-04-06T20:37:57Z
close_reason: "Fixed: setUI post-set signal sync was guarded by 'typeof partial
  === \"object\"', which silently skipped the function-variant of setUI.
  handleHideNode used the function variant to atomically bump hiddenVersion, so
  signals.hiddenNodeIds was never updated and the view lens never re-evaluated.
  Fix: capture resolvedKeys inside set() and use them for the post-set sync, so
  function and object variants behave identically. Tests: 7 hide tests now pass
  (including 2 pre-existing failing ones). See
  apps/km-tui/src/state/board-app-store.ts setUI block."
---

# [x] [bug] vX (hide column) doesn't actually hide the column @km/tui #bug #P2 @Bjørn Stabell
