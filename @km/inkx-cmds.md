---
mentions:
  - km
id: "@km/inkx-cmds"
aliases:
  - km-inkx-cmds
  - "@km/_orphan/inkx-cmds"
created_at: 2026-02-04T15:39:58Z
closed_at: 2026-02-06T11:51:05Z
---

# [x] TRACKING: inkx command driver & AI automation @km/inkx-cmds #epic #P1

Command driver system for AI/test TUI automation.

## Children (Priority Order)

| Bead                             | What                               | Priority |
| -------------------------------- | ---------------------------------- | -------- |
| @km/silvery-legacy-cmds/ai-spike | AI agent wiring for /explore       | P1       |
| @km/silvery-legacy-cmds/state    | Rich state capture for debugging   | P2       |
| @km/silvery-legacy/driver/1      | Input Layer Stack (focus/bubbling) | P2       |
| @km/silvery-legacy-cmds/fuzz     | Fuzz testing infrastructure        | P3       |

## Completed

- @km/silvery-legacy/driver-spike: withCommands + withKeybindings plugins

## Infrastructure

- withCommands: app.cmd.down() with metadata
- withKeybindings: press('j') → command routing
- app.getState(): { screen, commands, focus } for AI

## Use Cases

1. Bug reproduction - headless TUI driving
2. AI-driven exploration - /explore skill integration
3. Fuzz testing - random command execution with invariant checks
4. Debugging sessions - step through, inspect state

## Research

docs/future/inkx-command-api-research.md

