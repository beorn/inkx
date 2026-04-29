---
id: "@km/silvery/scope-phase-3-subroots"
aliases:
  - km-silvery.scope-phase-3-subroots
  - km-silvery-scope-phase-3-subroots
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:49Z
---

# [ ] Phase 3.1: Sub-reconciler roots migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Migrate silvercode panels from mountSubroot(...).unmount() to useScopeEffect(scope => scope.use(mountSubroot(<PanelUI/>, term))). mountSubroot returns Disposable after Phase 2. Exit: grep shows zero root.unmount() calls in app code; test suite green.