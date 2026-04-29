---
id: "@km/tui/inscope-commands"
aliases:
  - km-tui.inscope-commands
  - km-tui-inscope-commands
created_by: Bjørn Stabell
created_at: 2026-04-09T07:22:14Z
closed_at: 2026-04-09T07:28:47Z
close_reason: All dialog keybindings migrated from boolean flags to
  inScope()/inDialog predicates. Zero old guards remain. Local find +
  search/replace now push dialog modes. 540 km-commands tests pass. Commit
  b37e36665.
---

# [x] Wire inScope() to dialog commands — replace manual mode guards @km/tui #task #P2 @Bjørn Stabell

## What

Replace `when: inDialogSearch`, `when: inDialogConfirm`, etc. with `when: inScope("dialog:search")`, `when: inScope("dialog:confirm")` in command definitions.

## Why

The plumbing is 100% done:
- `activeScopes` populated from FocusManager.scopeStack (command-bridge.ts:111)
- `inScope(scopeId)` predicate defined (when.ts:126)
- Zero commands use it — all dialogs still use manual `inDialog*` boolean guards

This is the keystone that unlocks ModeStack elimination. Focus scope IS the command context.

## Acceptance Criteria

- [ ] All dialog commands use `inScope()` instead of `inDialog*` predicates
- [ ] `grep inDialogSearch packages/km-commands/src/commands/ → 0` (replaced by inScope)
- [ ] `grep inDialogConfirm packages/km-commands/src/commands/ → 0`
- [ ] `grep inDialogRename packages/km-commands/src/commands/ → 0`
- [ ] `grep inDialogNewItem packages/km-commands/src/commands/ → 0`
- [ ] `grep inDialogPicker packages/km-commands/src/commands/ → 0`
- [ ] `grep inDialogDatePrompt packages/km-commands/src/commands/ → 0`
- [ ] `grep inDialogFilter packages/km-commands/src/commands/ → 0`
- [ ] All tests pass
- [ ] Help overlay still shows correct when-clause labels