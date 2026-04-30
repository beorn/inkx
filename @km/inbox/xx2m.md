---
id: "@km/inbox/xx2m"
aliases:
  - km-xx2m
  - "@km/_orphan/xx2m"
created_at: 2026-01-17T23:14:29Z
closed_at: 2026-01-17T23:18:30Z
---

# [x] Migrate navigation commands to @km/commands @km/_orphan #task #P2

## Goal
Move all navigation-related commands from Board.tsx and @km/_orphan/repl to the unified command registry.

## Commands to Migrate

### Cursor Movement
- `cursor_up` / `cursor_down` - visual up/down
- `cursor_prev` / `cursor_next` - structural prev/next sibling
- `cursor_in` / `cursor_out` - into child / to parent
- `cursor_first` / `cursor_last` - first/last sibling

### Cross-Column Navigation
- `nav_cross_column_left` / `nav_cross_column_right`

### History
- `nav_back` / `nav_forward` - navigation history
- `nav_push` - push current position to history (internal)

### Zoom
- `zoom_in` - focus on current node as root
- `zoom_out` - return to parent context
- `zoom_to` - zoom to specific node (internal)

### View Navigation
- `nav_to_path` - navigate to specific path

## Source Files
- `apps/km-tui/packages/km-ink/src/views/Board.tsx` - keyboard handlers
- `apps/km-repl/src/commands.ts` - CommandDef array
- `apps/km-repl/src/commandParser.ts` - SIMPLE_ACTIONS map

## Implementation

Each command becomes a CommandDef:
```typescript
export const cursorUp: CommandDef = {
  id: "cursor_up",
  name: "Move Up",
  description: "Move cursor to visually previous item",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "up" }),
};
```

For commands needing context:
```typescript
export const zoomIn: CommandDef = {
  id: "zoom_in",
  name: "Zoom In",
  description: "Focus on current node as root",
  category: "Navigation",
  execute: (ctx) => {
    if (\!ctx.currentNodeId || \!ctx.currentNode) return null;
    return { 
      type: "ZOOM_IN", 
      nodeId: ctx.currentNodeId,
      nodes: [ctx.currentNode, ...ctx.currentNode.children]
    };
  },
};
```

## Acceptance Criteria
- [ ] All navigation commands registered in @km/commands
- [ ] Commands return correct BoardAction types
- [ ] Context-dependent commands use CommandContext properly
- [ ] Shortcuts documented in command definitions
- [ ] Unit tests for each command
