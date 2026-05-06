---
mentions:
  - km
  - km
id: "@km/inbox/o3qa"
aliases:
  - km-o3qa
  - "@km/_orphan/o3qa"
created_at: 2026-01-17T23:20:04Z
closed_at: 2026-01-17T23:22:46Z
---

# [x] [km-cmd.4] Migrate selection commands to @km/commands @km/_orphan #task #P2

## Goal

Move all selection commands from Board.tsx to the unified command registry.

## Commands to Migrate

### Basic Selection

- `select_toggle` - toggle selection on current node (v)
- `select_add` - add node to selection
- `select_remove` - remove node from selection
- `clear_selection` - clear all selections (Esc)

### Multi-Select

- `select_all_siblings` - select all siblings (V)
- `select_all` - select all visible (Ctrl+A)

### Range Selection (Shift+direction)

- `extend_select_up` / `extend_select_down`
- `extend_select_left` / `extend_select_right`

### Progressive Select

- `progressive_select_all` - progressive selection across levels (from Board.tsx)

## Source Files

- `apps/km-tui/packages/km-ink/src/views/Board.tsx`:
  - `progressiveSelectAll()` - lines ~2368-2431
  - Various keyboard handlers for selection
- `apps/km-repl/src/commands.ts` - existing CommandDef entries
- `apps/km-repl/src/commandParser.ts` - SIMPLE_ACTIONS

## Implementation

```typescript
export const selectToggle: CommandDef = {
  id: "select_toggle",
  name: "Toggle Selection",
  description: "Toggle selection on current node",
  category: "Selection",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return { type: "SELECT_NODE_TOGGLE", nodeId: ctx.currentNodeId };
  },
};

export const progressiveSelectAll: CommandDef = {
  id: "progressive_select_all",
  name: "Progressive Select All",
  description: "Select all at current level, then parent level, then board",
  category: "Selection",
  execute: (ctx) => {
    // Level 0: select all items in current outline
    // Level 1: select all items in current column
    // Level 2: select all items in board
    const level = ctx.selectAllLevel ?? 0;
    // ... compute appropriate selection action
  },
};
```

## Acceptance Criteria

- [ ] All selection commands registered in @km/commands
- [ ] Commands return BoardAction types
- [ ] Progressive selection logic extracted from Board.tsx
- [ ] Unit tests for each command
- [ ] Works with multi-select state tracking

