---
id: "@km/tui/unify-list-nav"
aliases:
  - km-tui.unify-list-nav
  - km-tui-unify-list-nav
created_by: Bjørn Stabell
created_at: 2026-04-02T22:26:09Z
closed_at: 2026-04-02T22:31:45Z
---

# [x] Unify applyBlockNav/applyOutlineNav/applyPageJump into applyListNav @km/tui #task #P2 @Bjørn Stabell

Three nearly-identical index-based reducer functions. Merge into applyListNav(state, dir, items, currentIndex). Eliminates ~80 lines of duplicate code. ~1 hour.