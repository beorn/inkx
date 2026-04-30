---
id: "@km/inbox/storage-9"
aliases:
  - km-storage-9
  - "@km/_orphan/storage-9"
created_at: 2026-01-24T00:24:08Z
closed_at: 2026-01-27T19:58:40Z
---

# [x] Unify test double terminology: mock → fake @km/_orphan #chore #P2

Rename 'mock' test doubles to 'fake' for consistency with industry standards (Martin Fowler's xUnit patterns).

## Background

Per [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html):
- **Fake**: Working implementation, simplified (e.g., in-memory DB) - state verification
- **Mock**: Verifies expected interactions - behavior verification

## Current State (post domain-refactor)

✅ Correct:
- `createFakeRepo()` - in-memory Repo with fixture data
- `createChaosFakeRepo()` - fake repo with chaos injection

⚠️ Misnamed (should be "fake"):
- `createMockWatcher()` → `createFakeWatcher()`
- `MockFileSystem` → `FakeFileSystem`
- `mock-fs.ts` → `fake-fs.ts`
- `mock-watcher.ts` → `fake-watcher.ts`

## Files to Rename

1. `packages/km-storage/tests/sync/chaos/mock-watcher.ts` → `fake-watcher.ts`
2. `packages/km-storage/tests/sync/chaos/mock-fs.ts` → `fake-fs.ts`
3. `vendor/beorn-watcher-chaos/src/mock-fs.ts` → `fake-fs.ts`
4. Update all imports and factory function names

## Scope

- Rename files
- Rename exports (createMockWatcher → createFakeWatcher, etc.)
- Update all import sites
- Update documentation referencing test doubles