---
id: "@km/term-2/6-define-and-expose-inkx-chalkx-apis-needed-by-dotzr"
aliases:
  - km-term-2.6
  - km-term-2-6
  - "@km/term-2/6"
created_at: 2026-01-28T13:55:23Z
closed_at: 2026-01-28T14:03:12Z
assignee: claude:df8d3459
---

# [x] Define and expose inkx/chalkx APIs needed by DotzReporter in term/tui @km/term-2 #feature #P2 @claude:df8d3459

## Context

All APIs needed by DotzReporter are already available in @beorn/tui:

### Layout Engine
- `createFlexxEngine()`, `setLayoutEngine()`, `isLayoutEngineInitialized()`

### Render Functions  
- `render()`, `renderSync()`, `renderString()`

### React Components
- `Box`, `Text`, `Spacer`, `Newline`, `Static`, `Console`

### React Hooks
- `useApp()`, `useInput()`, `useTerm()`, `useConsole()`, `useContentRect()`

### Utilities
- `stripAnsi()`, `displayLength()`, `curlyUnderline()`, `hyperlink()`

## Problem

The module resolution bug (@km/_orphan/infra-tui-inkx-module) causes @beorn/tui's re-exports from inkx to create separate module instances. This breaks:
- Layout engine state sharing
- React component identity
- Context propagation

## Solution

Once @km/term-2/5-remove-cross-dependencies-tui-term-must-not-depend removes cross-dependencies properly, DotzReporter can import everything from @beorn/tui only.

## Acceptance Criteria

- [ ] DotzReporter imports all APIs from @beorn/tui only
- [ ] No module identity issues (single inkx instance)
- [ ] renderString() works with useTerm() in components