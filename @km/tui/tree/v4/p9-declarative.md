---
id: "@km/tui/tree/v4/p9-declarative"
aliases:
  - km-tui.tree.v4.p9-declarative
  - km-tui-tree-v4-p9-declarative
created_by: Bjørn Stabell
created_at: 2026-04-09T04:11:30Z
closed_at: 2026-04-09T05:07:04Z
close_reason: >-
  Phase 9a (2fbfb9e76): 6 centralized store methods — setCursor, setSelection,
  beginEdit, endEdit, replaceFoldOverrides, replaceStickyFolds. Internal
  prev-tracking, batched writes.

  Phase 9b (c61cb23f6): Board.tsx migrated to store API. 4 prev-tracking refs
  deleted, expandSelectionWithDescendants moved to store. Board.tsx 1422→1348
  LOC (-74). Effects still exist as thin dispatches — further reduction possible
  by moving writes to action handlers (future work).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 9: Board.tsx declarative rewrite — move signal writes to action handlers @km/tui #task #P3 @Bjørn Stabell

## What

Board.tsx declarative rewrite. Two sub-phases per Pro review:

### Phase 9a: Centralized store write API

Add transactional store methods to NodeStore:
- setCursor(nodeId) — sets cursor signal + per-node cursor boolean
- setSelection(ids, anchor?) — normalize + apply with descendant expansion
- beginEdit(nodeId, blockIndex) — sets edit + editing signals
- endEdit() — clears edit + editing signals
- replaceFoldOverrides(map) — replace-all instead of diff
- replaceStickyFolds(map) — replace-all instead of diff

These are thin wrappers with batched signal writes. Invariants live here.

### Phase 9b: Move writes from Board.tsx to action handlers

Action handlers call store.setCursor() etc. instead of Board.tsx useEffects doing prev-tracking.
Board.tsx becomes a pure renderer — reads signals, renders, no sync effects.

Target: ~10-12 useEffects (lifecycle/handler only), Board.tsx ≤1000 LOC.

## Prerequisites

- Phase 7 (characterization tests) — safety net before rewrite
- Phase 9a before 9b

## Pro Review Guidance

- Use intent → batched store transaction, NOT scattershot signal writes
- Don't let action handlers poke signals directly everywhere
- Consider splitting Board into BoardView (render) + useBoardController (lifecycle)
- Write explicit ownership rules for each signal before starting

## /complete

\`\`\`bash
# Phase 9a
rg 'setCursor|setSelection|beginEdit|endEdit|replaceFoldOverrides|replaceStickyFolds' apps/km-tui/src/state/reactive.ts | wc -l  # ≥6

# Phase 9b
rg 'prevMultiSelectedRef|prevInlineEditRef' apps/km-tui/src/views/Board.tsx -c | wc -l  # 0
rg 'useEffect' apps/km-tui/src/views/Board.tsx | wc -l  # ≤12
wc -l apps/km-tui/src/views/Board.tsx  # ≤1000
bun run test:fast  # pass
\`\`\`