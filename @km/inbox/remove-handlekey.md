---
id: "@km/_orphan/remove-handlekey"
aliases:
  - km-remove-handlekey
created_at: 2026-01-24T23:43:01Z
closed_at: 2026-01-25T00:55:18Z
---

# [x] Remove legacy handleKey function and migrate tests to command system @km/_orphan #task #P2

The handleKey function in state.ts (lines 632-915, ~283 lines) is marked as legacy and should be removed. It's currently used by 38 test calls across 2 files:

- apps/@km/tui/tests/board.test.ts: ~18 calls  
- apps/@km/tui/tests/board-move-elaborate.test.ts: ~20 calls

Production code uses the command system exclusively (processKeyWithContext → handleCommandAction), but tests still use handleKey for simpler unit testing.

## Migration Strategy

Two approaches for test migration:

1. **Integration style**: Use stdin.write (goes through full command system)
   - Pro: Tests real flow, closer to production
   - Con: Slower, requires full TUI setup
   
2. **Unit style**: Call processKeyWithContext + handleCommandAction directly  
   - Pro: Faster, more focused tests
   - Con: Need to mock InkKeyEvent, build test context

## Steps

1. Create test helper function (e.g., simulateKey) to wrap command system
2. Migrate board.test.ts tests (~18 calls)
3. Migrate board-move-elaborate.test.ts tests (~20 calls)
4. Remove handleKey function from state.ts
5. Verify all tests pass

## Verification

- bun run test:fast passes (2700+ tests)
- No references to handleKey remain except in git history