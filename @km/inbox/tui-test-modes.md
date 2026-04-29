---
id: "@km/_orphan/tui-test-modes"
aliases:
  - km-tui-test-modes
created_at: 2026-01-23T11:40:32Z
closed_at: 2026-01-23T13:31:03Z
---

# [x] TUI tests: Support FakeVault for faster test:fast @km/_orphan #task #P2

# TUI Test Infrastructure: Multi-Mode Vault Support

## Problem
TUI tests in `apps/km-tui/packages/km-ink/tests/board.test.ts` use real SQLite and temp directories, making them slower than necessary. Most tests are testing UI state logic, not storage integration.

## Current State

**Heavy setup in board.test.ts:**
```typescript
beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  setKmDir(TEST_DIR);
  setDatabase({ applyEvent });
  resetDb();
});
```

**Lightweight pattern in board-adapter.test.ts:**
```typescript
function createNode(id, children, overrides): TNode {
  return { id, type: "section", children, ... };
}
```

The adapter tests are fast because they use pure test data.

## Proposed Solution

### 1. Create Test Fixtures with FakeVault

Create `apps/km-tui/packages/km-ink/tests/fixtures/` with:
- `createTestVault()` - returns FakeVault with common test scenarios
- `createBoardTestContext()` - wraps FakeVault + Board domain object

### 2. Split Tests by Speed

| File Pattern | Vault Mode | When Run |
|-------------|------------|----------|
| `*.test.ts` | FakeVault (memory) | `test:fast` |
| `*.slow.test.ts` | Real vault (SQLite) | `test:all`, `test:slow` |
| `*.e2e.test.ts` | Real vault + real files | `test:all`, CI |

### 3. Refactor board.test.ts

Split into:
- `board.test.ts` - Fast tests using FakeVault/pure data
- `board.slow.test.ts` - Integration tests needing real SQLite

### 4. Add Test Mode Environment Variable

Support `KM_TEST_VAULT_MODE=fake|memory|disk` to override vault mode per run.

## Implementation Tasks

1. [ ] Create test fixtures in `apps/km-tui/packages/km-ink/tests/fixtures/`
2. [ ] Extract `board.test.ts` tests that don't need real storage
3. [ ] Convert extracted tests to use FakeVault/pure data
4. [ ] Move remaining tests to `board.slow.test.ts`
5. [ ] Verify `test:fast` time improves
6. [ ] Document the test mode patterns in docs/dev/testing.md

## Success Criteria

- `test:fast` runs in <25s (current ~24s, shouldn't regress)
- TUI tests that don't need real storage use FakeVault
- Clear separation between unit tests and integration tests
- No loss of test coverage

## Related

- @km/_orphan/vault-fake (completed) - FakeVault implementation
- @km/domain-objects/t - Test suite reorganization planning
