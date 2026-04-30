---
id: "@km/inbox/cuqe"
aliases:
  - km-cuqe
  - "@km/_orphan/cuqe"
created_at: 2026-01-17T23:16:08Z
closed_at: 2026-01-17T23:18:31Z
---

# [x] Add undo/redo support to command system @km/_orphan #task #P3

## Goal
Integrate undo/redo with the command system so all mutations can be undone.

## Current State

- Undo/redo exists in `useTreeState` hook (Board.tsx)
- History stack of BoardState snapshots
- Ctrl+Z / Ctrl+Shift+Z keybindings
- Only works for some state changes

## Design

### Command Wrapper

```typescript
interface CommandExecution {
  commandId: string;
  timestamp: number;
  beforeState: BoardState;
  afterState: BoardState;
  actions: AnyAction[];
}

// History stack
const history: CommandExecution[] = [];
let historyIndex = -1;

export function executeWithHistory(
  commandId: string,
  ctx: CommandContext,
  dispatch: (action: AnyAction) => void
): void {
  const beforeState = ctx.boardState;
  const actions = executeCommand(commandId, ctx);
  
  if (!actions) return;
  
  // Apply actions
  const actionsArray = Array.isArray(actions) ? actions : [actions];
  for (const action of actionsArray) {
    dispatch(action);
  }
  
  // Record in history
  const afterState = getCurrentState(); // After dispatch settles
  history.splice(historyIndex + 1); // Truncate redo stack
  history.push({
    commandId,
    timestamp: Date.now(),
    beforeState,
    afterState,
    actions: actionsArray,
  });
  historyIndex++;
}
```

### Undo Implementation

```typescript
export function undo(dispatch: (action: AnyAction) => void): boolean {
  if (historyIndex < 0) return false;
  
  const entry = history[historyIndex];
  historyIndex--;
  
  // Restore previous state
  dispatch({ type: "RESTORE_STATE", state: entry.beforeState });
  
  // For storage actions, need to reverse them
  for (const action of entry.actions.reverse()) {
    if (isTAction(action)) {
      reverseStorageAction(action);
    }
  }
  
  return true;
}

export function redo(dispatch: (action: AnyAction) => void): boolean {
  if (historyIndex >= history.length - 1) return false;
  
  historyIndex++;
  const entry = history[historyIndex];
  
  // Re-apply actions
  for (const action of entry.actions) {
    dispatch(action);
  }
  
  return true;
}
```

### Storage Action Reversal

For persistent mutations, need inverse operations:
```typescript
function reverseStorageAction(action: TAction): void {
  switch (action.type) {
    case "UPDATE_NODE":
      // Need to track previous values to restore
      // This requires storing before/after for each field
      break;
    case "DELETE_NODE":
      // Need to restore deleted node
      // Requires keeping deleted node data
      break;
    case "MOVE_NODE":
      // Move back to original parent/order
      break;
  }
}
```

## Challenges

1. **Storage mutations are immediate** - need to queue or wrap
2. **Async refresh** - setTimeout pattern complicates state tracking
3. **Multi-action commands** - need to group for undo
4. **File sync** - bidirectional sync means undo needs file reversal too

## Acceptance Criteria
- [ ] Ctrl+Z undoes last command
- [ ] Ctrl+Shift+Z / Ctrl+Y redoes
- [ ] Works for navigation commands
- [ ] Works for edit commands (move, indent)
- [ ] Works for task status changes
- [ ] History persists during session
- [ ] Visual indicator shows undo availability
