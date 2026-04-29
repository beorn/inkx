---
id: "@km/_orphan/smj9"
aliases:
  - km-smj9
created_at: 2026-01-17T20:33:41Z
closed_at: 2026-01-17T20:49:12Z
---

# [x] Refactor Board.tsx to use useReducer for UI state @km/_orphan #task #P2

Board.tsx has ~25 useState hooks deeply intertwined with input handlers. This makes extracting handlers impossible without passing many setters.

## Problem

```typescript
// Current: 25+ useState hooks
const [showHelp, setShowHelp] = useState(false);
const [viewMode, setViewMode] = useState<ViewMode>("cards");
const [showDetailPane, setShowDetailPane] = useState(false);
// ... 20+ more

// Handlers call multiple setters
useInput((input, key) => {
  if (input === "?") setShowHelp(true);
  if (input === "v") setViewMode(...);
  // etc
});
```

Extracting handlers requires passing all these setters, which is a code smell.

## Solution

Migrate UI state to useReducer pattern:

```typescript
type UIAction = 
  | { type: "TOGGLE_HELP" }
  | { type: "CYCLE_VIEW_MODE" }
  | { type: "SHOW_DETAIL_PANE"; show: boolean }
  // ...

const [uiState, dispatch] = useReducer(uiReducer, initialUIState);

// Handlers just dispatch actions
useInput((input, key) => {
  if (input === "?") dispatch({ type: "TOGGLE_HELP" });
  if (input === "v") dispatch({ type: "CYCLE_VIEW_MODE" });
});
```

## Benefits

1. Handlers become thin dispatch wrappers - easily extracted
2. State transitions are centralized and testable
3. Actions can be serialized for debugging/replay
4. Reducer can be extracted to separate file

## Implementation Steps

1. Create UIState type and UIAction union type
2. Write uiReducer function
3. Replace useState hooks with single useReducer
4. Update handlers to dispatch actions
5. Extract handlers to separate file (now trivial)

## Related

Parent issue: @km/tui1/1-decompose-board-tsx-2804-lines (Decompose Board.tsx)