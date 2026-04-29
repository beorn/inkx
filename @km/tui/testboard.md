---
id: "@km/tui/testboard"
aliases:
  - km-tui.testboard
  - km-tui-testboard
created_at: 2026-02-04T16:54:26Z
closed_at: 2026-02-04T16:56:38Z
---

# [x] TUI: createTestBoard() - single entry point for AI/test diagnostics @km/tui #feature #P2 @claude:10db6ea8

Simplify TUI testing API to a single discoverable entry point.

## Goal
AI agents need one simple function to test/debug the TUI:
```typescript
import { createTestBoard } from '@km/tui/test'
const board = createTestBoard(["Inbox > Task 1", "Projects > Alpha"])
board.press("j")
board.check()  // Run invariants
```

## Current State
We have `board.app()` in `apps/km-tui/tests/helpers/board-app.ts` which is good but:
- Buried in helpers directory
- Name isn't obvious for AI discovery
- Could be simpler

## Plan
1. Export `createTestBoard()` from `apps/km-tui/src/test.ts`
2. Re-export as `@km/tui/test` path alias
3. Update skill docs to show the simple API
4. Keep invariants automatic (default behavior)

## Generalization Path
Prototype with @km/tui, then consider extracting pattern to inkx:
- `createTestApp(component, options)` in inkx/testing
- Apps provide their own invariants
- AI agents have consistent pattern across all inkx apps