---
mentions:
  - km
  - claude
id: "@km/tui/slow-test-failures"
aliases:
  - km-tui.slow-test-failures
  - km-tui-slow-test-failures
created_by: claude:ceb7c9cb
created_at: 2026-03-29T01:58:11Z
closed_at: 2026-03-29T02:51:29Z
close_reason: "Fixed 11 of 84 failures: CLI help colorization, indent/outdent
  cursor assertions, column move verification, tab cursor expectation. Remaining
  73 are vendor (silvery keybinding-matrix 65, OSC 8 hyperlinks 7, incremental
  render 1)."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Pre-existing slow test failures — dialogs, ANSI replay, keybinding matrix @km/tui #bug #P2 @claude:ceb7c9cb

## Problem

117 slow test failures across 18 files. All pre-existing (before @km/core/slate-interfaces refactor). Fast tests (4821) pass.

## Categories

1. **Dialog/command dispatch (omnibox, help, search, filter, date, favorites)** — ~60 failures
- `board.command("command_palette")` executes but dialog doesn't appear
- Screen shows "Unmapped key: :" instead of command palette
- `pressKey(":")` in test framework may not resolve to `shift-;` → `command_palette`
- Files: omnibox.slow, board-spec.slow, escape-layering.slow, date.slow, production-entry.slow
7. **ANSI replay mismatches** — ~3 failures
- breadcrumb.slow: ANSI replay doesn't match buffer after h/l navigation
- File: breadcrumb.slow.test.ts
11. **Zoom cursor preservation** — ~5 failures
- board-zoom.slow: cursor not preserved after zoom in/out
- File: board-zoom.slow.spec.ts
15. **Keybinding matrix (vendor)** — ~26 failures
- Shift key mismatch in legacy ANSI roundtrip
- File: vendor/silvery/tests/keybinding-matrix.slow.test.ts
19. **Ghost chars / incremental rendering** — ~5 failures
- STRICT_OUTPUT mismatches (known silvery rendering bugs)
- Files: diag-ghost-chars.slow, fold.slow, curswanty-combinatorial.slow
23. **mdtest-e2e (vendor)** — 1 failure
- Internal mdtest error, not our code
26. **CLI spec tests** — ~3 failures
- km --help, km agent --help output mismatch
- Files: km.slow.spec.md, agent.slow.spec.md

## Root Cause Hypothesis

Category 1 (biggest): The test framework's `pressKey(":")` may not correctly synthesize Shift+semicolon, or the keybinding resolver's `shift-;` mapping isn't reached in the test TermProvider. This broke at some point before the slate-interfaces work.

## /complete

- `bun vitest run --project slow 2>&1 | grep "FAIL" | wc -l` → 0

