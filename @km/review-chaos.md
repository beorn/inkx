---
mentions:
  - km
id: "@km/review-chaos"
aliases:
  - km-review-chaos
  - "@km/_orphan/review-chaos"
created_at: 2026-01-23T09:00:56Z
closed_at: 2026-01-23T09:22:28Z
---

# [x] Architecture review: chaos testing @km/review-chaos #epic #P2

## Summary

0 critical, 2 high, 5 medium, 3 low

## High (blocks reliability of test framework)

- [chaos.test.ts:52-55](packages/@km/storage/tests/sync/chaos/chaos.test.ts#L52-L55) - **Deletion test is broken/skipped**: Comment says "This will currently fail because we don't actually delete the file" - the mock watcher only sends events, doesn't modify filesystem. This means file deletion is not properly tested.
- [regression.test.ts:122-125](packages/@km/storage/tests/sync/chaos/regression.test.ts#L122-L125) - **Regression framework unused**: The `regressions/` directory is empty (only README.md). The test uses `test.skip` when no scenarios exist. The framework is ready but has never captured a real bug.

## Medium (test gaps & doc drift)

- [scenarios.ts:80-123](vendor/beorn-watcher-chaos/src/scenarios.ts#L80-L123) - **3 scenarios lack factory functions**: `PARTIAL_WRITES`, `RENAME_STORM`, and `INIT_GAP` have constants but no customizable factory functions.
- [chaos-testing.md:69-81](docs/dev/chaos-testing.md#L69-L81) - **Doc lists 11 scenarios but 12 exist**: `DUPLICATE_EVENTS` is implemented but not documented.
- No test for **recovery after queue overflow**.
- No test for **cross-directory moves**.
- Concurrent edit tests for **conflict resolution just check "no crash"** without asserting final state.

## Low (style/minor)

- [CLAUDE.md](CLAUDE.md) - Doesn't reference `/chaos-test` skill.
- Test coverage statistics not tracked.
- DUPLICATE_EVENTS reuses `rapid_succession` type internally.

## Quick Wins

1. Add DUPLICATE_EVENTS to docs table
2. Add 3 missing factory functions
3. Reference chaos skill in CLAUDE.md

## Larger Refactors

1. Fix deletion test - requires MockWatcher to modify MockFileSystem (2-3 files)
2. Capture real regressions - run fuzzer extensively
3. Add recovery tests after queue overflow

