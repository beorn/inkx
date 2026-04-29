---
id: "@km/silvery/scope-phase-3-stores"
aliases:
  - km-silvery.scope-phase-3-stores
  - km-silvery-scope-phase-3-stores
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:57Z
---

# [ ] Phase 3.7: Store subscribe/off pairs migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Migrate all useEffect(() => { unsub = store.subscribe(); return unsub }) patterns to useScopeEffect. Option A: update store.subscribe to return Disposable directly; then scope.use(store.subscribe(onChange)). Option B (BC): scope.defer(store.subscribe(onChange)) — the returned () => void becomes the defer callback. Exit: grep for manual unsub patterns returns zero.