---
id: "@km/cmd/8-integrate-km-commands-with-km-sh"
aliases:
  - km-cmd.8
  - km-cmd-8
  - "@km/cmd/8"
created_at: 2026-01-17T23:24:23Z
closed_at: 2026-01-19T11:33:25Z
---

# [x] Integrate @km/commands with km-sh @km/cmd #task #P3

## Goal
@km/_orphan/sh becomes thin shell around @km/commands.

## Shell-Specific (stay in @km/_orphan/sh)
- state, view, help, quit/exit/q
- pwd, ls, cd, tree, cat

## Board Commands (move to @km/commands)
- All cursor_*, nav_*, select_*, fold_*, shift_*

## Acceptance Criteria
- [ ] @km/_orphan/sh uses @km/commands for board commands
- [ ] All mdtest files pass
- [ ] Shell-specific commands still work
- [ ] help shows commands from unified registry
