---
mentions:
  - km
  - claude
id: "@km/inbox/test-helpers-1"
aliases:
  - km-test-helpers-1
  - "@km/_orphan/test-helpers-1"
created_at: 2026-01-28T21:42:10Z
closed_at: 2026-01-28T21:50:32Z
assignee: claude:1fbd8fe1
---

# [x] Harmonize TUI test fixtures and rendering helpers @km/_orphan #task #P3 @claude:1fbd8fe1

Review and consolidate the two testing systems in @km/tui:

## Current State

- `testing.ts` (BoardTestHarness) - integration test helper with repo loading
- `board-test.ts` (testEnv, renderBoard) - unit test helpers with fixture builders

## Analysis

The two systems serve different purposes:

1. `createBoardTest` - Integration tests loading real files from disk
2. `testEnv`/`renderBoard` - Unit tests with in-memory fixtures

Key difference: `testing.ts` uses `BoardCore` (static), `testEnv` uses `Board` (stateful with keyboard).

## DRY Opportunities Identified

1. Both have duplicated BoardCore element creation (lines 167-195 in testing.ts, similar in board-test.ts)
2. Both implement similar harness wrappers around inkx App
3. The keymap in testing.ts duplicates what inkx/testing provides via keyToAnsi

## Recommended Actions

1. Extract common `createBoardElement` helper for BoardCore props assembly
2. Consider if BoardTestHarness could extend/use BoardTestImpl
3. Use keyToAnsi from inkx/testing instead of custom keymap in testing.ts
4. Document when to use each API in CLAUDE.md

## Scope

- Review all test helpers in apps/@km/tui/tests/helpers/
- Review apps/@km/tui/src/testing.ts
- Identify consolidation opportunities
- Propose unified API

