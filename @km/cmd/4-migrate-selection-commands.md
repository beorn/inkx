---
id: "@km/cmd/4-migrate-selection-commands"
aliases:
  - km-cmd.4
  - km-cmd-4
  - "@km/cmd/4"
created_at: 2026-01-17T23:23:55Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Migrate selection commands @km/cmd #task #P2

## Commands to Migrate

### Basic Selection
- select_toggle (v), select_add, select_remove
- clear_selection (Esc)

### Multi-Select
- select_all_siblings (V), select_all (Ctrl+A)

### Range Selection
- extend_select_up/down/left/right (Shift+direction)

### Progressive Select
- progressive_select_all (from Board.tsx)

## Acceptance Criteria
- [ ] All selection commands in @km/commands
- [ ] Progressive selection logic extracted
- [ ] Unit tests for each command
