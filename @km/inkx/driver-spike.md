---
id: "@km/inkx/driver-spike"
aliases:
  - km-inkx.driver-spike
  - km-inkx-driver-spike
created_at: 2026-02-04T15:25:02Z
closed_at: 2026-02-04T15:29:57Z
---

# [x] inkx: withCommands + withKeybindings spike @km/inkx #task #P1 @claude:10db6ea8

Minimal implementation to enable app.cmd.down() in tests.

## Files to Create
1. vendor/beorn-inkx/src/with-commands.ts
2. vendor/beorn-inkx/src/with-keybindings.ts
3. apps/@km/tui/tests/driver.test.ts

## Verification
- app.cmd.down() executes cursor movement
- app.cmd.down.id/name/help/keys return metadata
- app.press('j') triggers cmd.down() via keybindings

See docs/future/inkx-command-api-research.md