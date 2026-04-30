---
id: "@km/inbox/5akw"
aliases:
  - km-5akw
  - "@km/_orphan/5akw"
created_at: 2026-01-19T15:14:29Z
closed_at: 2026-01-19T15:19:02Z
---

# [x] O1: Command Context Consolidation @km/_orphan #task #P2

Build TUIContext once per input event, pass to all handlers.

Current state:
- keyboard-handler.ts builds KeyboardContext
- command-bridge.ts builds CommandContext  
- Both reconstruct similar data redundantly

Proposed:
```typescript
interface TUIContext {
  boardState: TreeBoardState;
  ui: UIState;
  layout: ColumnsLayout;
  selectedNode: TNode | null;
  dispatch: Dispatch<UIAction>;
  dispatchBoard: Dispatch<BoardAction>;
}
```

Build once in Board.tsx, pass to all handlers.