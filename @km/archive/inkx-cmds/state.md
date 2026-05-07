---
mentions:
  - km
  - claude
id: "@km/inkx-cmds/state"
aliases:
  - km-inkx-cmds.state
  - km-inkx-cmds-state
created_at: 2026-02-04T15:40:18Z
closed_at: 2026-02-05T07:43:35Z
assignee: claude:10db6ea8
---

# [x] Rich state capture for TUI debugging @km/inkx-cmds #feature #P2 @claude:10db6ea8

## Goal

Migrate Board to createApp() pattern. State lives in Zustand store, driver reads it directly.

## Target Architecture

```typescript
const boardApp = createApp(
  ({ term }) => (set, get) => ({
    rootId: null,
    cursorNodeId: null,
    foldedNodes: new Set(),
    moveMode: false,
    viewMode: 'cards',
    showSearchDialog: false,
    // ...
  }),
  { 'term:key': ({ input, key }, { set, get }) => { ... } }
)

// Driver reads store directly
const state = app.store.getState()
```

## Files to Modify

1. `apps/km-tui/src/board-app.ts` (new) - createApp() definition
2. `apps/km-tui/src/views/Board.tsx` - use useApp(selector), remove useReducer
3. `apps/km-tui/src/driver.ts` - use app.store.getState() directly

## Delete from driver.ts

- TUIDriverState, CursorPosition, DialogState, SelectedNodeInfo
- All extract*() functions

