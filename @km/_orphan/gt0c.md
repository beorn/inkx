---
id: "@km/_orphan/gt0c"
aliases:
  - km-gt0c
created_at: 2026-01-17T23:19:52Z
closed_at: 2026-01-17T23:22:46Z
---

# [x] [km-cmd.3] Migrate edit commands (move, indent, delete) to @km/commands @km/_orphan #task #P2

## Goal
Move all edit/mutation commands from Board.tsx to the unified command registry.

## Commands to Migrate

### Card Movement (within view)
- `move_card_up` / `move_card_down` - reorder within column
- `move_card_left` / `move_card_right` - move between columns
- `move_card_to_column` - move to specific column (1-9)

### Structural Operations
- `indent_node` - make node child of sibling above (Tab)
- `outdent_node` - make node sibling of parent (Shift-Tab)

### CRUD
- `delete_node` - delete current node
- `create_node_sibling` - create sibling (future)
- `create_node_child` - create child (future)

## Source Files
- `apps/km-tui/packages/km-ink/src/views/Board.tsx`:
  - `moveCardInColumn()` - lines ~1980-2100
  - `moveCardToColumn()` - lines ~2104-2186
  - `moveCardToColumnByIndex()` - lines ~2187-2270
  - `indentNode()` - lines ~2273-2310
  - `outdentNode()` - lines ~2313-2365

## Key Challenge

These functions currently:
1. Compute new position using fractional indexing
2. Call storage layer (`moveNode`, `updateNode`)
3. Rebuild board state with `buildBoardState()`
4. Update React state with `setState()`

Commands should NOT do all this. Instead:
1. Command computes the mutation action
2. Returns `TAction` (storage action)
3. Effect layer handles storage + refresh

## Implementation

```typescript
export const moveCardUp: CommandDef = {
  id: "move_card_up",
  name: "Move Card Up",
  description: "Move card up within column",
  category: "Edit",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    const siblings = getSiblingsFromContext(ctx);
    const currentIdx = ctx.siblingIndex;
    if (currentIdx <= 0) return null; // already at top
    
    // Compute new sort_order using fractional indexing
    const prevNode = siblings[currentIdx - 2];
    const targetNode = siblings[currentIdx - 1];
    const newOrder = computeOrderBetween(prevNode?.sort_order, targetNode.sort_order);
    
    return {
      type: "UPDATE_NODE",
      nodeId: ctx.currentNodeId,
      updates: { sort_order: newOrder },
    };
  },
};
```

## Acceptance Criteria
- [ ] All edit commands registered in @km/commands
- [ ] Commands return TAction (storage actions)
- [ ] Fractional indexing logic extracted to shared utility
- [ ] Unit tests for each command with mock context
- [ ] Commands work independently of React component
