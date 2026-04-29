---
id: "@km/remove-singletons/7-make-ensurestate-return-store-instead-of-using-get"
aliases:
  - km-remove-singletons.7
  - km-remove-singletons-7
  - "@km/remove-singletons/7"
created_at: 2026-01-23T23:39:25Z
closed_at: 2026-01-24T08:01:21Z
---

# [x] Make ensureState() return store instead of using getStore() @km/remove-singletons #task #P2 @15d108d7

CLI commands currently do:
```typescript
runGenerator(ensureState(path, search));
const store = getStore();  // Retrieves global store set by ensureState
```

Should be:
```typescript
const store = runGenerator(ensureState(path, search));
// store is returned, no global state access needed
```

Files to update:
- packages/@km/storage/src/rebuild.ts - ensureState() should yield and return the store
- apps/@km/_orphan/cli/src/index.ts - use returned store instead of getStore()
- apps/@km/_orphan/cli/src/commands/bd.ts - use returned store instead of getStore()