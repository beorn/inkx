---
id: "@km/_orphan/commands-move-types"
aliases:
  - km-commands-move-types
created_at: 2026-01-25T12:29:28Z
closed_at: 2026-01-25T12:40:05Z
assignee: unimac
---

# [x] Fix move mode command action types @km/_orphan #task #P3 @unimac

The move mode commands (ENTER_MOVE_MODE, CONFIRM_MOVE, CANCEL_MOVE) return partial action types that don't match the full BoardAction types.

**Problem**: Commands return `{ type: 'ENTER_MOVE_MODE' }` but BoardAction expects `{ type: 'ENTER_MOVE_MODE'; nodeIds: string[]; cursorNodeId: string | null }`.

The TUI augments these actions with context before dispatching to the board reducer.

**Current workaround**: edit.ts uses `: CommandDef` annotation instead of `satisfies` to allow this mismatch.

**Proper fix**:
1. Create separate CommandAction types for move mode (without nodeIds/cursorNodeId)
2. Have TUI handler explicitly convert CommandAction → BoardAction with context
3. Update type unions to reflect this two-stage dispatch pattern

**Files affected**:
- packages/@km/_orphan/commands/src/commands/edit.ts
- packages/@km/_orphan/commands/src/types.ts
- packages/@km/_orphan/board/src/board-types.ts
- apps/@km/tui/src/board-actions.ts