---
mentions:
  - km
id: "@km/inbox/chaos-service"
aliases:
  - km-chaos-service
  - "@km/_orphan/chaos-service"
created_at: 2026-01-23T11:04:59Z
closed_at: 2026-01-23T11:24:40Z
---

# [x] ChaosWatcher: Implement Service interface @km/_orphan #task #P2

Make ChaosWatcher implement the same Service interface as the real Watcher.

## Changes

- Add `status` property getter (ServiceStatus)
- Make `start()` and `stop()` async
- Implement `[Symbol.asyncDispose]()`
- Ensure interface matches `@km/storage` Watcher

## Benefit

ChaosWatcher becomes interchangeable with real Watcher via dependency injection:

```typescript
using vault = runGenerator(createVault(path, {
  inject: {
    watcher: createChaosWatcher({ scenario })  // Drop-in replacement
  }
}));
```

Location: vendor/beorn-watcher-chaos/src/watcher.ts

