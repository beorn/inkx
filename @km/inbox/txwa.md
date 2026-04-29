---
id: "@km/_orphan/txwa"
aliases:
  - km-txwa
created_at: 2026-01-20T07:43:35Z
closed_at: 2026-01-20T08:34:22Z
---

# [x] Add tests for ink-adapter.ts (0% coverage) @km/_orphan #task #P2

## Problem
packages/@km/_orphan/commands/src/ink-adapter.ts has 6 public functions with 0 tests:
- initCommandSystem()
- inkKeyToString()
- inkKeyToModifiers()
- processInkKey()
- buildKeybindingContext()
- wouldHandleKey()

## Impact
Keyboard input handling could break without detection.

## Solution
Create packages/@km/_orphan/commands/tests/ink-adapter.test.ts with tests for:
- inkKeyToString() with all key types (arrows, enter, escape, etc.)
- inkKeyToModifiers() for all combinations (ctrl+shift, meta+shift, etc.)
- processInkKey() integration with command context
- buildKeybindingContext() for all mode states