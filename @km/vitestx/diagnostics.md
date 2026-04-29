---
id: "@km/vitestx/diagnostics"
aliases:
  - km-vitestx.diagnostics
  - km-vitestx-diagnostics
created_at: 2026-02-04T17:00:05Z
closed_at: 2026-02-04T21:14:55Z
---

# [x] Diagnostic testing infrastructure for inkx apps @km/vitestx #feature #P2 @claude:10db6ea8

AI-driven diagnostic testing for @km/tui. Simple API for debugging and fuzz testing.

## Core API

```typescript
import { createTestBoard } from '@km/tui/test'

const board = createTestBoard(["Col > Task A", "Col > Task B"])
board.press("j")
expect(board.text).toContain("Task B")
expect(board.cursor.card).toBe(1)
```

## What's Done
- `createTestBoard()` with string DSL
- `board.press()`, `board.search()`, `board.type()`
- Direct state: `board.text`, `board.cursor`, `board.nodeId`, `board.viewMode`
- Spatial helpers: `board.columns()`, `board.cards()`, `board.at(selector)`
- Fuzz tests in navigation-fuzz.fuzz.ts

## What's Next
- Better examples in skill docs
- Validate with real bug debugging
- Simplify invariants to just expect() calls

## Deferred
- Generalize to inkx (wait until we have 2+ consumers)