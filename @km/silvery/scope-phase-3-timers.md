---
id: "@km/silvery/scope-phase-3-timers"
aliases:
  - km-silvery.scope-phase-3-timers
  - km-silvery-scope-phase-3-timers
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:51Z
---

# [ ] Phase 3.2: Raw setTimeout/setInterval migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]], [[@km/silvery/scope-phase-4-eslint]]

Replace raw setTimeout/setInterval in apps/* + packages/* with: const id = setTimeout(fn, ms); scope.defer(() => clearTimeout(id)). Timer handles are primitives in browsers — use scope.defer, not disposable()+use. Update sticky-folds, Notifications, bootstrap, silvercode toast layer per migration guide. Exit: grep shows zero raw setTimeout/setInterval outside @silvery/* + vendor/*.