---
id: "@km/tui/curswanty-clear"
aliases:
  - km-tui.curswanty-clear
  - km-tui-curswanty-clear
created_by: claude:1cef7d9e
created_at: 2026-02-10T22:55:02Z
closed_at: 2026-02-10T22:59:23Z
---

# [x] curswantY cleared by j/k - cross-column position lost after vertical movement @km/tui #bug #P2 @claude:1cef7d9e

j/k (up/down) clears layoutRegistry.stickyY, so after vertical movement within a column, the next h/l recaptures stickyY from the new position instead of using the original cross-column target. Expected: stickyY persists through j/k (like vim curswant persists through j/k). Fix: remove clearStickyY() from handleVerticalNav and the prev/next guard in handleCursorMove.