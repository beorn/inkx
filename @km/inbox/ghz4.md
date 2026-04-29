---
id: "@km/_orphan/ghz4"
aliases:
  - km-ghz4
created_at: 2026-01-19T14:50:41Z
closed_at: 2026-01-19T14:58:48Z
---

# [x] Add TPath-to-column/card index derivation in @km/board @km/_orphan #task #P2

Add utility to convert TPath cursor to (columnIndex, cardIndex) for TUI rendering.

The @km/board BoardState uses TPath for cursor, but TUI needs column/card indices for:
- Array-based virtualization
- Horizontal scroll offset calculation  
- Multi-selection key generation

Add to @km/board:
```typescript
function pathToIndices(path: TPath, nodes: TNode[]): { colIndex: number; cardIndex: number; subPath: TPath }
function indicesToPath(colIndex: number, cardIndex: number, subPath: TPath, nodes: TNode[]): TPath
```

This keeps TPath as source of truth but provides indices for rendering.