---
mentions:
  - km
id: "@km/inbox/tui-testable"
aliases:
  - km-tui-testable
  - "@km/_orphan/tui-testable"
created_at: 2026-01-23T23:44:52Z
closed_at: 2026-01-24T16:33:37Z
---

# [x] TUI testability via Vault domain object DI @km/_orphan #task #P2

Refactor TUI to use Vault domain object instead of storage module singletons.

## Problem

- InkBoardTestable is static-only (uses noopDispatch)
- 16 files in @km/tui import from @km/storage globals
- Can't test keyboard → state → visual flow

## Progress

- ✅ Fixed all TypeScript errors across codebase
- ✅ Added vault prop to InkBoardTestable
- ✅ Created createFakeVault() for testing
- 🔄 Some visual tests need Inkx context wiring (23 tests failing)

## Remaining Work

- Wire useScreenRectCallback with proper Inkx context in tests
- Complete vault injection for full keyboard → state → visual testing

## Files

- packages/@km/storage/src/vault.ts (already exists)
- apps/@km/tui/src/vault-context.tsx (create - thin wrapper)
- 16 files in @km/tui to migrate

