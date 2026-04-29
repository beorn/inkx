---
id: "@km/cmd/2-migrate-navigation-commands-to-km-commands"
aliases:
  - km-cmd.2
  - km-cmd-2
  - "@km/cmd/2"
created_at: 2026-01-17T23:23:41Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Migrate navigation commands to @km/commands @km/cmd #task #P2

## Commands to Migrate

### Cursor Movement
- cursor_up/down (visual), cursor_prev/next (structural)
- cursor_in/out (child/parent), cursor_first/last

### Cross-Column & History
- nav_cross_column_left/right
- nav_back/forward

### Zoom
- zoom_in, zoom_out, nav_to_path

## Source Files
- Board.tsx keyboard handlers
- @km/_orphan/repl/src/commands.ts, commandParser.ts

## Acceptance Criteria
- [ ] All navigation commands in @km/commands
- [ ] Commands return correct BoardAction types
- [ ] Unit tests for each command
