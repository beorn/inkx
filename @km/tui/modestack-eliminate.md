---
id: "@km/tui/modestack-eliminate"
aliases:
  - km-tui.modestack-eliminate
  - km-tui-modestack-eliminate
created_by: Bjørn Stabell
created_at: 2026-04-09T14:30:36Z
closed_at: 2026-04-09T15:01:44Z
close_reason: "Refactor was completed by another session in main worktree
  (uncommitted). Verified clean: 0 type errors, board-view 20/20 pass. Committed
  as bbe3eb91f. Net -535 lines (-628 deletions, +93 insertions). dialog-guard.ts
  moved InputMode union locally, installDialogGuard(fm) replaces
  bindFocusManager. ModeStack type, createModeStack factory, and standalone
  tests all deleted."
owner: bjorn@stabell.org
---

# [x] Delete ModeStack — FocusManager scope stack is the single source @km/tui #task #P2

## What

Delete apps/@km/tui/src/input-mode.ts and have dialog-guard.ts use FocusManager.scopeStack directly. ModeStack is now a parallel layer that duplicates FocusManager's scope stack.

## Why

@km/tui/inscope-commands migrated all dialog keybindings to inScope() predicates reading from FocusManager.scopeStack. ModeStack is no longer the command routing source — it's just a thin adapter that delegates to FocusManager via bindFocusManager(). Time to delete the adapter.

## Migration

1. Delete apps/@km/tui/src/input-mode.ts (ModeStack type + createModeStack)
2. Update dialog-guard.ts to use FocusManager.enterScope/exitScope directly (no adapter)
3. Update pushDialogMode/popDialogMode to be thin wrappers around FocusManager
4. Update InputMode type import sites to use scope ID strings directly
5. Remove bindFocusManager() since the FocusManager IS the stack

## Acceptance Criteria

- [ ] apps/@km/tui/src/input-mode.ts deleted
- [ ] dialog-guard.ts uses FocusManager directly
- [ ] All tests pass
- [ ] grep ModeStack → 0 hits (except maybe one import removal)
- [ ] grep bindFocusManager → 0 hits