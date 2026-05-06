---
mentions:
  - km
  - km-tui-fake-vaults
id: "@km/inbox/tui-fake-vaults"
aliases:
  - km-tui-fake-vaults
  - "@km/_orphan/tui-fake-vaults"
created_at: 2026-01-25T01:32:50Z
closed_at: 2026-01-25T01:39:46Z
assignee: km-tui-fake-vaults
---

# [x] Migrate TUI tests to use createFakeVault @km/_orphan #task #P2 @km-tui-fake-vaults

## Problem

TUI tests (body-content.slow.test.ts, tui-views.slow.test.ts) load real vaults from disk (~125-139ms/test), making them slow.

## Solution

Migrate to use createFakeVault() with in-memory fixtures (<10ms/test):

1. Extend createBoardTest() to accept Vault | string
2. Create fixture DSL for test data (body-content-fixture, generic-board-fixture)
3. Migrate slow tests to use fake vaults

## Expected Outcome

- test:fast: 3.64s → ~2.5s
- 10-15× speedup per test
- 10 tests moved from slow → fast

See plan: /Users/beorn/.claude/plans/eager-fluttering-lemon.md

