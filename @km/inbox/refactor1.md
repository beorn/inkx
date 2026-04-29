---
id: "@km/_orphan/refactor1"
aliases:
  - km-refactor1
created_at: 2026-01-21T23:10:50Z
closed_at: 2026-01-22T11:43:20Z
---

# [x] Architecture Review: Command System & TUI Refactoring @km/_orphan #epic #P2

# Architecture Review Epic

Tracking bead for findings from the 2026-01-21 architecture review focused on command system, TUI layer, and documentation drift.

## Core Problem

Board.tsx (2169 lines) combines keyboard handling, action dispatch, state management, and rendering. Commands return descriptors interpreted by a giant switch statement. Modal context handling is fragmented.

## Target Architecture

- **CmdContext** with context stack (dialog → pane → board → app)
- **Executable commands** - functions taking CmdContext, not returning descriptors
- **Mode-aware bindings** - declare which context layer(s) they apply to
- **Single useInput** - context stack handles routing
- **Board.tsx → ~100 lines** - just composition

See @km/_orphan/mz2g for full design.

## Beads

### Critical (P1)
- @km/_orphan/jedj: Doc/code mismatch: enter_node/go_up_path commands don't exist
- @km/_orphan/1ihv: No tests for config.ts (7 exported functions)
- @km/_orphan/7i3e: Command system needs modal context for keybindings

### High (P2)
- @km/_orphan/3zo1: CLI docs describe unimplemented features
- @km/_orphan/5efp: Duplicated getNodeAtPath/getSiblingCount in @km/_orphan/board
- @km/_orphan/sl3a: No tests for @km/_orphan/agent query functions

### Medium (P3)
- @km/_orphan/mz2g: Board.tsx refactor (CmdContext + context stack design) ⭐ KEY
- @km/_orphan/im3r: Undocumented commands: zoom_inwards, zoom_out, select_all_progressive
- @km/_orphan/3zd7: Unclear responsibility split: parser.ts vs ast2nodes.ts
- @km/_orphan/nfy3: Confusing watch module naming: watcher-worker vs worker-watcher
- @km/_orphan/b6jl: Add tests for CalDAV/CardDAV client classes
- @km/_orphan/vzeg: Reconsider DI approach for TUI components

### Low (P4)
- @km/_orphan/esi2: Missing event type in docs: task_released
- @km/_orphan/b18e: Refactor board-reducer.ts (789 lines)
- @km/_orphan/vqjx: Evaluate SlateJS data model adoption

## Dependencies

```
km-7i3e (modal context) ──blocks──▶ km-mz2g (Board.tsx refactor)
km-mz2g ──related──▶ km-b18e (board-reducer refactor)
km-mz2g ──related──▶ km-vzeg (DI approach)
```

## Quick Wins

1. @km/_orphan/jedj: Fix doc command names (5 min)
2. @km/_orphan/im3r: Add missing commands to docs (10 min)
3. @km/_orphan/esi2: Add task_released to event docs (5 min)

## Larger Refactors

1. @km/_orphan/mz2g: Board.tsx + command system (~2-3 days)
2. @km/_orphan/3zd7: parser.ts/ast2nodes.ts clarification (~1 day)
3. @km/_orphan/1ihv + @km/_orphan/sl3a + @km/_orphan/b6jl: Test coverage (~1 day)