---
id: "@km/_orphan/jbxp"
aliases:
  - km-jbxp
created_at: 2026-01-19T14:50:54Z
closed_at: 2026-01-19T14:59:50Z
---

# [x] Create ColumnsLayout derivation layer for TUI @km/_orphan #task #P2

Create a pure function that derives columns layout from @km/board BoardState.

```typescript
interface ColumnsLayout {
  columns: Array<{
    node: TNode;
    cards: Array<{ node: TNode; children: TNode[] }>;
    wipLimit?: number;
    rules?: ColumnRules;
  }>;
  colIndex: number;   // Derived from cursor TPath
  cardIndex: number;  // Derived from cursor TPath
}

function deriveColumnsLayout(state: BoardState): ColumnsLayout
```

This replaces buildBoardState() which currently queries storage.
Instead, derive layout from the already-loaded TNode tree.

Key insight: columns = nodes at depth 0, cards = nodes at depth 1