---
mentions:
  - km
id: "@km/tui/console-toggle-broken"
aliases:
  - km-tui.console-toggle-broken
  - km-tui-console-toggle-broken
created_by: Bjørn Stabell
created_at: 2026-03-31T02:04:31Z
closed_at: 2026-04-01T06:33:10Z
close_reason: Board.tsx used useApp() which created a snapshot with undefined
  pause/resume. Switched to useRuntime() for lazy access to the mutable context
  object. Backtick now toggles to normal screen correctly.
owner: bjorn@stabell.org
---

# [x] [bug] Backtick console toggle not working @km/tui #bug #P2

## Problem

User reports backtick (\`) doesn't toggle to normal screen and back.

## Investigation

The keybinding chain is complete:

- \` → console.toggle (keybindings.ts:517)
- console.toggle → CONSOLE_TOGGLE (commands/tui.ts:150)
- CONSOLE_TOGGLE → setUI({ showConsole: !prev }) (board-actions.ts:1562)
- useEffect exits alt screen when showConsole=true (Board.tsx:649-665)

Tests pass (production-entry.slow.spec.ts:145). The state toggles correctly
in test. Could be a runtime issue:

- Chord system consuming the \` keypress
- A dialog or text input intercepting it
- pause/resume undefined in some code path

## Next Steps

Reproduce in the real TUI with debug logging:
DEBUG=km:tui:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault
Press \` and check if CONSOLE_TOGGLE action fires.

