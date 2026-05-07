---
mentions:
  - km
  - km
id: "@km/cmd/7-integrate-km-commands-with-board-tsx"
aliases:
  - km-cmd.7
  - km-cmd-7
  - "@km/cmd/7"
created_at: 2026-01-17T23:24:17Z
closed_at: 2026-01-19T11:33:25Z
---

# [x] Integrate @km/commands with Board.tsx @km/cmd #task #P2

## Goal

Replace ~800 lines of if/else keyboard handling with unified command system.

## Target State

```typescript
function handleKeyboardInput(input, key) {
  const ctx = buildCommandContext(state, ui, storage);
  const commandId = resolveKeybinding(input, modifiers, kbCtx);
  if (!commandId) return;
  
  const actions = executeCommand(commandId, ctx);
  for (const action of actions) dispatchAction(action);
}
```

## Migration Strategy

1. Parallel implementation with feature flag
2. Progressive migration: Navigation → Selection → Edit → Task → View
3. Delete legacy code, Board.tsx keyboard section < 100 lines

## Acceptance Criteria

- [ ] handleKeyboardInput uses command system
- [ ] All existing keybindings work
- [ ] Visual regression tests pass
- [ ] Board.tsx keyboard section < 100 lines

