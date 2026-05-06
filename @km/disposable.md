---
mentions:
  - km
  - 20ff2ff9
id: "@km/disposable"
aliases:
  - km-disposable
  - "@km/_orphan/disposable"
created_at: 2026-01-23T18:27:11Z
closed_at: 2026-01-23T20:07:25Z
assignee: 20ff2ff9
---

# [x] Adopt Disposable pattern for all cleanup-requiring objects @km/disposable #feature #P2 @20ff2ff9

## Summary

Standardize on Disposable/AsyncDisposable pattern for all objects that require cleanup. Current codebase has partial adoption (Vault, Watcher have it) but tests don't use `using` statements, and several objects are missing the pattern.

## Current State

### Objects with Disposable (but tests don't use `using`):

- **Vault** - Has `Symbol.dispose`, but 40+ tests use try/finally
- **Watcher** - Has `Symbol.asyncDispose`, but tests manually call stop()

### Objects missing Disposable:

- **FakeVault** - Has close() but no Symbol.dispose
- **MemoryStore/DiskStore** - Has close() but no Symbol.dispose
- **ParsePool** - Has shutdown() but no AsyncDisposable

### Context helpers (NOT for Disposable):

- `runWithDb()` - AsyncLocalStorage wrapper, no cleanup needed
- `runWithKmDir()` - AsyncLocalStorage wrapper, no cleanup needed

## Migration Plan

### Phase 1: Use existing Disposable in tests (P0, 2-3 hours)

```typescript
// BEFORE (40+ occurrences in vault.test.ts)
const vault = runGenerator(createVault(vaultDir));
try {
  // test logic
} finally {
  vault.close();
}

// AFTER
using vault = runGenerator(createVault(vaultDir));
// test logic - cleanup guaranteed
```

For async:

```typescript
// BEFORE
const watcher = createWatcher(rootDir);
await watcher.start();
// test logic
await watcher.stop();

// AFTER
await using watcher = createWatcher(rootDir);
await watcher.start();
// test logic - stop() guaranteed
```

### Phase 2: Add Disposable to FakeVault (P1, 30 min)

```typescript
// In fake-vault.ts
return {
  close() { closed = true; },
  [Symbol.dispose]() { this.close(); },
  // ...
};
```

### Phase 3: Add Disposable to Store classes (P1, 1 hour)

```typescript
// In store.ts
export class MemoryStore implements NodeStore, Disposable {
  close(): void { this.db.close(); }
  [Symbol.dispose]() { this.close(); }
}
```

### Phase 4: Wrap ParsePool with Service interface (P2, 2-3 hours)

```typescript
export interface ParsePoolService extends AsyncDisposable {
  readonly status: ServiceStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  parse(nodeId: string, fsPath: string): Promise<ParseResult>;
}

export function createParsePool(options?: ParsePoolOptions): ParsePoolService {
  // Factory pattern matching Watcher
}
```

## Benefits

- Cleaner test code (no try/finally boilerplate)
- Exception-safe cleanup guaranteed by language
- Consistent patterns across codebase
- Less cognitive load for contributors

## Files Affected

- packages/@km/storage/tests/vault.test.ts (~40 changes)
- packages/@km/storage/tests/watcher.test.ts (~5 changes)
- packages/@km/storage/tests/watch/*.test.ts
- packages/@km/storage/src/testing/fake-vault.ts
- packages/@km/storage/src/store.ts
- packages/@km/storage/src/parse-pool.ts
- docs/dev/domain-objects.md (update examples)

## Non-Goals

- Don't add Disposable to stateless objects (Config)
- Don't change runWithDb/runWithKmDir (they're context managers, not resource owners)

## References

- docs/dev/domain-objects.md - existing Disposable documentation
- TypeScript Disposable: https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/#using-declarations-and-explicit-resource-management

