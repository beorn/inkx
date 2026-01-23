# Test Suite Reorganization Analysis

Analysis for km-domain-objects.t bead - mapping out test suite reorganization around domain objects.

## Current Test Organization

| Package      | Test Files | Lines   | Pattern                  |
| ------------ | ---------- | ------- | ------------------------ |
| km-storage   | ~30        | ~12,000 | Mixed singleton/domain   |
| km-board     | ~3         | ~500    | Mostly domain objects    |
| km-tree      | ~2         | ~300    | Pure functions           |
| km-cli       | ~5         | ~2,000  | Integration (singletons) |
| km-ink (TUI) | ~15        | ~8,000  | Mixed                    |

## Pattern Analysis

### Tests Using Singletons (19% - ~14 files)

Files that call `getDb()`, `closeDb()`, `setKmDir()`, `setDatabase()`:

- `packages/km-storage/tests/rebuild.test.ts` - uses setKmDir, setDatabase
- `packages/km-storage/tests/store.test.ts` - initStore, closeStore
- `packages/km-storage/tests/node-crud.test.ts` - getDb, closeDb
- `packages/km-storage/tests/links.test.ts` - getDb, closeDb
- `packages/km-storage/tests/db-rules.test.ts` - resetDb, closeDb
- `apps/km-cli/tests/*.test.ts` - various singleton usage
- `apps/km-tui/packages/km-ink/tests/board.test.ts` - setKmDir, setDatabase

**Impact**: 24 `describe.serial` blocks prevent parallel execution.

### Tests Using Domain Objects (5% - ~5 files)

Files properly using `createVault()`, `createBoard()`, etc.:

- `packages/km-storage/tests/vault.test.ts` - createVault, runGenerator, using
- `packages/km-storage/tests/watcher.test.ts` - createWatcher, Service pattern
- `packages/km-board/tests/board.test.ts` - createBoard with injection
- `packages/km-storage/tests/testing/fake-vault.test.ts` - createFakeVault
- `packages/km-storage/tests/testing/chaos-fake-vault.test.ts` - createChaosFakeVault

### Pure Function Tests (26% - ~18 files)

Tests that don't need any storage, already fast:

- `packages/km-tree/tests/*.test.ts`
- `packages/km-storage/tests/recurrence.test.ts`
- `packages/km-storage/tests/path-utils.test.ts`
- `vendor/*/tests/*.test.ts`

### Integration Tests (31% - ~22 files)

Tests requiring real filesystem/database:

- `packages/km-storage/tests/sync/chaos/*.test.ts`
- `packages/km-storage/tests/watch/*.test.ts`
- `packages/km-storage/tests/e2e/*.test.ts`

## Recommendations

### Phase 1: Low-Hanging Fruit (2-3 days)

Convert 5 files from singleton to domain object pattern:

1. `node-crud.test.ts` → Use createFakeVault (pending)
2. `links.test.ts` → ✅ Uses isolated temp directories with ulid()
3. `query.test.ts` → ✅ Already parallelizable (no describe.serial)
4. `config.test.ts` → ⚠️ Must stay serial (tests global cache behavior)
5. `store.test.ts` → ✅ MemoryStore section uses isolated directories
6. `path-utils.test.ts` → ✅ Uses isolated temp directories with ulid()

**Actual impact**: test:fast improved from ~24s to ~22.5s

### Phase 2: Storage Layer Migration (3-5 days)

Convert remaining storage tests to use domain objects:

1. `rebuild.test.ts` - Use createVault generator
2. `db-rules.test.ts` - Use createVault with hooks
3. `resolve.test.ts` - Use createVault

**Estimated impact**: 50% of tests can parallelize.

### Phase 3: Integration Tests (5-7 days)

Refactor sync/watch tests to use domain objects:

1. `watch/*.test.ts` - Use createWatcher
2. `sync/chaos/*.test.ts` - Use createChaosFakeVault
3. `bidirectional-sync.test.ts` - Use createVault

**Estimated impact**: Complex but enables full parallelization.

### Phase 4: CLI/TUI Tests (2-3 days)

Update app-level tests:

1. `apps/km-cli/tests/*.test.ts` - Use createVault
2. `apps/km-tui/packages/km-ink/tests/board.test.ts` - Split into fast/slow

## Migration Pattern

### Before (Singleton)

```typescript
describe.serial("Node CRUD", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
  });

  test("creates node", () => {
    addNode(null, { type: "section", content: "test" });
    const node = getNode(id);
    // ...
  });
});
```

### After (Domain Object)

```typescript
describe("Node CRUD", () => {
  test("creates node", () => {
    const vault = createFakeVault({
      nodes: [createTestNode({ id: "1", parent_id: null })],
    });

    vault.addNode("1", { type: "section", content: "test" });
    const node = vault.getNode(id);
    // ...
  });
});
```

## Estimated Impact

| Metric          | Current | After Migration |
| --------------- | ------- | --------------- |
| test:fast time  | ~24s    | ~15-18s         |
| Parallel tests  | ~25%    | ~75%            |
| describe.serial | 24      | 5-8             |
| Test isolation  | Poor    | Good            |

## Priority Order

1. **High ROI**: node-crud.test.ts, links.test.ts, query.test.ts
2. **Medium ROI**: rebuild.test.ts, store.test.ts
3. **Low ROI but needed**: board.test.ts split, CLI tests

## Success Criteria

- [ ] All new tests use domain objects by default
- [ ] `describe.serial` count reduced from 24 to <10
- [ ] test:fast runs in <20 seconds
- [ ] No singleton usage outside legacy/compat tests
- [ ] Documentation updated with patterns

## Related Beads

- km-domain-objects (completed) - Domain objects implemented
- km-vault-plugins (completed) - Vault hooks for testing
- km-chaos-hooks (completed) - Chaos testing integration
- km-tui-test-modes (completed) - TUI test split into fast/slow categories
- km-test-storage-migrate (in progress) - Storage test migration to domain objects
