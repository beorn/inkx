---
id: "@km/_orphan/singleton-removal"
aliases:
  - km-singleton-removal
created_at: 2026-01-23T18:13:14Z
closed_at: 2026-01-23T18:20:09Z
---

# [x] Complete singleton removal: add Vault.needsRebuild() @km/_orphan #task #P2

## Plan: Remove Singletons, Use Domain Objects

### End Goal Architecture

Move from singleton-based to domain object-based:

```typescript
// Singleton-based (current)
setKmDir("/path/.km");
setDatabase({ applyEvent });
const tasks = getAllTasks();  // Uses global state

// Domain object-based (target)
const vault = createVault("/path/to/vault");
const tasks = vault.getAllTasks();  // Uses vault's owned state
vault.close();
```

### Why Not ALS?

ALS is a stopgap for backwards compatibility, not the goal:
- **Hidden dependencies** - Global function calls magically use different state based on context
- **Easy to forget** - Code that forgets to run in context silently uses wrong state
- **Hard to debug** - Tracing which context a function is using requires understanding the call stack

### Completed (2026-01-23)

- [x] Fixed `withTestEnv` to put `kmDir` inside `vaultDir` (not parent)
- [x] Fixed `emit.ts` to use `getKmDir()` everywhere (not module-level `kmDir`)
- [x] Added `tryGetContextDb()` to check ALS context without side effects
- [x] Updated `loadVault` to use context db in memory mode if available
- [x] All 18 failing tests now pass (0 fail, 2971 pass)

### Remaining Work

1. **Add `needsRebuild()` to Vault interface**
   - File: `packages/km-storage/src/vault.ts`
   - Memory mode returns false (never needs rebuild)
   - Disk mode checks events.jsonl vs last_event in meta table

2. **Update rebuild.test.ts**
   - Use `vault.needsRebuild()` instead of standalone function
   - Convert the todo test to use domain object pattern

3. **Deprecate standalone `needsRebuild()`**
   - File: `packages/km-storage/src/rebuild.ts`
   - Add @deprecated JSDoc, keep for backwards compat

### Files to Modify

1. `packages/km-storage/src/vault.ts` - Add needsRebuild() method
2. `packages/km-storage/tests/rebuild.test.ts` - Use vault.needsRebuild()
3. `packages/km-storage/src/rebuild.ts` - Deprecate standalone function

### Verification

```bash
bun run test:fast   # All tests pass
```