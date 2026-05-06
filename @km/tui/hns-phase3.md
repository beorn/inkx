---
mentions:
  - km
  - Bjørn
id: "@km/tui/hns-phase3"
aliases:
  - km-tui.hns-phase3
  - km-tui-hns-phase3
created_by: Bjørn Stabell
created_at: 2026-04-08T07:31:25Z
closed_at: 2026-04-08T08:15:07Z
close_reason: Purged cursorInDescendant signal, prevDescendantCardId, manual
  sync. Reduced signals are sole source. All 217 tests pass. Commit d739625f0.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 3: Purge + Remove — delete old sync @km/tui #task #P1 @Bjørn Stabell

Delete old sync methods and all ad-hoc state. Break intentionally, fix via tsc.

## What to do

1. Delete _legacySyncCursor() method and all internals (prevDescendantCardId tracking)
2. Delete _legacySyncSelected() method and expandWithDescendants/hydrateDescendantSelection helpers
3. Delete cursorInDescendant signal from NodeReactiveState
4. Delete cursorCardNodeId, cursorColumnNodeId, cursorDepth store-level signals
5. Delete shadow comparison code + assertParity from Board.tsx
6. Delete syncEdit() (if not already handled — may move to Phase 4)
7. Fix all tsc errors — guided by compiler, not guesswork
8. Update selection-style.ts documentation
9. Sweep docs/ for stale references

## Delete

- _legacySyncCursor, _legacySyncSelected (private shadow methods from Phase 1)
- prevDescendantCardId, expandWithDescendants, hydrateDescendantSelection (internals)
- cursorInDescendant (per-node signal)
- cursorCardNodeId, cursorColumnNodeId, cursorDepth (store-level signals)
- Shadow comparison code (assertParity, shadow caller in Board.tsx)
- @deprecated annotations added in Phase 1

## /complete

\`\`\`bash

## ALL must return 0 — no legacy, no shadow, no ad-hoc

rg syncCursor --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg _legacySyncCursor --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (shadow deleted)
rg syncSelected --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg _legacySyncSelected --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (shadow deleted)
rg prevDescendantCardId --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg expandWithDescendants --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg hydrateDescendantSelection --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg 'cursorInDescendant.*Signal' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0
rg assertParity --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (shadow deleted)
rg '@deprecated.*hns-phase3' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (annotations deleted)

## Golden tests still pass

bun run test:fast  # all pass

## Bench: wall time ≤ Phase 0 baseline

## Docs swept

rg syncCursor docs/ -c 2>/dev/null | wc -l  # → 0
rg cursorInDescendant docs/ -c 2>/dev/null | wc -l  # → 0
\`\`\`

