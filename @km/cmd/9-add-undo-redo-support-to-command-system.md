---
mentions:
  - km
id: "@km/cmd/9-add-undo-redo-support-to-command-system"
aliases:
  - km-cmd.9
  - km-cmd-9
  - "@km/cmd/9"
created_at: 2026-01-17T23:24:31Z
closed_at: 2026-01-19T11:33:25Z
---

# [x] Add undo/redo support to command system @km/cmd #task #P3

## Goal

All mutations can be undone via Ctrl+Z / Ctrl+Shift+Z.

## Design

- History stack of CommandExecution { commandId, beforeState, afterState, actions }
- executeWithHistory() wrapper
- undo() restores beforeState + reverses storage actions
- redo() re-applies actions

## Challenges

- Storage mutations are immediate
- Async refresh (setTimeout pattern)
- Multi-action commands need grouping
- File sync bidirectionality

## Acceptance Criteria

- [ ] Ctrl+Z undoes, Ctrl+Shift+Z redoes
- [ ] Works for navigation, edit, task commands
- [ ] History persists during session
- [ ] Visual indicator shows undo availability

