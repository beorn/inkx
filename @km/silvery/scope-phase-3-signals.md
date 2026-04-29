---
id: "@km/silvery/scope-phase-3-signals"
aliases:
  - km-silvery.scope-phase-3-signals
  - km-silvery-scope-phase-3-signals
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:54Z
---

# [ ] Phase 3.5: term.signals.on migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Migrate app-layer callers off term.signals.on directly. withScope plugin handles root SIGINT/SIGTERM once via term.signals.on (which returns Disposable after Phase 2) + scope.use. App code uses useAppScope() + root scope disposal instead. Exit: grep for term.signals.on in apps/* + packages/* returns zero (vendor/* exempt).