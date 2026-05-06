---
mentions:
  - km
id: "@km/inbox/inkx-loop"
aliases:
  - km-inkx-loop
  - "@km/_orphan/inkx-loop"
created_at: 2026-02-01T23:07:03Z
closed_at: 2026-02-04T11:23:53Z
---

# [x] inkx-loop: Layered TUI framework on AsyncIterables @km/_orphan #epic #P1

Implement inkx-loop v0.1 - a layered TUI framework built on AsyncIterables. Like a game loop for terminals: events come in, state updates, view renders.

## Architecture Layers

- Layer 0: layout() / diff() - Pure functions
- Layer 1: createRuntime() - User-driven event loop
- Layer 2: run() - React hooks integration
- Layer 3: createApp() - Zustand store + providers

## Implementation Steps

1. Event stream helpers (merge, map, filter, takeUntil) ✅
2. Extract layout() AND diff() ✅
3. Prototype createRuntime() ✅
4. Time/tick source ✅
5. Prototype Mode 3 (pure functional example) ✅
6. Build Mode 1 (run() React integration) ✅
7. Build Mode 2 (createApp() with Zustand) ✅
8. Migration path — IN PROGRESS (see below)
9. Update documentation ✅

## Step 8: Migration to New Way

### Completed

- [x] createTestRenderer → createRenderer (~57 test files + 14 docs)
- [x] columns: → cols: in renderer options
- [x] app.html → app.ansi in km tests (5 files)

### Remaining: inkx test migration (~818 lastFrame + ~247 stdin.write)

| Old                    | New                      | Count           |
| ---------------------- | ------------------------ | --------------- |
| lastFrame()            | app.ansi                 | ~818 usages     |
| stripAnsi(lastFrame()) | app.text                 | subset of above |
| lastBuffer()           | app.term.buffer          | ~3 usages       |
| stdin.write(key)       | await app.press(keyName) | ~247 usages     |
| frames[]               | remove                   | ~50 usages      |

### Approach

Per docs/lessons/refactoring.md: Break intentionally → let tsc guide fixes.
Phase order: Absorb → Purge → Remove → Fix.

