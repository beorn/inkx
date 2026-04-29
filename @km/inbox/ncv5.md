---
id: "@km/_orphan/ncv5"
aliases:
  - km-ncv5
created_at: 2026-01-22T16:10:19Z
closed_at: 2026-01-23T11:39:45Z
---

# [x] Restore corrupted files from sync disaster @km/_orphan #task #P1

Track files corrupted by km sync --to-fs and their recovery status.

## Issue Summary
The km sync --to-fs command corrupted files by writing markdown stubs over source code.

## Test Failures (14 total)

### db-rules tests (7 failures)
**Root cause**: Architecture changed from links to embed nodes
- evaluateAddRule() now creates embed nodes instead of links
- Tests still check links table, which remains empty
- Old code: 'evaluateAddRule: stored %d links'
- New code: 'evaluateAddRule: created %d embeds, removed %d'
- **Fix needed**: Update tests to check embed children instead of links

### card-positions tests
- Tests reference unimplemented methods: setStickyY(), dump(), getStickyY(), clearStickyY()
- Restored card-positions.ts has basic registry methods but tests expect more

## Files Status

### Successfully restored from Claude sessions:
| File | Session | Status |
|------|---------|--------|
| apps/@km/tui/packages/@km/_orphan/ink/src/card-positions.ts | aa05efda | ✓ Restored (basic version) |
| apps/@km/_orphan/cli/src/utils/format-path.ts | 03e4eae4 | ✓ Restored |
| apps/@km/tui/packages/@km/_orphan/ink/tests/card-positions.test.ts | aa05efda | ⚠️ Restored but has type errors |

### Never committed to git (were untracked WIP files):
| File | Session Reference | Notes |
|------|-------------------|-------|
| packages/@km/storage/scripts/chaos-cli.ts | fecbe128 | Task agent created, skeleton in prompt |
| packages/@km/storage/tests/mocks/filesystem.ts | 9599e9dc | MockFileSystem class definition found |
| packages/@km/storage/tests/mocks/filesystem.test.ts | Not found | Likely never created |

These files have no git history - they were never committed. The directories don't exist:
- packages/@km/storage/scripts/ - doesn't exist
- packages/@km/storage/tests/mocks/ - doesn't exist

The chaos testing infrastructure IS intact at packages/@km/storage/tests/watch/chaos/

## Related Beads
- @km/_orphan/sxt7: Tool to index/search files from Claude sessions (created)
- @km/_orphan/me0n: Fix sync corruption bug (add .md filter)
