---
id: "@km/tui/delete-shows-error"
aliases:
  - km-tui.delete-shows-error
  - km-tui-delete-shows-error
created_by: Bjørn Stabell
created_at: 2026-04-01T14:42:27Z
closed_at: 2026-04-01T14:56:37Z
close_reason: "Fixed: ErrorBoundary resetKey was static (node.id+depth) — never
  reset when children changed. Now uses resetKeys=[node.id, depth,
  children.length] so it auto-recovers on delete/add/move. Also added onError
  logging via loggily. Commit 7c96e384."
---

# [x] Deleting sub-sub-item shows [error] instead of crashing or logging @km/tui #bug #P2 @Bjørn Stabell

Steps: Have a card with 2 sub-sub-items. Delete the first one. Result: [error] shown in red where the item was. Expected: either throw an exception (KM_STRICT=1) or log the error via loggily — never render [error] text to the user. Screenshot: ~/Desktop/Screenshot 2026-04-01 at 07.38.10.png