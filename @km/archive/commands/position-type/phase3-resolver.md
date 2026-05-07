---
mentions:
  - km
  - claude
id: "@km/commands/position-type/phase3-resolver"
aliases:
  - km-commands.position-type.phase3-resolver
  - km-commands-position-type-phase3-resolver
created_by: claude:ceb7c9cb
created_at: 2026-03-28T00:39:06Z
closed_at: 2026-03-28T05:59:02Z
close_reason: Phase 3 complete. TargetResolver deleted, position-resolver.ts
  extracted, 71 tests added.
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Phase 3: Position resolver — kill TargetResolver, extract + test @km/commands #task #P2 @claude:ceb7c9cb

Eliminate TargetResolver type and magic string protocol. Extract resolution table into position-resolver.ts.

## Changes

1. @km/_orphan/commands/src/verb-locations.ts — SYSTEM_LOCS maps key → { label } only. Verb constructors take locationKey directly. Delete TargetResolver, all resolver functions.
2. @km/_orphan/commands/src/locations.ts — REPO_LOCS stays for CLI. Clean up labels.
3. @km/tui/src/board/position-resolver.ts (NEW) — resolvePosition(key, cursor, repo): Position | null. Pure function.
4. @km/tui/tests/position-resolver.test.ts (NEW) — Comprehensive tests for each key. Edge cases: root cursor, no grandparent, missing favorites.
5. @km/tui/tests/verb-position.test.ts (NEW) — Orthogonal tests: each verb × each location. Verify all 4 verbs produce correct action type with locationKey. Verify resolution table produces correct Positions.

## Delete

TargetResolver type, all resolver functions (inbox, home, parent, first, last, fav, pick), TARGET_LABELS, PICKER_LABELS

## /complete

- grep -r 'TargetResolver' packages/@km/_orphan/commands/ → 0
- grep -r '"parent"\|"first"\|"last"\|"fav:"' packages/@km/_orphan/commands/src/verb-locations.ts → 0
- File exists: apps/@km/tui/src/board/position-resolver.ts
- File exists: apps/@km/tui/tests/position-resolver.test.ts
- File exists: apps/@km/tui/tests/verb-position.test.ts
- All tests pass

