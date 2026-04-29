---
id: "@km/silvery/scope-phase-3-signals"
aliases:
  - km-silvery.scope-phase-3-signals
  - km-silvery-scope-phase-3-signals
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:54Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scope-phase-3-signals
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:39:54Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-3-signals
    depends_on_id: km-silvery.scope-phase-2
    type: blocks
    created_at: 2026-04-24T13:39:55Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [ ] Phase 3.5: term.signals.on migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Migrate app-layer callers off term.signals.on directly. withScope plugin handles root SIGINT/SIGTERM once via term.signals.on (which returns Disposable after Phase 2) + scope.use. App code uses useAppScope() + root scope disposal instead. Exit: grep for term.signals.on in apps/* + packages/* returns zero (vendor/* exempt).