---
id: "@km/commands/position-type"
aliases:
  - km-commands.position-type
  - km-commands-position-type
created_by: claude:ceb7c9cb
created_at: 2026-03-27T23:42:52Z
closed_at: 2026-03-28T05:59:19Z
close_reason: All 3 phases complete. 15+ stringly-typed action types
  consolidated into 1 VerbAction shape. Position resolver extracted with 71
  tests.
---

# [x] [epic] Universal Position type — verb × location orthogonality @km/commands #epic #P2

## Goal

Replace 15+ stringly-typed verb-location action types with ONE typed action shape. All 4 verbs (goto, move, add, create) use the same VerbAction. No node-type branching. Inspired by SlateJS at/to pattern.

## Core Type

```typescript
interface VerbAction {
  type: 'goto' | 'move' | 'add' | 'create'
  at?: Position                      // source (cursor/selection) — used by move, add
  to: Position | { pick: string }    // target: resolved or deferred (prefix filter)
}

interface Position { parentId: string; childIdx: number }  // -1 = last, 0 = first
```

- `to: Position` — resolved immediately from key, execute now
- `to: { pick: '@' }` — deferred, open picker filtered by sigil prefix, confirmation re-dispatches with concrete Position
- Tags (#), assignees (@), projects (+) are all nodes in the tree — `add` always creates a link to a Position target
- `at` only needed for move/add (source node). goto/create don't need it.
- Multi-selection: handler uses getSelectedCards() — at is the primary cursor, selection is implicit context

## Resolution: key → to

`resolveLocationKey(key, cursor, repo) → Position | { pick }`

| Key | to | Notes |
|-----|-----|-------|
| h | { parentId: @nextId, childIdx: -1 } | resolve('@next') |
| i | { parentId: @inboxId, childIdx: -1 } | resolve('@inbox') |
| g | { parentId: cursor.parentId, childIdx: 0 } | first sibling |
| G | { parentId: cursor.parentId, childIdx: -1 } | last sibling |
| p | { parentId: grandparentId, childIdx: parentIdx } | parent's slot — works for both goto and move |
| 1-9 | { parentId: favId, childIdx: -1 } | getFavorite(key) |
| # | { pick: '#' } | sigil filter |
| @ | { pick: '@' } | sigil filter |
| + | { pick: '+' } | sigil filter |
| [ | { pick: '' } | no filter (any node) |

## Plan File
/Users/beorn/.claude/plans/fluttering-honking-snowflake.md

## Phases

1. **VerbAction + goto** — introduce VerbAction type, Position, resolveLocationKey. Wire goto verb. Delete GOTO_BOARD, JUMP_TO_FAVORITE.
2. **move + add + create** — wire remaining verbs through VerbAction. Delete MOVE_TO_BOARD, MOVE_TO_FAVORITE, SHIFT_TO_TOP/BOTTOM, ADD_LINK_TO_BOARD, SET_LABEL, SET_ASSIGNEE, REPARENT_PICKER, SHOW_ITEM_PICKER, CAPTURE.
3. **Extract + test** — kill TargetResolver, extract position-resolver.ts, comprehensive verb×location matrix tests.

## Status
Planning complete. Design v7 finalized. Ready for Phase 1.