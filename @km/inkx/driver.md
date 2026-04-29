---
id: "@km/inkx/driver"
aliases:
  - km-inkx.driver
  - km-inkx-driver
created_at: 2026-02-04T14:49:04Z
closed_at: 2026-02-05T10:09:11Z
---

# [x] inkx: Driver abstraction for AI/test automation @km/inkx #feature #P2 @claude:10db6ea8

Enable AI (Claude) and tests to programmatically control any inkx app via commands.

## Key Insight
**The app IS the driver.** No separate abstraction needed.
Commands serve triple duty: keybindings, command palette, AND programmatic control.

## Phased Implementation

| Phase | Bead | What | Priority |
|-------|------|------|----------|
| Spike | @km/silvery-legacy/driver-spike | withCommands + withKeybindings | P1 |
| Docs | @km/silvery-legacy/driver-docs | Review and restructure inkx docs | P2 |
| Split | @km/silvery-legacy/driver-split | Evaluate core vs app split | P3 |
| Migrate | @km/silvery-legacy/driver-migrate | Migrate @km/tui to new patterns | P4 |

## Research
See docs/future/inkx-command-api-research.md