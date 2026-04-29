---
id: "@km/commands/position-type/phase1-goto"
aliases:
  - km-commands.position-type.phase1-goto
  - km-commands-position-type-phase1-goto
created_by: claude:ceb7c9cb
created_at: 2026-03-28T00:39:05Z
closed_at: 2026-03-28T02:09:00Z
close_reason: VerbAction type introduced. goTo returns CURSOR_TO { locationKey
  }. GOTO_BOARD + JUMP_TO_FAVORITE deleted. All 4646 tests pass.
---

# [x] Phase 1: VerbAction + goto @km/commands #task #P2 @claude:ceb7c9cb

Introduce VerbAction type, Position type, resolveLocationKey. Wire goto verb. Delete old goto action types.

## Changes
1. @km/_orphan/commands/src/types.ts — Add VerbAction { type, at?, to: Position | { pick } } and Position { parentId, childIdx }. Delete GotoBoardAction, JumpToFavoriteAction.
2. @km/_orphan/commands/src/verb-locations.ts — goTo returns VerbAction { type: 'goto', to: resolvedPosition }. Delete string dispatch.
3. @km/tui/src/board/board-actions.ts — Add VerbAction handler with executeVerb(). For now only handles type='goto'. Delete GOTO_BOARD, JUMP_TO_FAVORITE cases + handleGotoBoard, handleJumpToFavorite.
4. ZOOM_IN always sets cursorNodeId (no more inconsistency — goto resolves cursor from Position).
5. Tests — Update verb-locations tests.

## Delete
GotoBoardAction, JumpToFavoriteAction, handleGotoBoard, handleJumpToFavorite, string dispatch in goTo()

## /complete
- grep -r 'GOTO_BOARD\|JUMP_TO_FAVORITE' packages/@km/_orphan/commands/src/ apps/@km/tui/src/board/ → 0
- grep -r 'handleGotoBoard\|handleJumpToFavorite' apps/@km/tui/ → 0
- grep 'ZOOM_IN.*nodeId' apps/@km/tui/src/board/ | grep -v cursorNodeId → 0 (all ZOOM_IN dispatch sets cursor)
- All tests pass