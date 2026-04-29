---
id: "@km/test-simplify/11-use-mockwatcher-in-mock-mode-instead-of-skipping-t"
aliases:
  - km-test-simplify.11
  - km-test-simplify-11
  - "@km/test-simplify/11"
created_at: 2026-01-23T23:40:08Z
closed_at: 2026-01-24T18:03:10Z
---

# [x] Use MockWatcher in mock mode instead of skipping tests @km/test-simplify #task #P3 @11507516

Currently watcher tests are skipped in mock mode:
```typescript
test.skipIf(isMockMode())("watcher test", ...)
```

Instead, inject MockWatcher from chaos testing infrastructure when TEST_MODE=mock:
```typescript
// In test setup
const watcher = isMockMode() 
  ? createMockWatcher() 
  : vault.watch();
```

Benefits:
- More tests run in fast iteration cycle
- Mock mode becomes truly mock, not skip-mode
- Existing MockWatcher already handles event simulation

Files to consider:
- packages/@km/storage/tests/sync/chaos/mock-watcher.ts (export for general use)
- packages/@km/storage/src/vault.ts (DI for watcher creation)
- All watcher tests (remove skipIf, use injected watcher)