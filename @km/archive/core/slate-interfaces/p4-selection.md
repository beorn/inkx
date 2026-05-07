---
mentions:
  - km
  - claude
id: "@km/core/slate-interfaces/p4-selection"
aliases:
  - km-core.slate-interfaces.p4-selection
  - km-core-slate-interfaces-p4-selection
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:18Z
closed_at: 2026-03-28T08:23:40Z
close_reason: Selection namespace created (selection.ts), getSelectedCards and
  getSelectedCardIndices deleted, 5 callers fixed (board-actions.ts x3,
  board-actions-edit.ts x3, keyboard-card-ops.ts x4), docs updated (design.md,
  km-commands/types.ts, 2 test comments), 14 unit tests added
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Phase 4: Selection typed object @km/core #task #P3 @claude:ceb7c9cb

## Goal

Replace raw Set<string> + ad-hoc getSelectedCards(ctx) with a typed Selection namespace. BREAK getSelectedCards — delete it, fix all callers.

## BREAK FIRST

> "If both getSelectedCards() and Selection.nodes() work, agents will use whichever they see first."

Delete getSelectedCards. Every caller switches to Selection.nodes(ctx). No wrapper. No re-export.

## Changes

1. **@km/tui/src/selection.ts** (NEW) — Selection namespace:
- nodes(ctx): KNode[] — the selected nodes (or cursor node)
- nodeIds(ctx): string[]
- isEmpty(ctx): boolean
- contains(ctx, nodeId): boolean
- moveTo(ctx, pos: Position): void — batch move all selected, with undo batching
- forEach(ctx, fn): void — iterate with undo batching built in
9. **DELETE getSelectedCards** from keyboard-helpers.ts
10. **Fix all callers** — tsc-guided, one session

## DRY audit (part of this phase)

After migration, grep for:

- getSelectedCards → 0
- Manual selectedNodes.has + repo.getNode patterns → should use Selection.contains
- Repeated undo batch wrapping around selection iteration → should use Selection.forEach

## /complete

- grep getSelectedCards apps/@km/tui/ → 0 (DELETED)
- grep "Selection\." apps/@km/tui/src/ → >0
- No manual selection iteration outside Selection namespace
- All tests pass

