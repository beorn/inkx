---
id: "@km/commands/resolve-at-dispatch"
aliases:
  - km-commands.resolve-at-dispatch
  - km-commands-resolve-at-dispatch
created_by: claude:ceb7c9cb
created_at: 2026-03-28T06:31:15Z
closed_at: 2026-03-28T06:34:16Z
close_reason: All 4 handlers accept Position, resolution at dispatch,
  reparentToNode deleted, -33 net lines
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Resolve Position at dispatch time — eliminate string parsing in verb handlers @km/commands #task #P2 @claude:ceb7c9cb

## Goal

Move locationKey → Position resolution OUT of the 4 verb handlers and INTO the dispatch site. Handlers receive a resolved Position, not a string. This eliminates the repeated string-parsing boilerplate in handleCursorTo/handleReparentTo/handleLinkTo/handleCreateAt.

## Current Flow (7 layers)
```
user presses m j → chord → keybinding → execute() → VerbAction { locationKey: '@journal' }
→ handleReparentTo branches on string → resolves to board → reparentToNode → repo.moveNode
```

## Target Flow (5 layers)
```
user presses m j → chord → keybinding → execute() → VerbAction { locationKey: '@journal' }
→ resolveVerbAction → ResolvedVerb { type: REPARENT_TO, to: Position { parentId, childIdx } }
→ handler receives Position → moveTo(repo, id, pos)
```

## Changes

1. **Resolve at dispatch**: In handleCommandAction, CURSOR_TO/REPARENT_TO/LINK_TO/CREATE_AT cases call resolveLocationKey FIRST, then pass Position to handler
2. **handleCursorTo(ctx, to: Position)**: same-parent → SELECT nodeAt(pos), cross-parent → ZOOM_IN to board
3. **handleReparentTo(ctx, to: Position)**: same-parent → moveTo (reorder), cross-parent → batch moveTo (reparent selection)
4. **handleLinkTo(ctx, to: Position | PickTarget)**: open picker for PickTarget, stub for Position
5. **handleCreateAt(ctx, to: Position)**: stub
6. **Delete reparentToNode**: absorbed into generic batch moveTo path
7. **'parent' stays special-cased**: CURSOR_TO parent → handleZoomOutwards, REPARENT_TO parent → outdentNode. These are fundamentally different operations that share a chord suffix.

## /complete
- grep 'locationKey.*startsWith\|locationKey.*===.*fav\|locationKey.*===.*first\|locationKey.*===.*last' board-actions.ts → 0 (only in 'parent' special case)
- grep reparentToNode board-actions.ts → 0
- handleCursorTo signature takes Position, not string
- handleReparentTo signature takes Position, not string
- All tests pass