---
mentions:
  - km
id: "@km/disposable-2"
aliases:
  - km-disposable-2
  - "@km/_orphan/disposable-2"
created_at: 2026-01-23T21:42:18Z
closed_at: 2026-01-23T21:53:21Z
---

# [x] Complete Disposable pattern adoption across codebase @km/disposable-2 #task #P3

## Summary

Follow-up to @km/disposable. Convert remaining try/finally patterns to `using`/`await using` statements, add Symbol.dispose to vendor packages, and leverage DisposableStack for complex cleanup.

## JavaScript Dispose Features to Consider

### DisposableStack / AsyncDisposableStack

For complex cleanup with multiple resources:

```typescript
// Instead of nested try/finally
await using stack = new AsyncDisposableStack();
const syncManager = stack.use(createSyncManager());
stack.defer(() => setFsSync(null));  // cleanup callback
await syncManager.start();
// ... test logic ...
// All cleanup happens automatically in reverse order
```

### Symbol.dispose vs Symbol.asyncDispose

- `Symbol.dispose` → sync cleanup, use with `using`
- `Symbol.asyncDispose` → async cleanup, use with `await using`

## Scope

### Core Package Tests (12 easy conversions)

| File                  | Count | Pattern                          |
| --------------------- | ----- | -------------------------------- |
| links.test.ts         | 6     | store.close() → using store      |
| db-rules.test.ts      | 1     | store.close() → using store      |
| store.test.ts         | 5     | store.close() → using store      |
| worker-thread.test.ts | 1     | syncManager.stop() → await using |

### Complex Cases (20 tests - use DisposableStack)

| File                       | Pattern                              | Solution                 |
| -------------------------- | ------------------------------------ | ------------------------ |
| bidirectional-sync.test.ts | setFsSync(null) + syncManager.stop() | Use AsyncDisposableStack |
| db-to-fs.test.ts           | setFsSync(null) + syncManager.stop() | Use AsyncDisposableStack |

```typescript
await using stack = new AsyncDisposableStack();
stack.defer(() => setFsSync(null));
const syncManager = stack.use(await createSyncManager());
// cleanup: syncManager.stop() then setFsSync(null)
```

### Vendor Packages

| Package       | File              | Change                                      |
| ------------- | ----------------- | ------------------------------------------- |
| beorn-inkx-ui | progress-bar.ts   | Add Symbol.dispose to ProgressBar class     |
| beorn-inkx-ui | multi-progress.ts | Add Symbol.dispose to MultiProgress class   |
| beorn-mdtest  | cmdSession.ts     | Add Symbol.asyncDispose to CmdSession class |
| beorn-mdtest  | ptySession.ts     | Add Symbol.asyncDispose to PtySession class |

## Acceptance Criteria

- [ ] All 12 easy test conversions done
- [ ] Complex test cases use AsyncDisposableStack
- [ ] Vendor packages have Symbol.dispose/Symbol.asyncDispose
- [ ] All tests pass
- [ ] No new try/finally patterns for dispose-able resources

