---
id: "@km/_orphan/d3oy"
aliases:
  - km-d3oy
created_at: 2026-01-20T07:43:46Z
closed_at: 2026-01-20T07:46:35Z
---

# [x] Fix docs: boardReducer.ts path error in 09-commands.md @km/_orphan #task #P2

## Problem
docs/09-commands.md:440 references `packages/km-board/src/boardReducer.ts` (camelCase) but the actual file is `board-reducer.ts` (kebab-case).

## Fix
Change line 440 from:
```typescript
// packages/km-board/src/boardReducer.ts
```
To:
```typescript
// packages/km-board/src/board-reducer.ts
```